"""A lightweight subtitle generation backend re-using utilities from the notebook.

This module provides a single function `generate_subtitles(video_path, model_choice, target_langs)`
which extracts audio, runs any available ASR backends (whisper, wav2vec2, silero, nemo, vosk),
and writes English SRTs and translated SRTs (if transformers MarianMT is available).

The implementation is defensive: it tries imports and skips models that are missing.
"""
from pathlib import Path
import contextlib
import wave
import subprocess
import uuid
import os
from typing import List, Dict, Any
import json

try:
    import torch
except Exception:
    torch = None

try:
    import whisper
except Exception:
    whisper = None

try:
    from transformers import pipeline as hf_asr_pipeline
    from transformers import MarianMTModel, MarianTokenizer
except Exception:
    hf_asr_pipeline = None
    MarianMTModel = None
    MarianTokenizer = None

try:
    import nemo.collections.asr as nemo_asr
except Exception:
    nemo_asr = None

def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path

def run_ffmpeg(command: List[str]) -> None:
    completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.decode('utf-8', errors='ignore'))

def extract_audio_ffmpeg(video_path: Path, output_dir: Path, sample_rate: int = 16000) -> Path:
    ensure_dir(output_dir)
    audio_path = output_dir / f'{video_path.stem}_{uuid.uuid4().hex[:8]}.wav'
    command = [
        'ffmpeg', '-y', '-i', str(video_path),
        '-ac', '1', '-ar', str(sample_rate), str(audio_path)
    ]
    run_ffmpeg(command)
    return audio_path

def get_audio_duration(audio_path: Path) -> float:
    with contextlib.closing(wave.open(str(audio_path), 'rb')) as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
    return frames / float(rate)

def format_timestamp(seconds: float) -> str:
    seconds = max(seconds, 0.0)
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

def segments_to_srt(segments: List[Dict[str, Any]], output_path: Path) -> None:
    ensure_dir(output_path.parent)
    with open(output_path, 'w', encoding='utf-8') as handle:
        for idx, segment in enumerate(segments, start=1):
            start_ts = format_timestamp(segment.get('start', 0.0))
            end_ts = format_timestamp(segment.get('end', segment.get('start', 0.0)))
            text = segment.get('text', '').strip()
            handle.write(f'{idx}\n{start_ts} --> {end_ts}\n{text}\n\n')

def aggregate_words(words: List[Dict[str, Any]], max_words: int = 10) -> List[Dict[str, Any]]:
    segments, buffer, start_time = [], [], None
    for word in words:
        token = word.get('word', '').strip()
        if not token:
            continue
        if start_time is None:
            start_time = word.get('start', 0.0)
        buffer.append(token)
        end_time = word.get('end', start_time)
        if len(buffer) >= max_words:
            segments.append({'start': start_time, 'end': end_time, 'text': ' '.join(buffer)})
            buffer, start_time = [], None
    if buffer:
        end_time = words[-1].get('end', start_time or 0.0)
        segments.append({'start': start_time or 0.0, 'end': end_time, 'text': ' '.join(buffer)})
    return segments

def approximate_segments_from_text(text: str, audio_duration: float, words_per_segment: int = 16) -> List[Dict[str, Any]]:
    tokens = text.strip().split()
    if not tokens or audio_duration <= 0:
        return []
    avg_time = audio_duration / max(len(tokens), 1)
    segments = []
    start = 0.0
    idx = 0
    while idx < len(tokens):
        chunk = tokens[idx: idx + words_per_segment]
        chunk_duration = avg_time * len(chunk)
        end = min(start + chunk_duration, audio_duration)
        segments.append({'start': start, 'end': end, 'text': ' '.join(chunk)})
        start = end
        idx += words_per_segment
    if segments:
        segments[-1]['end'] = audio_duration
    return segments

LANG_CODE_MAP = {
    'hindi': 'hi', 'marathi': 'mr', 'spanish': 'es', 'french': 'fr', 'german': 'de',
    'japanese': 'ja', 'chinese': 'zh', 'arabic': 'ar', 'english': 'en', 'tamil': 'ta',
    'telugu': 'te', 'bengali': 'bn', 'kannada': 'kn', 'gujarati': 'gu', 'punjabi': 'pa'
}

# Marian MT model ids use non-standard codes for some languages (e.g., Japanese
# expects "jap" instead of "ja"). Override those here so we can keep UI-facing
# codes human-friendly while requesting the correct model.
MARIAN_CODE_OVERRIDES = {'ja': 'jap'}

def resolve_language(lang: str) -> str:
    lang = lang.lower().strip()
    if lang in LANG_CODE_MAP.values():
        return lang
    return LANG_CODE_MAP.get(lang, 'en')

_translation_cache = {}

def get_translation_model(src_lang: str, tgt_lang: str):
    model_name = f'Helsinki-NLP/opus-mt-{src_lang}-{tgt_lang}'
    if model_name not in _translation_cache:
        tokenizer = MarianTokenizer.from_pretrained(model_name)
        model = MarianMTModel.from_pretrained(model_name)
        if torch:
            model = model.to('cuda' if torch.cuda.is_available() else 'cpu')
        _translation_cache[model_name] = (tokenizer, model)
    return _translation_cache[model_name]

def translate_segments(segments: List[Dict[str, Any]], src_lang: str, tgt_lang: str) -> List[Dict[str, Any]]:
    tokenizer, model = get_translation_model(src_lang, tgt_lang)
    device = next(model.parameters()).device if torch else 'cpu'
    translated_segments = []
    for i in range(0, len(segments), 8):
        batch = segments[i:i+8]
        texts = [seg['text'] for seg in batch]
        inputs = tokenizer(texts, return_tensors='pt', padding=True, truncation=True)
        if torch:
            inputs = {k: v.to(device) for k, v in inputs.items()}
            with torch.no_grad():
                outputs = model.generate(**inputs)
        else:
            outputs = model.generate(**inputs)
        decoded = tokenizer.batch_decode(outputs, skip_special_tokens=True)
        for seg, text in zip(batch, decoded):
            seg_copy = dict(seg)
            seg_copy['text'] = text
            translated_segments.append(seg_copy)
    return translated_segments

def _coerce_text(obj):
    if obj is None:
        return ''
    if isinstance(obj, str):
        return obj
    if hasattr(obj, 'text'):
        try:
            return obj.text
        except Exception:
            pass
    try:
        return str(obj)
    except Exception:
        return ''

def generate_subtitles(video_path: str, model_choice: str = 'whisper', target_langs: List[str] = None, progress_callback=None) -> Dict[str, Any]:
    """Generate subtitles for the given video using the chosen model.

    Optional `progress_callback` is a callable that will be invoked with a string message
    describing current progress. This is useful for streaming progress to UIs.

    Returns a dict with keys: 'srt_paths' (list of generated srt files) and 'errors'.
    """
    def _progress(msg: str):
        try:
            if progress_callback:
                progress_callback(str(msg))
        except Exception:
            # Never fail the transcription because of progress callback errors
            pass
    video = Path(video_path)
    if not video.exists():
        raise FileNotFoundError(video_path)
    base_name = video.stem
    out_dir = ensure_dir(Path('output') / base_name)
    audio_dir = ensure_dir(out_dir / 'audio')
    srt_dir = ensure_dir(out_dir / 'srt')

    _progress('Extracting audio...')
    audio_path = extract_audio_ffmpeg(video, audio_dir)
    audio_duration = get_audio_duration(audio_path)
    _progress(f'Audio extracted ({audio_duration:.2f}s)')

    transcripts_by_model = {}
    errors = []

    model_choice = (model_choice or '').lower()

    def _save_segments_and_register(name, segments):
        transcripts_by_model[name] = segments
        path = srt_dir / f'{base_name}_{name}.srt'
        segments_to_srt(segments, path)
        # notify caller that this model's SRT is ready
        try:
            _progress({'type': 'partial', 'model': name, 'path': str(path)})
        except Exception:
            pass
        return path

    # Whisper
    if model_choice in ('whisper', 'all') and whisper is not None:
        try:
            _progress('Starting Whisper...')
            model_size = 'small'
            whisper_model = whisper.load_model(model_size)
            result = whisper_model.transcribe(str(audio_path))
            whisper_segments = [
                {'start': seg['start'], 'end': seg['end'], 'text': seg['text'].strip()}
                for seg in result.get('segments', [])
            ]
            _save_segments_and_register('whisper', whisper_segments)
            _progress('Whisper finished')
        except Exception as exc:
            errors.append(f'whisper: {exc}')
            _progress(f'Whisper error: {exc}')

    # Hugging Face Wav2Vec2
    if model_choice in ('wav2vec2', 'all') and hf_asr_pipeline is not None:
        try:
            _progress('Starting Wav2Vec2 (transformers pipeline)...')
            wav2vec_model_id = 'facebook/wav2vec2-large-960h-lv60-self'
            wav2vec_pipeline = hf_asr_pipeline(
                task='automatic-speech-recognition',
                model=wav2vec_model_id,
                chunk_length_s=30,
                stride_length_s=5,
                return_timestamps='word'
            )
            wav2vec_result = wav2vec_pipeline(str(audio_path))
            if isinstance(wav2vec_result, dict) and 'chunks' in wav2vec_result:
                wav2vec_segments = [
                    {'start': float(chunk['timestamp'][0]), 'end': float(chunk['timestamp'][1]), 'text': chunk['text'].strip()}
                    for chunk in wav2vec_result['chunks']
                    if chunk.get('timestamp') and chunk.get('text', '').strip()
                ]
            else:
                wav2vec_segments = approximate_segments_from_text(wav2vec_result.get('text', ''), audio_duration)
            _save_segments_and_register('wav2vec2', wav2vec_segments)
            _progress('Wav2Vec2 finished')
        except Exception as exc:
            errors.append(f'wav2vec2: {exc}')
            _progress(f'Wav2Vec2 error: {exc}')

    # Silero
    if model_choice in ('silero', 'all') and torch is not None:
        try:
            _progress('Starting Silero...')
            silero_device = 'cuda' if torch.cuda.is_available() else 'cpu'
            silero_model, silero_decoder, silero_utils = torch.hub.load(
                repo_or_dir='snakers4/silero-models',
                model='silero_stt',
                language='en',
                device=silero_device
            )
            read_batch, split_into_batches, read_audio, prepare_model_input = silero_utils
            silero_batches = split_into_batches([str(audio_path)], batch_size=1)
            silero_text = []
            for batch in silero_batches:
                audio = read_batch(batch)
                input_tensor = prepare_model_input(audio).to(silero_device)
                output = silero_model(input_tensor)
                silero_text.append(silero_decoder(output[0].cpu()))
            combined_text = ' '.join(silero_text)
            silero_segments = approximate_segments_from_text(combined_text, audio_duration)
            _save_segments_and_register('silero', silero_segments)
            _progress('Silero finished')
        except Exception as exc:
            errors.append(f'silero: {exc}')
            _progress(f'Silero error: {exc}')

    # NeMo
    if model_choice in ('nemo', 'all') and nemo_asr is not None:
        try:
            _progress('Starting NeMo...')
            nemo_model_name = 'stt_en_conformer_ctc_small'
            nemo_model = nemo_asr.models.ASRModel.from_pretrained(model_name=nemo_model_name)
            try:
                transcribe_result = nemo_model.transcribe([str(audio_path)], return_timestamps='word')
            except TypeError:
                transcribe_result = nemo_model.transcribe([str(audio_path)])
            nemo_transcripts = []
            nemo_word_ts = None
            if isinstance(transcribe_result, (list, tuple)) and len(transcribe_result) == 2:
                nemo_transcripts, nemo_word_ts = transcribe_result[0], transcribe_result[1]
            else:
                nemo_transcripts = transcribe_result
            if isinstance(nemo_transcripts, (list, tuple)):
                nemo_transcripts = [_coerce_text(t) for t in nemo_transcripts]
            elif isinstance(nemo_transcripts, str):
                nemo_transcripts = [nemo_transcripts]
            else:
                try:
                    nemo_transcripts = [_coerce_text(t) for t in list(nemo_transcripts)]
                except Exception:
                    nemo_transcripts = []

            if nemo_word_ts:
                normalized_word_ts = []
                for utt in nemo_word_ts:
                    utt_tokens = []
                    for tok in utt:
                        if isinstance(tok, dict):
                            word = tok.get('word') or tok.get('text') or ''
                            start = tok.get('start_time', tok.get('start', 0.0))
                            end = tok.get('end_time', tok.get('end', start))
                        else:
                            word = getattr(tok, 'word', None) or getattr(tok, 'text', None) or str(tok)
                            start = getattr(tok, 'start_time', None)
                            if start is None:
                                start = getattr(tok, 'start', 0.0)
                            end = getattr(tok, 'end_time', None)
                            if end is None:
                                end = getattr(tok, 'end', start)
                        try:
                            start = float(start) if start is not None else 0.0
                        except Exception:
                            start = 0.0
                        try:
                            end = float(end) if end is not None else start
                        except Exception:
                            end = start
                        utt_tokens.append({'word': str(word).strip(), 'start': start, 'end': end})
                    normalized_word_ts.append(utt_tokens)
                nemo_word_ts = normalized_word_ts

            words = []
            if nemo_word_ts and len(nemo_word_ts) > 0:
                for token in nemo_word_ts[0]:
                    words.append({'word': token.get('word', ''), 'start': token.get('start', 0.0), 'end': token.get('end', 0.0)})
                nemo_segments = aggregate_words(words)
            elif nemo_transcripts:
                nemo_segments = approximate_segments_from_text(nemo_transcripts[0], audio_duration)
            else:
                nemo_segments = []
            _save_segments_and_register('nemo', nemo_segments)
            _progress('NeMo finished')
        except Exception as exc:
            errors.append(f'nemo: {exc}')
            _progress(f'NeMo error: {exc}')

    # Vosk
    if model_choice in ('vosk', 'all'):
        try:
            _progress('Starting Vosk...')
            from vosk import Model, KaldiRecognizer
            vosk_model_dir = Path('models/vosk-model-small-en-us-0.15')
            if not vosk_model_dir.exists():
                raise FileNotFoundError(f'Download a Vosk model to {vosk_model_dir}')
            vosk_model = Model(str(vosk_model_dir))
            wf = wave.open(str(audio_path), 'rb')
            recognizer = KaldiRecognizer(vosk_model, wf.getframerate())
            recognizer.SetWords(True)
            words = []
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                if recognizer.AcceptWaveform(data):
                    partial = json.loads(recognizer.Result())
                    words.extend(partial.get('result', []))
            final = json.loads(recognizer.FinalResult())
            words.extend(final.get('result', []))
            wf.close()
            vosk_segments = aggregate_words(words)
            _save_segments_and_register('vosk', vosk_segments)
            _progress('Vosk finished')
        except Exception as exc:
            errors.append(f'vosk: {exc}')
            _progress(f'Vosk error: {exc}')

    # Translations
    srt_paths = []
    for model_name, segments in transcripts_by_model.items():
        path = srt_dir / f'{base_name}_{model_name}.srt'
        if path.exists():
            srt_paths.append(str(path))
    if target_langs and MarianMTModel is not None and MarianTokenizer is not None:
        _progress('Starting translations...')
        for tgt in target_langs:
            tgt_code = resolve_language(tgt)
            marian_tgt_code = MARIAN_CODE_OVERRIDES.get(tgt_code, tgt_code)
            marian_src_code = MARIAN_CODE_OVERRIDES.get('en', 'en')
            for model_name, segments in transcripts_by_model.items():
                try:
                    translated = translate_segments(segments, src_lang=marian_src_code, tgt_lang=marian_tgt_code)
                    out_path = srt_dir / f'{base_name}_{model_name}_{tgt_code}.srt'
                    segments_to_srt(translated, out_path)
                    srt_paths.append(str(out_path))
                    _progress(f'Translated {model_name} -> {tgt_code}')
                except Exception as exc:
                    errors.append(f'translate {model_name}->{tgt_code}: {exc}')
                    _progress(f'Translation error for {model_name}->{tgt_code}: {exc}')

    return {'srt_paths': srt_paths, 'errors': errors}
