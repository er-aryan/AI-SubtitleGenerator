document.addEventListener('DOMContentLoaded', function(){
  // ========================================
  // API CONFIGURATION
  // ========================================
  // Use an explicit global override when present (set `window.SUBTITLEGEN_API_BASE`),
  // otherwise default to the current origin so local testing works without a tunnel.
  const API_BASE_URL = (typeof window !== 'undefined' && window.SUBTITLEGEN_API_BASE)
    ? window.SUBTITLEGEN_API_BASE
    : (typeof location !== 'undefined' ? location.origin : '');

  // ========================================
  // FULL-SCREEN TERMINAL WORKFLOW
  // ========================================

  const terminal = document.getElementById('terminal');
  const terminalOutput = document.getElementById('terminalOutput');
  const themeSelector = document.getElementById('themeSelector');
  const tabContainer = document.getElementById('tabContainer');
  const welcomeMessage = document.getElementById('welcomeMessage');
  const themeDarkBtn = document.getElementById('themeDarkBtn');
  const themeLightBtn = document.getElementById('themeLightBtn');
  const mainContainer = document.getElementById('mainContainer');
  
  let currentStep = 0;
  const STEP_HELLO = 0;
  const STEP_THEME = 1;
  const STEP_TABS = 2;
  let generatedSrtPaths = [];

  // Map language codes -> display names (populated from Jinja injected window.SUBTITLEGEN_LANGS)
  const LANG_NAME_MAP = {};
  if(Array.isArray(window.SUBTITLEGEN_LANGS)){
    window.SUBTITLEGEN_LANGS.forEach(pair => {
      const name = pair[0];
      const code = pair[1];
      if(code) LANG_NAME_MAP[String(code).toLowerCase()] = name;
    });
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  function addLine(text, className = '', delay = 0) {
    const line = document.createElement('div');
    line.className = `line ${className}`;
    line.textContent = text;
    if(delay > 0) {
      setTimeout(() => terminalOutput.appendChild(line), delay);
    } else {
      terminalOutput.appendChild(line);
    }
    // Auto-scroll to bottom
    setTimeout(() => {
      terminal.scrollTop = terminal.scrollHeight;
    }, 50);
  }

  function clearTerminal() {
    terminalOutput.innerHTML = '';
  }

  function showThemeSelector() {
    themeSelector.style.display = 'block';
  }

  function hideThemeSelector() {
    themeSelector.style.display = 'none';
  }

  function showTabContainer() {
    tabContainer.style.display = 'block';
  }

  function hideTabContainer() {
    tabContainer.style.display = 'none';
  }

  // ========================================
  // STEP 1: HELLO COMMAND
  // ========================================

  function resetTerminalUI(){
    hideThemeSelector();
    hideTabContainer();
    // reset tab active states
    const tabs = document.querySelectorAll('.terminal-tab');
    const panes = document.querySelectorAll('.tab-pane');
    tabs.forEach(t => t.classList.remove('active'));
    panes.forEach(p => p.classList.remove('active'));
    const introTab = document.querySelector('.terminal-tab[data-tab="intro"]');
    const introPane = document.getElementById('tab-intro');
    if(introTab) introTab.classList.add('active');
    if(introPane) introPane.classList.add('active');
  }

  function runHelloCommand() {
    clearTerminal();
    resetTerminalUI();
    currentStep = STEP_HELLO;
    
    addLine('$ python hello.py', 'command', 0);
    addLine('Hello! Welcome to SubtitleGen 🎬', '', 500);
    addLine('', '', 1000);
    addLine('Let\'s set up your environment...', '', 1200);
    addLine('', '', 1500);
    
    setTimeout(() => {
      showThemeSelector();
    }, 2000);
  }

  // ========================================
  // STEP 2: THEME SELECTION
  // ========================================

  themeDarkBtn.addEventListener('click', () => {
    setTheme('dark');
  });

  themeLightBtn.addEventListener('click', () => {
    setTheme('light');
  });

  function setTheme(mode) {
    hideThemeSelector();
    const html = document.documentElement;
    
    addLine(`[MODE] Switching to ${mode === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}...`, '', 100);
    addLine('✓ Theme updated successfully', '', 400);
    addLine('', '', 500);
    
    if(mode === 'dark') {
      html.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      html.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    }
    
    setTimeout(() => {
      runLsCommand();
    }, 1000);
  }

  // ========================================
  // STEP 3: LS COMMAND (Tab Display)
  // ========================================

  function runLsCommand() {
    clearTerminal();
    currentStep = STEP_TABS;
    
    addLine('$ ls -la SubtitleGen/', 'command', 0);
    addLine('', '', 200);
    addLine('📋 Project Contents:', '', 300);
    addLine('', '', 500);
    
    welcomeMessage.textContent = '✨ Welcome to SubtitleGen! Choose a tab below to learn more or enter the project.';
    showTabContainer();
  }

  // ========================================
  // TAB NAVIGATION
  // ========================================

  const tabs = document.querySelectorAll('.terminal-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      
      if(target === 'enter') {
        handleEnterProject();
        return;
      }

      // Remove active class from all tabs and panes
      tabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      // Add active class to clicked tab and corresponding pane
      tab.classList.add('active');
      const pane = document.getElementById(`tab-${target}`);
      if(pane) pane.classList.add('active');
    });
  });

  // ========================================
  // ENTER PROJECT
  // ========================================

  function handleEnterProject() {
    const enterProjectContent = document.getElementById('enterProjectContent');
    enterProjectContent.innerHTML = '';
    
    addLine('', '', 0);
    addLine('$ npm run dev', 'command', 100);
    addLine('', '', 300);
    addLine('> Initializing SubtitleGen...', '', 500);
    addLine('> Loading ASR models...', '', 1500);
    addLine('> Setting up video player...', '', 2500);
    addLine('✓ Ready to generate subtitles!', '', 3500);
    addLine('', '', 4000);
    
    setTimeout(() => {
      transitionToProject();
    }, 4500);
  }

  function transitionToProject() {
    // Hide terminal, show main UI
    terminal.style.opacity = '0';
    terminal.style.transform = 'scale(0.95)';
    terminal.style.transition = 'all 0.6s ease-out';
    
    setTimeout(() => {
      terminal.style.display = 'none';
      // Restore page scrolling now that terminal is hidden
      document.body.classList.remove('terminal-page');
      document.body.style.overflow = 'auto';
      document.body.style.height = 'auto';
      mainContainer.style.display = 'block';
      mainContainer.style.opacity = '0';
      mainContainer.style.transform = 'scale(1.05)';
      
      setTimeout(() => {
        mainContainer.style.opacity = '1';
        mainContainer.style.transform = 'scale(1)';
        mainContainer.style.transition = 'all 0.6s ease-in';
        try{ sessionStorage.setItem(TERMINAL_SEEN_KEY, '1'); }catch(e){}
        if(uploadQuickBtn) uploadQuickBtn.style.display = 'none';
      }, 50);
    }, 600);
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  // Check localStorage for theme preference
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if(savedTheme === 'light') {
    document.documentElement.classList.add('light-mode');
  }

  // Terminal vs main UI
  function showMainUI(){
    if(terminal) terminal.style.display = 'none';
    document.body.classList.remove('terminal-page');
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    if(mainContainer){
      mainContainer.style.display = 'block';
      mainContainer.style.opacity = '1';
      mainContainer.style.transform = 'scale(1)';
    }
  }
  function showTerminal(){
    if(terminal){
      terminal.style.display = 'block';
      terminal.style.opacity = '1';
      terminal.style.transform = 'scale(1)';
    }
    if(mainContainer){
      mainContainer.style.display = 'none';
    }
    document.body.classList.add('terminal-page');
    resetTerminalUI();
  }

  const TERMINAL_SEEN_KEY = 'subtitlegen.seenTerminal';
  function startApp(){
    if(sessionStorage.getItem(TERMINAL_SEEN_KEY) === '1'){
      showMainUI();
    } else {
      runHelloCommand();
    }
  }

  startApp();

  // ========================================
  // EXISTING APP FUNCTIONALITY (for main container)
  // ========================================

  // Helper to parse SRT timecode format
  function parseSRTTime(timeStr){
    const parts = timeStr.split(':');
    if(parts.length !== 3) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2].replace(',', '.'));
    return h*3600 + m*60 + s;
  }
  window.parseSRTTime = parseSRTTime;

  // Show upload tabs when video is selected
  function showUploadTabs() {
    const welcomeTab = document.querySelector('.tab[data-target="tab-welcome"]');
    const hiddenTabs = document.querySelectorAll('.hidden-until-upload');
    
    if(welcomeTab) welcomeTab.classList.remove('active');
    hiddenTabs.forEach(tab => tab.style.display = 'block');
    
    const tabs = document.querySelectorAll('.tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabs.forEach(t => t.classList.remove('active'));
    tabPanes.forEach(p => p.style.display = 'none');
    
    const subtitleTab = document.querySelector('.tab[data-target="tab-subtitle"]');
    const subtitlePane = document.getElementById('tab-subtitle');
    if(subtitleTab) subtitleTab.classList.add('active');
    if(subtitlePane) subtitlePane.style.display = 'block';
    const editorPane = document.getElementById('tab-editor');
    if(editorPane) editorPane.style.display = 'none';
  }

  function notifyEditor(paths, selectedPath){
    try{
      const ev = new CustomEvent('subtitlegen:newSRTs', {detail: {paths: paths || [], selectedPath}});
      window.dispatchEvent(ev);
    }catch(e){}
  }

  function languageLabelFromPath(p){
    const fallback = 'English';
    if(!p) return fallback;
    try{
      const fname = (p.split('/').pop() || '').replace(/\.srt$/i, '');
      const parts = fname.split('_');
      // Expect pattern <video>_<model>_<lang?>
      const code = (parts.length >= 3 ? parts[parts.length-1] : '').toLowerCase();
      if(code && LANG_NAME_MAP[code]) {
        const name = LANG_NAME_MAP[code] || code;
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
    }catch(e){}
    return fallback;
  }

  function modelFromPath(p){
    try{
      const fname = (p.split('/').pop() || '').replace(/\.srt$/i, '');
      const parts = fname.split('_');
      // pattern <video>_<model>_<lang?>
      if(parts.length >= 2) return parts[1];
    }catch(e){}
    return 'model';
  }

  function switchToEditor(selectedSrt){
    if(window.SUBTITLEGEN_activateTab) window.SUBTITLEGEN_activateTab('tab-editor');
    const target = selectedSrt || (generatedSrtPaths.length ? generatedSrtPaths[0] : null);
    if(target) notifyEditor(generatedSrtPaths, target);
  }

  // Main tabs (Subtitle / Editor) toggle logic
  (function(){
    const tabsContainer = document.querySelector('.tabs');
    if(!tabsContainer) return;
    const tabs = tabsContainer.querySelectorAll('.tab');
    const panes = {
      'tab-subtitle': document.getElementById('tab-subtitle'),
      'tab-editor': document.getElementById('tab-editor')
    };
    const generateBar = document.getElementById('generateBar');
    function activateTab(target){
      tabs.forEach(t => t.classList.remove('active'));
      Object.keys(panes).forEach(k => { if(panes[k]) panes[k].style.display = 'none'; });
      tabs.forEach(t => { if(t.getAttribute('data-target') === target) t.classList.add('active'); });
      const pane = panes[target];
      if(pane) pane.style.display = 'block';
      if(generateBar){
        generateBar.style.display = (target === 'tab-subtitle') ? 'flex' : 'none';
      }
      if(target === 'tab-editor'){
        const selected = (generatedSrtPaths && generatedSrtPaths.length) ? generatedSrtPaths[0] : '';
        // ask editor to refresh/load current selection
        try{ window.dispatchEvent(new CustomEvent('subtitlegen:showEditor', {detail:{selectedPath: selected, paths: generatedSrtPaths || []}})); }catch(e){}
        if(generatedSrtPaths.length){
          notifyEditor(generatedSrtPaths, selected);
        }
      }
    }
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-target');
        if(!target) return;
        if(target === 'tab-upload'){
          if(videoFileInput) videoFileInput.click();
          return;
        }
        activateTab(target);
      });
    });
    window.SUBTITLEGEN_activateTab = activateTab;
  })();

  // Heading click -> reset to terminal
  (function(){
    const titleEl = document.getElementById('appTitle');
    if(titleEl){
      titleEl.addEventListener('click', () => {
        try{ sessionStorage.removeItem(TERMINAL_SEEN_KEY); }catch(e){}
        // Reload to fully restart the intro flow (ensures tabs/panes are reset)
        window.location.reload();
      });
    }
  })();

  // Update progress display
  function updateProgressStep(stepName) {
    const order = ['transcribing','translating','exporting'];
    const progressSteps = document.querySelectorAll('.progress-step');
    progressSteps.forEach(step => {
      const name = step.getAttribute('data-step');
      step.classList.remove('active');
      step.classList.remove('complete');
      const idx = order.indexOf(name);
      const targetIdx = order.indexOf(stepName);
      if(targetIdx === -1) return;
      if(name === stepName) step.classList.add('active');
      if(stepName === 'done') step.classList.add('complete');
      else if(idx !== -1 && idx < targetIdx) step.classList.add('complete');
    });
  }

  // Main form handling
  const form = document.getElementById('uploadForm');
  const submitBtn = document.getElementById('submitBtn');
  const dropZone = document.getElementById('dropZone');
  const videoFileInput = document.getElementById('videoFileInput');
  const minimalUploadBtn = document.getElementById('minimalUploadBtn');
  const minimalView = document.getElementById('minimalView');
  const fullCard = document.getElementById('fullCard');
  const uploadedFilenameInput = document.getElementById('uploaded_filename');
  const videoPlayerMain = document.getElementById('videoPlayerMain');
  const videoPlayerContainer = document.getElementById('videoPlayerContainer');
  const spinnerWrap = document.getElementById('spinnerWrap');
  const progressSection = document.getElementById('progressSection');

  if(!form) return;

  // Debug: ensure generate button is visibly interactive and log click state
  if(submitBtn){
    try{
      submitBtn.style.cursor = 'pointer';
      submitBtn.addEventListener('click', () => {
        try{
          console.log('submitBtn clicked', { disabled: submitBtn.disabled, uploaded_filename: (uploadedFilenameInput ? uploadedFilenameInput.value : null) });
          if(!uploadedFilenameInput || !uploadedFilenameInput.value){
            appendLog('Please upload a video before generating. Click the Upload button or drag a file onto the page.');
          }
        }catch(e){ console.warn('submitBtn click handler failed', e); }
      });
    }catch(e){ /* silent */ }
  }

  // Drag & drop
  if(dropZone) {
    ['dragenter','dragover'].forEach(e => dropZone.addEventListener(e, ev => {
      ev.preventDefault();
      dropZone.style.borderColor = 'rgba(6,182,212,0.6)';
    }));
    ['dragleave','drop'].forEach(e => dropZone.addEventListener(e, ev => {
      ev.preventDefault();
      dropZone.style.borderColor = 'rgba(255,255,255,0.03)';
    }));
    dropZone.addEventListener('drop', async ev => {
      const files = ev.dataTransfer.files;
      if(files && files.length) await startChunkedUpload(files[0]);
    });
  }

  if(videoFileInput) {
    videoFileInput.addEventListener('change', async ev => {
      if(ev.target.files.length) await startChunkedUpload(ev.target.files[0]);
    });
  }

  // Quick upload button near theme toggle
  const uploadQuickBtn = document.getElementById('uploadQuickBtn');
  if(uploadQuickBtn){
    uploadQuickBtn.style.display = 'none';
    uploadQuickBtn.addEventListener('click', () => {
      if(videoFileInput) videoFileInput.click();
    });
  }

  // Minimal landing upload button triggers file picker
  if(minimalUploadBtn) {
    minimalUploadBtn.addEventListener('click', () => {
      if(videoFileInput) videoFileInput.click();
    });
  }

  // Chunked upload
  async function startChunkedUpload(file) {
    if(!file) return;
    // Clear previous SRTs in editor when a new upload begins
    generatedSrtPaths = [];
    renderResults([]);
    notifyEditor([], null);
    if(uploadQuickBtn) uploadQuickBtn.style.display = 'inline-flex';

    // Reveal full UI (hide minimal landing) when upload starts
    if(minimalView) minimalView.style.display = 'none';
    if(fullCard) fullCard.style.display = 'block';

    // Reset previous state
    uploadedFilenameInput.value = '';

    // Local preview
    if(videoPlayerMain) {
      const objectUrl = URL.createObjectURL(file);
      videoPlayerMain.src = objectUrl;
      try{ videoPlayerMain.load(); }catch(e){}
      if(videoPlayerContainer) videoPlayerContainer.style.display = 'block';
      showUploadTabs();
    }

    const CHUNK_SIZE = 5 * 1024 * 1024;
    const total = Math.ceil(file.size / CHUNK_SIZE);
    const uploadKey = 'upload-id:' + file.name;
    let uploadId = localStorage.getItem(uploadKey) || crypto.randomUUID();
    localStorage.setItem(uploadKey, uploadId);

    // Ask server which chunks it already has (resume support)
    let received = [];
    try {
      const statusResp = await fetch(`${API_BASE_URL}/upload_status?upload_id=${encodeURIComponent(uploadId)}`);
      if(statusResp.ok) {
        const statusJson = await statusResp.json();
        received = statusJson.received || [];
      }
    } catch(e) {
      console.warn('Upload status check failed; continuing without resume', e);
    }

    let uploadedChunks = received.length;
    let assembled = false;
    for(let i = 0; i < total; i++) {
      if(received.includes(i)) continue; // already on server

      const start = i * CHUNK_SIZE;
      const end = Math.min((i + 1) * CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const formData = new FormData();
      formData.append('chunk', chunk, `${file.name}.part${i}`);
      formData.append('index', i);
      formData.append('total', total);
      formData.append('upload_id', uploadId);
      formData.append('filename', file.name);

      try {
        const res = await fetch(`${API_BASE_URL}/upload_chunk`, {
          method: 'POST',
          headers: {
            'X-Upload-Id': uploadId,
            'X-Chunk-Index': i,
            'X-Total-Chunks': total,
            'X-File-Name': file.name
          },
          body: formData
        });
        if(!res.ok) throw new Error('Chunk upload failed');
        const j = await res.json().catch(() => ({}));
        uploadedChunks++;
        assembled = assembled || !!j.assembled;
      } catch(e) {
        console.error('Upload error:', e);
        break;
      }
    }

    // The server assembles on the final chunk, so mark assembled if all parts arrived
    if(uploadedChunks === total) assembled = true;

    if(assembled) {
      uploadedFilenameInput.value = file.name;
      if(videoPlayerMain){
        videoPlayerMain.src = `${API_BASE_URL}/files/media/${file.name}`;
        try{ videoPlayerMain.load(); }catch(e){}
      }
    } else {
      console.warn('Upload did not finish; generation disabled until complete');
    }
  }

  // Form submission with progress tracking
  const logEl = document.getElementById('log');
  const progressStatus = document.getElementById('progressStatus');
  const resultsBox = document.getElementById('results');
  const errorsBox = document.getElementById('errors');
  let currentEventSource = null;
  // interim segments used for live preview of partial SRTs
  let interimSegments = [];

  function appendLog(message){
    if(!logEl) return;
    const div = document.createElement('div');
    div.textContent = message;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderResults(paths){
    if(!resultsBox) return;
    generatedSrtPaths = paths || [];
    if(!generatedSrtPaths.length){ resultsBox.innerHTML = ''; return; }
    const tabsHtml = generatedSrtPaths.map((p, idx) => {
      const langLabel = languageLabelFromPath(p);
      const modelLabel = modelFromPath(p);
      const display = `${langLabel}-${modelLabel}`;
      return `<button class="badge srt-tab ${idx===0 ? 'active' : ''}" data-srt="${p}" data-pane="srt-pane-${idx}">${display}</button>`;
    }).join('');
    const panesHtml = generatedSrtPaths.map((p, idx) => {
      const label = `${languageLabelFromPath(p)}-${modelFromPath(p)}`;
      return `<div class="srt-pane ${idx===0 ? 'active' : ''}" id="srt-pane-${idx}" style="padding:8px;background:rgba(255,255,255,0.02);border-radius:8px;margin-top:8px">
        <div class="muted small">${label}</div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <span class="muted small">Click the language tab to download. Use the Editor tab to open it.</span>
        </div>
      </div>`;
    }).join('');
    resultsBox.innerHTML = `<h3>Generated subtitles</h3><div class="srt-tablist" style="display:flex;gap:6px;flex-wrap:wrap">${tabsHtml}</div><div class="srt-panes">${panesHtml}</div>`;
    const tabs = resultsBox.querySelectorAll('.srt-tab');
    const panes = resultsBox.querySelectorAll('.srt-pane');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      const paneId = tab.getAttribute('data-pane');
      const path = tab.getAttribute('data-srt');
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = resultsBox.querySelector('#' + paneId);
      if(pane) pane.classList.add('active');
      // trigger download
      if(path){
        const label = languageLabelFromPath(path);
        const model = modelFromPath(path);
        const downloadName = `${label}-${model || 'subtitle'}.srt`.replace(/\s+/g,'_');
        const a = document.createElement('a');
        a.href = `${API_BASE_URL}/files/${path}`;
        a.download = downloadName;
        document.body.appendChild(a); a.click(); a.remove();
        notifyEditor(generatedSrtPaths, path);
      }
    }));
    notifyEditor(generatedSrtPaths, generatedSrtPaths[0]);
  }

  function renderErrors(errs){
    if(!errorsBox) return;
    if(!errs || !errs.length){ errorsBox.innerHTML = ''; return; }
    const items = errs.map(e => `<li>${e}</li>`).join('');
    errorsBox.innerHTML = `<h3>Errors / skipped backends</h3><ul class="result-list">${items}</ul>`;
  }

  function setStatus(text){
    if(progressStatus) progressStatus.textContent = text;
  }

  function collectLanguages(){
    const langs = new Set();
    document.querySelectorAll('input[name="languages"]:checked').forEach(cb => langs.add(cb.value));
    const select = document.querySelector('select[name="languages"]');
    if(select){ Array.from(select.selectedOptions).forEach(opt => langs.add(opt.value)); }
    return Array.from(langs);
  }

  function handleProgressMessage(payload){
    let msg = '';
    if(typeof payload === 'string'){
      msg = payload;
      appendLog(msg);
    } else if(payload && payload.type === 'partial' && payload.path){
      msg = `Partial SRT ready (${payload.model || 'model'}): ${payload.path}`;
      appendLog(msg);
      // also add to results list (keeps UI behavior) and attempt a live preview on the main video
      try{ renderResults([payload.path]); }catch(e){ console.warn('renderResults failed', e); }

      // fetch and parse SRT for live preview overlay
      (async ()=>{
        try{
          const resp = await fetch(`${API_BASE_URL}/files/` + encodeURIComponent(payload.path));
          if(!resp.ok) return;
          const srtText = await resp.text();
          const lines = srtText.split('\n');
          const segments = [];
          let current = null;
          for(let i=0;i<lines.length;i++){
            const line = lines[i].trim();
            if(!line) continue;
            if(/^\d+$/.test(line)){
              if(current) segments.push(current);
              current = null;
            } else if(line.includes(' --> ')){
              const parts = line.split(' --> ');
              if(parts.length===2){
                const start = parseSRTTime(parts[0].trim());
                const end = parseSRTTime(parts[1].trim());
                current = {start, end, text: ''};
              }
            } else if(current){
              current.text += (current.text ? '\n' : '') + line;
            }
          }
          if(current) segments.push(current);
          if(segments.length) {
            interimSegments = segments;
            // ensure overlay update run
            updateMainVideoSubtitle();
          }
        }catch(e){ console.warn('parse SRT failed', e); }
      })();
    } else {
      msg = JSON.stringify(payload);
      appendLog(msg);
    }

    // progress step heuristics
    const lower = msg.toLowerCase();
    if(lower.includes('translat')) updateProgressStep('translating');
    else if(lower.includes('export') || lower.includes('.srt')) updateProgressStep('exporting');
    else updateProgressStep('transcribing');
  }

  // Live subtitle overlay update for the main preview video
  const videoSubtitleOverlayMain = document.getElementById('videoSubtitleOverlayMain');
  function updateMainVideoSubtitle(){
    try{
      if(!videoPlayerMain || !interimSegments || interimSegments.length===0) return;
      const t = videoPlayerMain.currentTime;
      let found = -1;
      for(let i=0;i<interimSegments.length;i++){
        const s = interimSegments[i];
        if(t >= s.start && t <= s.end){ found = i; break; }
      }
      if(found >= 0 && videoSubtitleOverlayMain){
        videoSubtitleOverlayMain.textContent = interimSegments[found].text;
        videoSubtitleOverlayMain.style.display = 'block';
      } else if(videoSubtitleOverlayMain){
        videoSubtitleOverlayMain.style.display = 'none';
      }
    }catch(e){ console.warn('updateMainVideoSubtitle failed', e); }
  }
  // bind events once
  if(videoPlayerMain){
    videoPlayerMain.addEventListener('timeupdate', updateMainVideoSubtitle);
    videoPlayerMain.addEventListener('play', updateMainVideoSubtitle);
    videoPlayerMain.addEventListener('seeked', updateMainVideoSubtitle);
  }

  function handleDone(payload){
    setStatus('Done');
    appendLog('Job finished');
    if(spinnerWrap) spinnerWrap.style.display = 'none';
    if(submitBtn) submitBtn.disabled = false;
    if(currentEventSource){ currentEventSource.close(); currentEventSource = null; }
    updateProgressStep('done');
    if(payload){
      if(payload.srt_paths) renderResults(payload.srt_paths);
      if(payload.errors && payload.errors.length) renderErrors(payload.errors);
    }
  }

  function handleError(payload){
    setStatus('Error');
    appendLog(`Error: ${payload}`);
    renderErrors([payload]);
    if(spinnerWrap) spinnerWrap.style.display = 'none';
    if(submitBtn) submitBtn.disabled = false;
    if(currentEventSource){ currentEventSource.close(); currentEventSource = null; }
  }

  function startProgressStream(jobId){
    if(currentEventSource){ currentEventSource.close(); }
    currentEventSource = new EventSource(`${API_BASE_URL}/events/${jobId}`);
    currentEventSource.onmessage = ev => {
      let data;
      try { data = JSON.parse(ev.data); } catch(e){ return; }
      if(!data) return;
      if(data.type === 'progress') handleProgressMessage(data.payload);
      else if(data.type === 'done') handleDone(data.payload);
      else if(data.type === 'error') handleError(data.payload);
    };
    currentEventSource.onerror = () => {
      appendLog('Connection lost. You may need to retry.');
      if(spinnerWrap) spinnerWrap.style.display = 'none';
      if(submitBtn) submitBtn.disabled = false;
      setStatus('Connection lost');
      if(currentEventSource){ currentEventSource.close(); currentEventSource = null; }
    };
  }

  if(form) {
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if(!uploadedFilenameInput.value){
        appendLog('Please upload a video before generating.');
        return;
      }

      // Reset UI state
      if(logEl) logEl.innerHTML = '';
      renderResults([]);
      renderErrors([]);
      if(progressSection) progressSection.style.display = 'block';
      if(spinnerWrap) spinnerWrap.style.display = 'block';
      if(submitBtn) submitBtn.disabled = true;
      setStatus('Running');
      updateProgressStep('transcribing');

      const langs = collectLanguages();
      const fd = new FormData();
      const modelInput = form.querySelector('input[name="model"]');
      fd.append('model', modelInput ? modelInput.value : 'whisper');
      // If the resumable upload assembled file on the server, send its name.
      // Otherwise, if the user selected a local file but didn't finish chunked upload,
      // include the file directly so the server can receive it in this request.
      if(uploadedFilenameInput && uploadedFilenameInput.value){
        fd.append('uploaded_filename', uploadedFilenameInput.value);
      } else if(videoFileInput && videoFileInput.files && videoFileInput.files.length){
        // Attach the raw file so the server will receive and process it immediately.
        fd.append('video', videoFileInput.files[0]);
      }
      langs.forEach(l => fd.append('languages', l));

      try {
        const resp = await fetch(`${API_BASE_URL}/generate`, { method: 'POST', body: fd });
        const j = await resp.json();
        if(!resp.ok || !j.job_id) throw new Error(j.error || 'Failed to start generation');
        appendLog('Job started...');
        startProgressStream(j.job_id);
      } catch(e) {
        handleError(e.message || String(e));
      }
    });
  }

  // Initialize theme from localStorage
  if(savedTheme === 'light') {
    document.documentElement.classList.add('light-mode');
  }
  // ========================================
  // THEME TOGGLE BUTTON (Main Container)
  // ========================================
  
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  
  function updateThemeIcon() {
    const isLightMode = document.documentElement.classList.contains('light-mode');
    themeToggleBtn.className = 'theme-toggle-btn ' + (isLightMode ? 'light-icon' : 'dark-icon');
  }
  
  if(themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function() {
      const html = document.documentElement;
      const isLightMode = html.classList.contains('light-mode');
      
      // Add spinning animation
      themeToggleBtn.classList.add('toggling');
      
      // Toggle theme
      if(isLightMode) {
        html.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
      } else {
        html.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
      }
      
      // Update icon
      updateThemeIcon();
      
      // Remove animation class after completion
      setTimeout(() => {
        themeToggleBtn.classList.remove('toggling');
      }, 500);
    });
    
    // Set initial icon
    updateThemeIcon();
  }

  // ========================================
  // MODEL SELECTION + LANGUAGE FILTERING
  // ========================================

  // Animate and persist model selection
  (function(){
    const modelCards = document.querySelectorAll('.model-card');
    const modelInput = document.querySelector('input[name="model"]');
    if(modelCards && modelCards.length){
      modelCards.forEach(card => {
        card.addEventListener('click', () => {
          if(card.classList.contains('disabled')) return;
          // temporary selecting animation
          card.classList.add('selecting');
          setTimeout(() => {
            card.classList.remove('selecting');
            modelCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const name = card.dataset.name || card.getAttribute('data-name');
            if(modelInput && name) modelInput.value = name;
          }, 220);
        });
      });
    }
  })();

  // Remove popular languages from the "All languages" select to avoid duplicates
  (function(){
    const popular = ['hindi','marathi','spanish','french','german','chinese'];
    const allSelect = document.querySelector('select[name="languages"]');
    if(allSelect) {
      Array.from(allSelect.options).forEach(opt => {
        if(popular.includes((opt.value || '').toLowerCase())) {
          opt.remove();
        }
      });
    }
  })();

  // Install modal handlers (from legacy script) — shows install command and copy action
  (function(){
    const installModal = document.getElementById('installModal');
    const copyBtn = document.getElementById('copyInstall');
    const closeBtn = document.getElementById('closeInstall');
    if(closeBtn) closeBtn.addEventListener('click', ()=>{ if(installModal) installModal.style.display='none'; });
    if(copyBtn) copyBtn.addEventListener('click', ()=>{
      const cmdEl = document.getElementById('installCmd');
      const cmd = (cmdEl && cmdEl.textContent) ? cmdEl.textContent : '';
      if(!cmd) return;
      navigator.clipboard.writeText(cmd).then(()=>{
        copyBtn.textContent = 'Copied';
        setTimeout(()=>copyBtn.textContent='Copy', 1500);
      });
    });
  })();

});
