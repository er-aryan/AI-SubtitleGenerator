document.addEventListener('DOMContentLoaded', function(){
  // Theme toggle functionality
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  
  // Initialize theme from localStorage or system preference
  function initTheme() {
    let savedTheme = localStorage.getItem('subtitlegen.theme');
    if (!savedTheme) {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      savedTheme = prefersDark ? 'dark' : 'light';
    }
    setTheme(savedTheme, false);
  }
  
  function setTheme(theme, animate = true) {
    if (theme === 'light') {
      html.classList.add('light-mode');
      updateThemeButton('light');
    } else {
      html.classList.remove('light-mode');
      updateThemeButton('dark');
    }
    localStorage.setItem('subtitlegen.theme', theme);
  }
  
  function updateThemeButton(theme) {
    if (theme === 'light') {
      themeToggle.classList.remove('light-icon');
      themeToggle.classList.add('dark-icon');
    } else {
      themeToggle.classList.remove('dark-icon');
      themeToggle.classList.add('light-icon');
    }
  }
  
  function toggleTheme() {
    const currentTheme = html.classList.contains('light-mode') ? 'light' : 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    themeToggle.classList.add('toggling');
    setTimeout(() => {
      setTheme(newTheme);
      themeToggle.classList.remove('toggling');
    }, 250);
  }
  
  if(themeToggle){
    themeToggle.addEventListener('click', toggleTheme);
    initTheme();
  }

  const srtSelect = document.getElementById('srtSelect');
  const loadBtn = document.getElementById('loadBtn');
  const audio = document.getElementById('audio');
  const videoPlayerMain = document.getElementById('videoPlayerMain'); // Use shared main video player
  const videoSubtitleOverlayMain = document.getElementById('videoSubtitleOverlayMain'); // Use shared subtitle overlay
  const timeline = document.getElementById('timeline');
  const segmentsList = document.getElementById('segmentsList');
  const saveBtn = document.getElementById('saveBtn');
  let cachedList = [];
  let nativeCaptionTrack = null;

  // Fetch list of available srt files
  async function fetchSrtList(){
    const resp = await fetch('/api/srt_list');
    if(!resp.ok) return;
    const j = await resp.json();
    cachedList = j.files || [];
    setSrtOptions(cachedList);
  }

  function setSrtOptions(paths){
    if(!srtSelect) return;
    srtSelect.innerHTML = '';
    (paths || []).forEach(f => { const opt = document.createElement('option'); opt.value = f; opt.textContent = f; srtSelect.appendChild(opt); });
  }

  async function loadSelectedSrt(pathOverride){
    let path = pathOverride || (srtSelect ? srtSelect.value : '');
    // If nothing selected, pick first available
    if(!path){
      if(srtSelect && srtSelect.options.length > 0){
        path = srtSelect.options[0].value;
        srtSelect.value = path;
      } else if(cachedList.length){
        path = cachedList[0];
        if(srtSelect){
          const opt = document.createElement('option'); opt.value = path; opt.textContent = path; srtSelect.appendChild(opt);
          srtSelect.value = path;
        }
      }
    }
    if(!path) return;
    const resp = await fetch('/api/segments?path=' + encodeURIComponent(path));
    if(!resp.ok){ alert('Failed to load segments'); return; }
    const j = await resp.json();
    currentSegments = j.segments || [];
    // initialize undo stack with original state
    undoStack.length = 0; pushUndo();
    duration = j.duration || (currentSegments.length? currentSegments[currentSegments.length-1].end : 0);
    if(j.audio) {
      audio.src = '/files/' + encodeURIComponent(j.audio);
      audio.style.display = 'block';
    }
    if(videoPlayerMain) {
      if(j.video) {
        videoPlayerMain.src = '/files/' + encodeURIComponent(j.video);
      }
      try{ videoPlayerMain.load(); }catch(e){}
      populateNativeCaptions(currentSegments);
    }
    renderTimeline(); renderSegmentsList();
    if(videoPlayerMain) updateVideoSubtitle();
  }

  function toSeconds(ts){
    const parts = ts.split(':');
    if(parts.length!==3) return 0;
    const h = parseInt(parts[0],10);
    const m = parseInt(parts[1],10);
    const s = parseFloat(parts[2].replace(',', '.'));
    return h*3600 + m*60 + s;
  }

  let currentSegments = [];
  let duration = 0;
  const undoStack = [];

  // global editor state (lifted so keyboard handlers and other functions can access)
  let snapStep = 0.1; // seconds (will be loaded from localStorage if set)
  const snapSelect = document.getElementById('snapSelect');
  if(snapSelect){
    // restore previous preference if available
    try{ const sv = localStorage.getItem('subtitlegen.snapStep'); if(sv) { snapSelect.value = sv; snapStep = parseFloat(sv) || snapStep; } }catch(e){}
    snapSelect.addEventListener('change', ()=>{ snapStep = parseFloat(snapSelect.value) || 0.1; try{ localStorage.setItem('subtitlegen.snapStep', snapSelect.value); }catch(e){} });
  }

  let selectedIdx = null; // index of selected segment for nudging
  let selectedBoundary = null; // 'left' or 'right'
  const minDur = 0.05; // minimum segment duration in seconds

  // ghost and shade elements (created lazily)
  let ghostLine = null;
  let leftShade = null;
  let rightShade = null;
  function ensureTimelineHelpers(){
    if(!ghostLine){ ghostLine = document.getElementById('ghostLine'); if(!ghostLine){ ghostLine = document.createElement('div'); ghostLine.id='ghostLine'; ghostLine.style.position='absolute'; ghostLine.style.top='0'; ghostLine.style.bottom='0'; ghostLine.style.width='2px'; ghostLine.style.background='rgba(255,255,255,0.12)'; ghostLine.style.display='none'; ghostLine.style.zIndex='900'; timeline.appendChild(ghostLine); } }
    if(!leftShade){ leftShade = document.getElementById('leftShade'); if(!leftShade){ leftShade = document.createElement('div'); leftShade.id='leftShade'; leftShade.className='shade-left'; leftShade.style.display='none'; timeline.appendChild(leftShade);} }
    if(!rightShade){ rightShade = document.getElementById('rightShade'); if(!rightShade){ rightShade = document.createElement('div'); rightShade.id='rightShade'; rightShade.className='shade-right'; rightShade.style.display='none'; timeline.appendChild(rightShade);} }
  }

  function updateShades(){
    ensureTimelineHelpers();
    if(selectedIdx === null){ leftShade.style.display='none'; rightShade.style.display='none'; return; }
    const seg = currentSegments[selectedIdx];
    if(!seg){ leftShade.style.display='none'; rightShade.style.display='none'; return; }
    const prevEnd = (selectedIdx>0) ? currentSegments[selectedIdx-1].end : 0;
    const nextStart = (selectedIdx < currentSegments.length-1) ? currentSegments[selectedIdx+1].start : duration;
    // leftShade shows unavailable area on the left (0..prevEnd)
    const leftPct = (prevEnd / Math.max(1e-6, duration)) * 100;
    leftShade.style.left = '0%'; leftShade.style.width = leftPct + '%'; leftShade.style.display = (leftPct>0 ? 'block' : 'none');
    // rightShade shows unavailable area on the right (nextStart..end)
    const rightLeftPct = (nextStart / Math.max(1e-6, duration)) * 100;
    rightShade.style.left = rightLeftPct + '%'; rightShade.style.width = (100 - rightLeftPct) + '%'; rightShade.style.display = (rightLeftPct<100 ? 'block' : 'none');
  }

  // selected boundary indicator element
  const selectedIndicator = document.getElementById('selectedBoundaryIndicator');
  function setSelectedIndicator(){
    if(!selectedIndicator) return;
    if(selectedIdx===null){ selectedIndicator.textContent = 'Boundary: none'; selectedIndicator.classList.remove('selected-boundary'); return; }
    if(!selectedBoundary){ selectedIndicator.textContent = `Boundary: segment ${selectedIdx+1}`; selectedIndicator.classList.remove('selected-boundary'); return; }
    selectedIndicator.textContent = `Boundary: ${selectedBoundary.toUpperCase()}`;
    selectedIndicator.classList.add('selected-boundary');
  }

  // magnet configuration
  const magnetThreshold = 0.02; // seconds: within this distance we snap to neighbor

  // color palettes (simple gradient pairs)
  const PALETTES = {
    default: [ ['#06b6d4','#7c3aed'], ['#7c3aed','#06b6d4'], ['#06b6d4','#34d399'] ],
    warm: [ ['#ff7a59','#ffb86b'], ['#ff9bb3','#ff7a59'], ['#ffb86b','#ff6f91'] ],
    cool: [ ['#60a5fa','#7c3aed'], ['#06b6d4','#60a5fa'], ['#7c3aed','#60a5fa'] ]
  };
  let currentPalette = 'default';
  let segmentColors = [];

  function assignColors(){
    const p = PALETTES[currentPalette] || PALETTES.default;
    segmentColors = currentSegments.map((s,i)=>{
      const g = p[i % p.length];
      return `linear-gradient(90deg, ${g[0]}, ${g[1]})`;
    });
  }

  function pushUndo(){
    // deep copy current segments
    try{ undoStack.push(JSON.parse(JSON.stringify(currentSegments))); if(undoStack.length>50) undoStack.shift(); }catch(e){}
  }

  function renderTimeline(){
    timeline.innerHTML = '';
    assignColors();
    currentSegments.forEach((seg, idx)=>{
      const left = (seg.start / duration) * 100;
      const width = ((seg.end - seg.start) / duration) * 100;
      const div = document.createElement('div');
      div.className = 'segment-bar';
      div.style.left = left + '%';
      div.style.width = Math.max(width, 0.5) + '%';
  // use assigned color or fallback
  div.style.background = segmentColors[idx] || 'linear-gradient(90deg,#06b6d4,#7c3aed)';
      div.textContent = seg.text.slice(0, 40);
      div.title = seg.text;
  div.addEventListener('click', ()=>{ 
    audio.currentTime = seg.start; 
    audio.play(); 
    if(videoPlayerMain) videoPlayerMain.currentTime = seg.start;
    selectedIdx = idx; 
    selectedBoundary = null; 
    highlightRow(idx); 
  });

      // left/right drag handles (visible) with tooltip and snapping
      const leftHandle = document.createElement('div');
      leftHandle.className = 'handle left';
      const rightHandle = document.createElement('div');
      rightHandle.className = 'handle right';


      // helpers
      const minDur = 0.05; // minimum segment duration in seconds
      function pageXToTime(pageX){
        const rect = timeline.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, pageX - rect.left));
        return (x / rect.width) * duration;
      }

  // tooltip (timeline helpers created globally)
  const tooltip = document.getElementById('timeTooltip');

  // pointer-based dragging (works for mouse and touch)
  let dragging = null; // {side, idx, pointerId}
      function startDrag(side, idx, ev){
        ev.preventDefault(); ev.stopPropagation();
        const pid = (ev.pointerId !== undefined) ? ev.pointerId : null;
        dragging = {side, idx, pointerId: pid};
  selectedIdx = idx; selectedBoundary = side;
        pushUndo();
        document.body.style.userSelect='none';
        if(tooltip){ tooltip.style.display='block'; }
  ensureTimelineHelpers(); if(ghostLine) ghostLine.style.display='block';
  updateShades();

        const onMove = function(me){
          if(!dragging) return;
          // if pointerId provided, ignore other pointers
          if(dragging.pointerId && me.pointerId !== undefined && me.pointerId !== dragging.pointerId) return;
          const t = pageXToTime(me.pageX);
          const snap = Math.round(t / snapStep) * snapStep; // configurable snapping
          const sIdx = dragging.idx;
          const seg = currentSegments[sIdx];
          if(!seg) return;
          if(dragging.side === 'left'){
            const prevEnd = (sIdx>0) ? currentSegments[sIdx-1].end : 0;
            // magnet: if we're very close to prevEnd, snap to it
            if(Math.abs(snap - prevEnd) <= magnetThreshold){ seg.start = prevEnd; if(ghostLine){ ghostLine.style.left = ((seg.start / duration) * 100) + '%'; ghostLine.classList.add('magnet'); setTimeout(()=>ghostLine.classList.remove('magnet'), 420); } }
            else {
              const newStart = Math.max(prevEnd, Math.min(seg.end - minDur, snap));
              seg.start = newStart;
              if(ghostLine) ghostLine.style.left = ((seg.start / duration) * 100) + '%';
            }
          } else {
            const nextStart = (sIdx < currentSegments.length-1) ? currentSegments[sIdx+1].start : duration;
            if(Math.abs(snap - nextStart) <= magnetThreshold){ seg.end = nextStart; if(ghostLine){ ghostLine.style.left = ((seg.end / duration) * 100) + '%'; ghostLine.classList.add('magnet'); setTimeout(()=>ghostLine.classList.remove('magnet'), 420); } }
            else {
              const newEnd = Math.min(nextStart, Math.max(seg.start + minDur, snap));
              seg.end = newEnd;
              if(ghostLine) ghostLine.style.left = ((seg.end / duration) * 100) + '%';
            }
          }
          updateShades();
          if(tooltip){
            tooltip.textContent = (dragging.side==='left' ? 'start: ' : 'end: ') + (Math.round((dragging.side==='left'? seg.start: seg.end)*100)/100).toFixed(2) + 's';
            tooltip.style.left = (me.pageX + 12) + 'px';
            tooltip.style.top = (me.pageY + 12) + 'px';
          }
          renderTimeline(); renderSegmentsList();
        };

        const onUp = function(me){
          // if pointerId mismatch ignore
          if(dragging && dragging.pointerId && me && me.pointerId !== dragging.pointerId) return;
          dragging = null; document.body.style.userSelect='auto'; if(tooltip) tooltip.style.display='none'; if(ghostLine) ghostLine.style.display='none';
          // keep selection but hide shades
          updateShades();
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      }

      // attach pointerdown so touch works too
      leftHandle.addEventListener('pointerdown', (ev)=> startDrag('left', idx, ev));
      rightHandle.addEventListener('pointerdown', (ev)=> startDrag('right', idx, ev));

      div.appendChild(leftHandle);
      div.appendChild(rightHandle);
      timeline.appendChild(div);
    });
  }

  // --- Playing highlight + floating preview ---
  const subtitlePreview = document.getElementById('subtitlePreview');
  let previewTimeout = null;

  function updatePlayingSegment(){
    if(!currentSegments || currentSegments.length===0) return;
    const t = audio.currentTime;
    let found = -1;
    for(let i=0;i<currentSegments.length;i++){
      const s = currentSegments[i];
      if(t >= s.start && t <= s.end){ found = i; break; }
    }
    // update classes for bars
    const bars = Array.from(document.querySelectorAll('.segment-bar'));
    bars.forEach((b,i)=>{
      if(i===found){ b.classList.add('playing'); } else { b.classList.remove('playing'); }
    });
    // update rows
    document.querySelectorAll('.segment-row').forEach((r,i)=>{ r.classList.toggle('playing', i===found); });

    if(found >= 0){
      const text = currentSegments[found].text || '';
      if(subtitlePreview){ subtitlePreview.style.display='block'; subtitlePreview.textContent = text; clearTimeout(previewTimeout); previewTimeout = setTimeout(()=>{ if(subtitlePreview) subtitlePreview.style.display='none'; }, Math.min(4000, (currentSegments[found].end - t)*1000 + 400)); }
    } else {
      if(subtitlePreview) subtitlePreview.style.display='none';
    }
  }
  audio.addEventListener('timeupdate', updatePlayingSegment);

  // optional: when playback starts, ensure preview updates immediately
  audio.addEventListener('play', updatePlayingSegment);
  audio.addEventListener('seeked', updatePlayingSegment);

  // Video subtitle sync
  function updateVideoSubtitle(){
    if(!videoPlayerMain || !currentSegments || currentSegments.length===0) return;
    const t = videoPlayerMain.currentTime;
    let found = -1;
    for(let i=0;i<currentSegments.length;i++){
      const s = currentSegments[i];
      if(t >= s.start && t <= s.end){ found = i; break; }
    }
    if(found >= 0 && videoSubtitleOverlayMain){
      videoSubtitleOverlayMain.textContent = currentSegments[found].text;
      videoSubtitleOverlayMain.style.display = 'block';
    } else if(videoSubtitleOverlayMain) {
      videoSubtitleOverlayMain.style.display = 'none';
    }
  }

  if(videoPlayerMain){
    videoPlayerMain.addEventListener('timeupdate', updateVideoSubtitle);
    videoPlayerMain.addEventListener('play', updateVideoSubtitle);
    videoPlayerMain.addEventListener('seeked', updateVideoSubtitle);
    document.addEventListener('fullscreenchange', syncCaptionMode);
    videoPlayerMain.addEventListener('webkitfullscreenchange', syncCaptionMode);
  }

  function highlightRow(idx){
    document.querySelectorAll('.segment-row').forEach((r,i)=>{ r.style.outline = i===idx ? '2px solid rgba(6,182,212,0.6)' : 'none'; });
    selectedIdx = idx; selectedBoundary = null; updateShades(); setSelectedIndicator();
  }

  function renderSegmentsList(){
    segmentsList.innerHTML = '';
    currentSegments.forEach((seg, idx)=>{
      const row = document.createElement('div'); row.className='segment-row';
      const start = document.createElement('input'); start.className='time-input'; start.value = new Date(seg.start*1000).toISOString().substr(11,12).replace('.', ',');
      const end = document.createElement('input'); end.className='time-input'; end.value = new Date(seg.end*1000).toISOString().substr(11,12).replace('.', ',');
      const text = document.createElement('textarea'); text.className='segment-text'; text.value = seg.text;
      const btnPlay = document.createElement('button'); btnPlay.textContent='Play'; btnPlay.addEventListener('click', ()=>{ 
        audio.currentTime = seg.start; 
        audio.play(); 
        if(videoPlayerMain) videoPlayerMain.currentTime = seg.start;
        highlightRow(idx); 
      });
      const btnSplit = document.createElement('button'); btnSplit.textContent='Split'; btnSplit.addEventListener('click', ()=>{ const t = audio.currentTime; if(t>seg.start && t<seg.end){ pushUndo(); seg.end = t; const newSeg = {start: t, end: rowEnd(seg.end), text: seg.text}; currentSegments.splice(idx+1,0,newSeg); renderTimeline(); renderSegmentsList(); } });
      const btnDelete = document.createElement('button'); btnDelete.textContent='Delete'; btnDelete.addEventListener('click', ()=>{ pushUndo(); currentSegments.splice(idx,1); renderTimeline(); renderSegmentsList(); });
      // edits in text or time should be pushUndo once before first change
      let textEdited = false;
      text.addEventListener('focus', ()=>{ if(!textEdited){ pushUndo(); textEdited=true; } });
      text.addEventListener('input', ()=>{ seg.text = text.value; renderTimeline(); });
      start.addEventListener('change', ()=>{ pushUndo(); seg.start = toSeconds(start.value); renderTimeline(); renderSegmentsList(); });
      end.addEventListener('change', ()=>{ pushUndo(); seg.end = toSeconds(end.value); renderTimeline(); renderSegmentsList(); });
  row.appendChild(start); row.appendChild(end); row.appendChild(text); row.appendChild(btnPlay); row.appendChild(btnSplit); row.appendChild(btnDelete);
  row.addEventListener('click', ()=>{ selectedIdx = idx; selectedBoundary = null; highlightRow(idx); updateShades(); });
      segmentsList.appendChild(row);
    });
  }

  function rowEnd(v){ return v; }

  function populateNativeCaptions(segments){
    if(!videoPlayerMain) return;
    // clear existing tracks we added
    try{
      const tracks = videoPlayerMain.textTracks || [];
      for(let i=0;i<tracks.length;i++){
        const cues = tracks[i].cues;
        if(cues){
          while(cues.length) tracks[i].removeCue(cues[0]);
        }
        tracks[i].mode = 'disabled';
      }
    }catch(e){}
    nativeCaptionTrack = null;
    try{
      const track = videoPlayerMain.addTextTrack('captions', 'Subtitles', 'en');
      track.mode = 'disabled'; // enable only in fullscreen
      (segments || []).forEach(seg => {
        try{
          const cue = new VTTCue(parseFloat(seg.start||0), parseFloat(seg.end||0), seg.text || '');
          track.addCue(cue);
        }catch(e){}
      });
      nativeCaptionTrack = track;
    }catch(e){}
  }

  function syncCaptionMode(){
    const isFullscreen = !!document.fullscreenElement && document.fullscreenElement.contains(videoPlayerMain);
    if(nativeCaptionTrack){
      nativeCaptionTrack.mode = isFullscreen ? 'showing' : 'disabled';
    }
    if(videoSubtitleOverlayMain){
      videoSubtitleOverlayMain.style.display = isFullscreen ? 'none' : '';
    }
  }

  loadBtn.addEventListener('click', async ()=>{
    await loadSelectedSrt();
  });

  saveBtn.addEventListener('click', async ()=>{
    const path = srtSelect.value;
    if(!path) return;
    // collect cleaned segments
    const rows = document.querySelectorAll('.segment-row');
    const out = [];
    rows.forEach((r, idx)=>{
      const start = r.querySelector('input:nth-child(1)').value;
      const end = r.querySelector('input:nth-child(2)').value;
      const text = r.querySelector('textarea').value;
      out.push({start: start, end: end, text: text});
    });
    const resp = await fetch('/api/save_segments', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path: path, segments: out})});
    if(resp.ok){ alert('Saved'); } else { alert('Save failed'); }
  });

  // Undo button
  const undoBtn = document.getElementById('undoBtn');
  if(undoBtn){ undoBtn.addEventListener('click', ()=>{ if(undoStack.length>1){ undoStack.pop(); const prev = undoStack[undoStack.length-1]; currentSegments = JSON.parse(JSON.stringify(prev)); renderTimeline(); renderSegmentsList(); } else { alert('Nothing to undo'); } }); }

  // Keyboard nudging for selected boundary
  document.addEventListener('keydown', (ev)=>{
    // Tab toggles active boundary when a row is selected
    if(ev.key === 'Tab'){
      if(selectedIdx !== null){ ev.preventDefault(); selectedBoundary = (selectedBoundary==='left') ? 'right' : 'left'; updateShades(); setSelectedIndicator(); }
      return;
    }
    if(selectedIdx === null || !selectedBoundary) return;
    const seg = currentSegments[selectedIdx];
    if(!seg) return;
    let step = (ev.shiftKey ? (snapStep/10) : snapStep);
    if(ev.key === 'ArrowLeft' || ev.key === 'ArrowRight'){
      ev.preventDefault();
      pushUndo();
      if(selectedBoundary === 'left'){
        const prevEnd = (selectedIdx>0) ? currentSegments[selectedIdx-1].end : 0;
        const delta = (ev.key === 'ArrowLeft') ? -step : step;
        seg.start = Math.max(prevEnd, Math.min(seg.end - minDur, +(Math.round((seg.start + delta) / (snapStep/10)) * (snapStep/10)).toFixed(3)));
      } else {
        const nextStart = (selectedIdx < currentSegments.length-1) ? currentSegments[selectedIdx+1].start : duration;
        const delta = (ev.key === 'ArrowLeft') ? -step : step;
        seg.end = Math.min(nextStart, Math.max(seg.start + minDur, +(Math.round((seg.end + delta) / (snapStep/10)) * (snapStep/10)).toFixed(3)));
      }
      renderTimeline(); renderSegmentsList();
    }
  });

  // palette buttons
  const paletteDefault = document.getElementById('paletteDefault');
  const paletteWarm = document.getElementById('paletteWarm');
  const paletteCool = document.getElementById('paletteCool');
  function setPalette(name){ currentPalette = name; assignColors(); renderTimeline(); }
  if(paletteDefault) paletteDefault.addEventListener('click', ()=> setPalette('default'));
  if(paletteWarm) paletteWarm.addEventListener('click', ()=> setPalette('warm'));
  if(paletteCool) paletteCool.addEventListener('click', ()=> setPalette('cool'));

  // Export timeline as an SVG file
  const exportBtn = document.getElementById('exportBtn');
  async function exportTimelineSVG(){
    // build simple SVG representing timeline width and segments
    const w = Math.max(800, timeline.clientWidth || 1000);
    const h = 200;
    const pad = 8;
    const ns = 'http://www.w3.org/2000/svg';
    const segH = 80;
    const svgParts = [];
    svgParts.push(`<svg xmlns="${ns}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
    svgParts.push(`<rect width="100%" height="100%" fill="#071021"/>`);
    // text style
    svgParts.push(`<style>text{font-family:Inter, Arial, sans-serif;fill:#fff;font-size:12px}</style>`);
    for(let i=0;i<currentSegments.length;i++){
      const s = currentSegments[i];
      const x = pad + (s.start / Math.max(1e-6,duration)) * (w - pad*2);
      const x2 = pad + (s.end / Math.max(1e-6,duration)) * (w - pad*2);
      const width = Math.max(2, x2 - x);
      const color = (segmentColors[i] && segmentColors[i].includes('#')) ? segmentColors[i] : '#06b6d4';
      // fallback: use first color of gradient if available
      let fill = '#444';
      try{ const m = segmentColors[i].match(/#([0-9a-fA-F]{6})/); if(m) fill = '#'+m[1]; }catch(e){}
      svgParts.push(`<rect x="${x.toFixed(1)}" y="${pad+20}" width="${width.toFixed(1)}" height="${segH}" rx="8" fill="${fill}" opacity="0.95"/>`);
      const label = (s.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      svgParts.push(`<text x="${(x+6).toFixed(1)}" y="${(pad+20+segH/2+5).toFixed(1)}">${label.slice(0,80)}</text>`);
    }
    svgParts.push(`</svg>`);
    const svg = svgParts.join('\n');
    const blob = new Blob([svg], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'timeline.svg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  if(exportBtn) exportBtn.addEventListener('click', exportTimelineSVG);

  // Receive newly generated SRTs from app.js and preload the first one
  window.addEventListener('subtitlegen:newSRTs', ev => {
    const detail = ev.detail || {};
    const paths = detail.paths || [];
    const selectedPath = detail.selectedPath || (paths[0] || '');
    if(paths.length) { cachedList = paths; setSrtOptions(paths); }
    if(selectedPath){
      srtSelect.value = selectedPath;
      loadSelectedSrt(selectedPath);
    }
  });

  // When the editor tab is shown, reload currently selected SRT (if any)
  window.addEventListener('subtitlegen:showEditor', ev => {
    const detail = ev.detail || {};
    const paths = detail.paths || [];
    if(paths.length) {
      cachedList = paths;
      setSrtOptions(paths);
    } else {
      fetchSrtList();
    }
    const selectedPath = detail.selectedPath || (srtSelect ? srtSelect.value : '');
    if(selectedPath){
      srtSelect.value = selectedPath;
      loadSelectedSrt(selectedPath);
    }
  });

  // initial load
  fetchSrtList();
});
