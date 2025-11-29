from flask import Flask, render_template, request, redirect, url_for, send_from_directory, jsonify, Response
import importlib.util
from threading import Thread
from queue import Queue, Empty
import uuid
import json
from pathlib import Path
import sys
import os

# Ensure project root is on sys.path so `python web/app.py` (run from project root)
# can import top-level modules like `generate_subtitles`.
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from generate_subtitles import generate_subtitles, LANG_CODE_MAP
from pathlib import Path
import re
from datetime import timedelta, datetime
import shutil

app = Flask(__name__)
MEDIA_DIR = BASE_DIR / 'media'
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

MODEL_OPTIONS = ['whisper', 'wav2vec2', 'silero', 'nemo', 'vosk', 'all']

# In-memory job queues for streaming progress. Format: {job_id: Queue}
job_queues = {}

def _run_job_background(job_id: str, video_path: str, model_choice: str, target_langs: list):
    q = job_queues.get(job_id)
    if q is None:
        return

    def _put(msg_type: str, payload):
        q.put({'type': msg_type, 'payload': payload})

    try:
        _put('progress', 'Job started')
        # Call generate_subtitles with a progress callback that forwards messages
        def cb(msg):
            _put('progress', msg)

        result = generate_subtitles(video_path, model_choice=model_choice, target_langs=target_langs, progress_callback=cb)
        _put('done', result)
    except Exception as exc:
        _put('error', str(exc))
    finally:
        # keep the queue around briefly; consumer will read final message and close
        pass


@app.route('/', methods=['GET'])
def index():
    # Provide language choices as name:code mapping
    languages = list(LANG_CODE_MAP.items())

    # Detect which model packages are installed so we can show availability in the UI
    model_to_module = {
        'whisper': 'whisper',
        'wav2vec2': 'transformers',
        'silero': 'torch',
        'nemo': 'nemo',
        'vosk': 'vosk',
        'all': None,
    }
    models = []
    for m in MODEL_OPTIONS:
        mod = model_to_module.get(m)
        available = True if mod is None else importlib.util.find_spec(mod) is not None
        models.append({'name': m, 'available': available})

    return render_template('index.html', models=models, languages=languages)


@app.route('/generate', methods=['POST'])
def generate():
    # Support client-side chunked/resumable uploads: if client provides 'uploaded_filename',
    # use the already-uploaded file in MEDIA_DIR instead of expecting a multipart file here.
    uploaded_filename = request.form.get('uploaded_filename')
    if uploaded_filename:
        save_path = MEDIA_DIR / uploaded_filename
        if not save_path.exists():
            return jsonify({'error': 'uploaded file not found on server'}), 400
        filename = save_path.name
    else:
        uploaded = request.files.get('video')
        if not uploaded:
            return redirect(url_for('index'))
        filename = uploaded.filename
        save_path = MEDIA_DIR / filename
        uploaded.save(str(save_path))

    model_choice = request.form.get('model') or 'whisper'
    target_langs = request.form.getlist('languages') or []

    # Create a background job and return job id immediately
    job_id = uuid.uuid4().hex
    q = Queue()
    job_queues[job_id] = q

    # start background worker thread
    t = Thread(target=_run_job_background, args=(job_id, str(save_path), model_choice, target_langs), daemon=True)
    t.start()

    return jsonify({'job_id': job_id})


@app.route('/events/<job_id>')
def events(job_id):
    # Server-Sent Events endpoint streaming progress for the given job
    if job_id not in job_queues:
        return ('Job not found', 404)

    q = job_queues[job_id]

    def gen():
        try:
            while True:
                item = q.get()
                if item is None:
                    break
                # Send event as JSON in data:
                payload = json.dumps(item)
                yield f'data: {payload}\n\n'
                if item.get('type') in ('done', 'error'):
                    break
        finally:
            # cleanup queue
            try:
                del job_queues[job_id]
            except Exception:
                pass

    return Response(gen(), mimetype='text/event-stream')


@app.route('/upload_status')
def upload_status():
    upload_id = request.args.get('upload_id')
    if not upload_id:
        return jsonify({'error': 'missing upload_id'}), 400
    up_dir = MEDIA_DIR / 'uploads' / upload_id
    if not up_dir.exists():
        return jsonify({'received': []})
    parts = []
    for p in sorted(up_dir.iterdir()):
        if p.name.startswith('chunk_'):
            try:
                idx = int(p.name.split('_',1)[1])
                parts.append(idx)
            except Exception:
                continue
    return jsonify({'received': parts})


@app.route('/upload_chunk', methods=['POST'])
def upload_chunk():
    upload_id = request.headers.get('X-Upload-Id') or request.form.get('upload_id')
    if not upload_id:
        return jsonify({'error': 'missing upload_id header'}), 400
    try:
        idx = int(request.headers.get('X-Chunk-Index') or request.form.get('index'))
        total = int(request.headers.get('X-Total-Chunks') or request.form.get('total'))
    except Exception:
        return jsonify({'error': 'missing or invalid chunk metadata'}), 400
    filename = request.headers.get('X-File-Name') or request.form.get('filename')
    chunk = request.files.get('chunk')
    if chunk is None:
        return jsonify({'error': 'missing chunk file'}), 400
    up_dir = MEDIA_DIR / 'uploads' / upload_id
    up_dir.mkdir(parents=True, exist_ok=True)
    chunk_name = f'chunk_{idx:06d}'
    chunk_path = up_dir / chunk_name
    chunk.save(str(chunk_path))
    assembled = False
    # If this is the last chunk, attempt to assemble
    if idx == (total - 1):
        final_path = MEDIA_DIR / filename
        try:
            with final_path.open('wb') as fw:
                for i in range(total):
                    part = up_dir / f'chunk_{i:06d}'
                    if not part.exists():
                        # missing part; abort assembly
                        raise FileNotFoundError(f'chunk {i} missing')
                    with part.open('rb') as fr:
                        shutil.copyfileobj(fr, fw)
            # cleanup
            try:
                shutil.rmtree(up_dir)
            except Exception:
                pass
            assembled = True
        except Exception as exc:
            return jsonify({'error': f'assembly failed: {exc}'}), 500
    return jsonify({'ok': True, 'assembled': assembled})


@app.route('/files/<path:filename>')
def files(filename):
    # Serve files from project root (safe for local dev)
    base = Path(__file__).resolve().parents[1]
    return send_from_directory(str(base), filename, as_attachment=True)


def _parse_srt(path: Path):
    text = path.read_text(encoding='utf-8')
    entries = re.split(r'\n\s*\n', text.strip())
    segments = []
    for ent in entries:
        lines = ent.strip().splitlines()
        if len(lines) < 2:
            continue
        # first line may be index, second time
        time_line = None
        if '-->' in lines[1]:
            time_line = lines[1]
            body = '\n'.join(lines[2:])
        else:
            # sometimes index line omitted
            time_line = lines[0]
            body = '\n'.join(lines[1:])
        try:
            start_s, end_s = [s.strip() for s in time_line.split('-->')]
            def to_secs(ts):
                # format 00:00:01,234
                h,m,s = ts.strip().split(':')
                s,ms = s.split(',') if ',' in s else (s, '0')
                return int(h)*3600 + int(m)*60 + float(s) + float(ms)/1000.0
            start = to_secs(start_s)
            end = to_secs(end_s)
            segments.append({'start': start, 'end': end, 'text': body.strip()})
        except Exception:
            continue
    return segments


def _format_srt_timestamp(seconds: float) -> str:
    td = timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    ms = int((td.total_seconds() - total_seconds) * 1000)
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def _write_srt(path: Path, segments: list):
    lines = []
    for idx, seg in enumerate(segments, start=1):
        start = seg.get('start')
        end = seg.get('end')
        # if string timestamps provided, keep them; else format
        if isinstance(start, str):
            start_ts = start
        else:
            start_ts = _format_srt_timestamp(float(start))
        if isinstance(end, str):
            end_ts = end
        else:
            end_ts = _format_srt_timestamp(float(end))
        text = seg.get('text', '')
        lines.append(str(idx))
        lines.append(f"{start_ts} --> {end_ts}")
        lines.append(text)
        lines.append('')
    path.write_text('\n'.join(lines).strip() + '\n', encoding='utf-8')


@app.route('/editor')
def editor():
    # optional query param file path relative to project root
    srt = request.args.get('file')
    # build list of available srt files under output/
    files = []
    out_dir = BASE_DIR / 'output'
    for root, dirs, filenames in os.walk(out_dir):
        for fn in filenames:
            if fn.lower().endswith('.srt'):
                rel = os.path.relpath(os.path.join(root, fn), start=str(BASE_DIR))
                files.append(rel)
    return render_template('editor.html', srt=srt, srt_files=files)


@app.route('/api/srt_list')
def api_srt_list():
    out_dir = BASE_DIR / 'output'
    files = []
    for root, dirs, filenames in os.walk(out_dir):
        for fn in filenames:
            if fn.lower().endswith('.srt'):
                rel = os.path.relpath(os.path.join(root, fn), start=str(BASE_DIR))
                files.append(rel)
    return jsonify({'files': files})


@app.route('/api/segments')
def api_segments():
    path = request.args.get('path')
    if not path:
        return jsonify({'error': 'missing path'}), 400
    full = BASE_DIR / path
    if not full.exists():
        return jsonify({'error': 'file not found'}), 404
    segments = _parse_srt(full)
    # try to find an audio file in sibling audio folder
    audio_rel = None
    try:
        srt_parent = full.parent
        # expect output/<video>/srt/<file>.srt -> audio in output/<video>/audio
        grand = srt_parent.parent
        audio_dir = grand / 'audio'
        if audio_dir.exists():
            matches = list(audio_dir.glob('*.wav'))
            if matches:
                audio_rel = os.path.relpath(str(matches[0]), start=str(BASE_DIR))
    except Exception:
        audio_rel = None
    
    # Try to find original video in media folder
    video_rel = None
    try:
        media_dir = BASE_DIR / 'media'
        if media_dir.exists():
            # try to find a video that matches the srt stem first
            stem = full.stem.rsplit('_', 1)[0] if '_' in full.stem else full.stem
            for ext in ['.mp4', '.webm', '.mov', '.mkv', '.avi']:
                candidate = media_dir / f"{stem}{ext}"
                if candidate.exists():
                    video_rel = os.path.relpath(str(candidate), start=str(BASE_DIR))
                    break
            # fallback: first available video
            if video_rel is None:
                for ext in ['*.mp4', '*.webm', '*.mov', '*.mkv', '*.avi']:
                    matches = list(media_dir.glob(ext))
                    if matches:
                        video_rel = os.path.relpath(str(matches[0]), start=str(BASE_DIR))
                        break
    except Exception:
        video_rel = None
    
    duration = segments[-1]['end'] if segments else 0
    return jsonify({'segments': segments, 'audio': audio_rel, 'video': video_rel, 'duration': duration})


@app.route('/api/backups')
def api_backups():
    path = request.args.get('path')
    if not path:
        return jsonify({'error': 'missing path'}), 400
    full = BASE_DIR / path
    if not full.exists():
        return jsonify({'error': 'file not found'}), 404
    # list backups in same directory named like <orig>.bak.*
    base = full.parent
    prefix = full.name + '.bak.'
    backups = []
    for fn in sorted(os.listdir(base), reverse=True):
        if fn.startswith(prefix):
            backups.append(fn)
    return jsonify({'backups': backups})


@app.route('/api/restore', methods=['POST'])
def api_restore():
    data = request.get_json()
    path = data.get('path')
    backup = data.get('backup')
    if not path or not backup:
        return jsonify({'error': 'missing fields'}), 400
    full = BASE_DIR / path
    bak = full.parent / backup
    if not full.exists() or not bak.exists():
        return jsonify({'error': 'file not found'}), 404
    try:
        # create a safety copy of current before restore
        try:
            safename = f"{full.name}.bak.before_restore.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(str(full), str(full.parent / safename))
        except Exception:
            pass
        shutil.copy2(str(bak), str(full))
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@app.route('/api/save_segments', methods=['POST'])
def api_save_segments():
    data = request.get_json()
    path = data.get('path')
    segments = data.get('segments')
    if not path or segments is None:
        return jsonify({'error': 'missing fields'}), 400
    full = BASE_DIR / path
    if not full.exists():
        return jsonify({'error': 'file not found'}), 404
    # write srt
    try:
        # create a timestamped backup before overwriting
        try:
            bak_name = f"{full.name}.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            bak_path = full.parent / bak_name
            shutil.copy2(str(full), str(bak_path))
        except Exception as e:
            # if backup fails, log but continue
            print(f"Warning: failed to create backup: {e}")
        # convert segments start/end strings if necessary
        cleaned = []
        for s in segments:
            cleaned.append({'start': s['start'], 'end': s['end'], 'text': s.get('text', '')})
        _write_srt(full, cleaned)
        return jsonify({'ok': True})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)
