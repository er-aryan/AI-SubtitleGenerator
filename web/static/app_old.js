document.addEventListener('DOMContentLoaded', function(){
  // ========================================
  // TERMINAL INTRO MANAGEMENT
  // ========================================
  
  const terminalIntro = document.getElementById('terminalIntro');
  const mainContainer = document.getElementById('mainContainer');
  const terminalYesBtn = document.getElementById('terminalYesBtn');
  const terminalNoBtn = document.getElementById('terminalNoBtn');
  const terminalOutput = document.getElementById('terminalOutput');
  
  function hideIntro() {
    if(!terminalIntro) return;
    terminalIntro.classList.add('fade-out');
    setTimeout(() => {
      terminalIntro.classList.add('hidden');
      if(mainContainer) mainContainer.style.display = 'block';
    }, 600);
  }
  
  function showIntro() {
    if(!terminalIntro) return;
    terminalIntro.classList.remove('hidden');
    terminalIntro.classList.add('fade-in');
  }
  
  function startLoadingAnimation() {
    const commands = [
      '$ initializing subtitlegen...',
      '> loading speech recognition models...',
      '✓ ready to generate subtitles'
    ];
    
    let currentCommand = 0;
    
    const loadingInterval = setInterval(() => {
      if(currentCommand < commands.length) {
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.style.marginTop = '8px';
        
        const span = document.createElement('span');
        span.className = 'terminal-text';
        span.style.color = '#22c55e';
        span.textContent = commands[currentCommand];
        
        line.appendChild(span);
        terminalOutput.appendChild(line);
        
        // Trigger animation
        setTimeout(() => {
          line.style.opacity = '1';
        }, 10);
        
        currentCommand++;
      } else {
        clearInterval(loadingInterval);
        // After loading animation completes, hide intro and show main
        setTimeout(() => {
          hideIntro();
        }, 800);
      }
    }, 1000);
  }
  
  // Wire up buttons
  if(terminalYesBtn) {
    terminalYesBtn.addEventListener('click', () => {
      // Disable buttons during transition
      terminalYesBtn.disabled = true;
      terminalNoBtn.disabled = true;
      
      // Start loading animation
      startLoadingAnimation();
    });
  }
  
  if(terminalNoBtn) {
    terminalNoBtn.addEventListener('click', () => {
      // For now, just refresh or do nothing
      alert('Thanks for visiting SubtitleGen! Visit again when you\'re ready to generate subtitles.');
    });
  }
  
  // Helper to parse SRT timecode format: HH:MM:SS,mmm → seconds
  function parseSRTTime(timeStr){
    const parts = timeStr.split(':');
    if(parts.length !== 3) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2].replace(',', '.'));
    return h*3600 + m*60 + s;
  }
  window.parseSRTTime = parseSRTTime; // expose globally for SSE handler


  // Function to show Subtitle & Editor tabs and hide Welcome
  function showUploadTabs() {
    const welcomeTab = document.querySelector('.tab[data-target="tab-welcome"]');
    const hiddenTabs = document.querySelectorAll('.hidden-until-upload');
    const tabContent = document.querySelector('.tab-content');
    
    // Hide welcome tab button and show others
    if(welcomeTab) welcomeTab.classList.remove('active');
    hiddenTabs.forEach(tab => tab.style.display = 'block');
    
    // Switch to Subtitle tab
    const tabs = document.querySelectorAll('.tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabs.forEach(t => t.classList.remove('active'));
    tabPanes.forEach(p => p.style.display = 'none');
    
    const subtitleTab = document.querySelector('.tab[data-target="tab-subtitle"]');
    const subtitlePane = document.getElementById('tab-subtitle');
    if(subtitleTab) subtitleTab.classList.add('active');
    if(subtitlePane) subtitlePane.style.display = 'block';
  }

  // Handle "Go to Upload" button
  const goToUploadBtn = document.getElementById('goToUploadBtn');
  if(goToUploadBtn) {
    goToUploadBtn.addEventListener('click', () => {
      document.querySelector('input[name="video"]').click();
    });
  }

  const form = document.getElementById('uploadForm');
  const submit = document.getElementById('submitBtn');
  const resultsEl = document.getElementById('results');
  const errorsEl = document.getElementById('errors');
  const spinnerWrap = document.getElementById('spinnerWrap');
  const dropZone = document.getElementById('dropZone');
  const videoFileInput = document.getElementById('videoFileInput');
  const uploadedFilenameInput = document.getElementById('uploaded_filename');
  // small progress element
  let uploadProgressBar = null;

  function createProgressBar(){
    if(uploadProgressBar) return uploadProgressBar;
    uploadProgressBar = document.createElement('div');
    uploadProgressBar.style.width = '100%'; uploadProgressBar.style.height = '10px'; uploadProgressBar.style.background = 'rgba(255,255,255,0.03)'; uploadProgressBar.style.borderRadius='6px'; uploadProgressBar.style.marginTop='8px';
    const inner = document.createElement('div'); inner.style.width='0%'; inner.style.height='100%'; inner.style.background='linear-gradient(90deg,#06b6d4,#7c3aed)'; inner.style.borderRadius='6px'; uploadProgressBar.appendChild(inner);
    dropZone.parentNode.insertBefore(uploadProgressBar, dropZone.nextSibling);
    return uploadProgressBar;
  }

  if(!form) return;

  // Drag & drop handlers for resumable chunked upload
  if(dropZone){
    ['dragenter','dragover'].forEach(e=>dropZone.addEventListener(e, (ev)=>{ ev.preventDefault(); ev.stopPropagation(); dropZone.style.borderColor='rgba(6,182,212,0.6)'; }));
    ['dragleave','drop'].forEach(e=>dropZone.addEventListener(e, (ev)=>{ ev.preventDefault(); ev.stopPropagation(); dropZone.style.borderColor='rgba(255,255,255,0.03)'; }));
    dropZone.addEventListener('drop', async function(ev){
      const files = ev.dataTransfer.files; if(!files || files.length===0) return; const file = files[0];
      await startChunkedUpload(file);
    });
    // clicking the dropZone will trigger the file input via the surrounding label,
    // avoid programmatically clicking it to prevent double file-picker prompts.
    videoFileInput.addEventListener('change', async (ev)=>{ if(ev.target.files.length) await startChunkedUpload(ev.target.files[0]); });
  }

  // Chunked upload implementation (simple resumable via server-side chunk files)
  async function startChunkedUpload(file){
    // Show a local preview immediately while upload runs
    let objectUrl = null;
    try{
      const vMainPreview = document.getElementById('videoPlayerMain');
      if(vMainPreview && file){
        objectUrl = URL.createObjectURL(file);
        vMainPreview.src = objectUrl;
        try{ vMainPreview.load(); }catch(e){}
        // Show the video player container
        const container = document.getElementById('videoPlayerContainer');
        if(container) container.style.display = 'block';
        // Show the upload tabs (Subtitle & Editor) and hide Welcome
        showUploadTabs();
      }
    }catch(e){ console.warn('local preview setup failed', e); }
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const total = Math.ceil(file.size / CHUNK_SIZE);
    // pick/generate upload id (store per filename)
    let uploadId = localStorage.getItem('upload-id:' + file.name) || crypto.randomUUID();
    localStorage.setItem('upload-id:' + file.name, uploadId);

    // ensure progress UI
  const pbar = createProgressBar(); const inner = pbar.firstChild;
  const dropZoneText = document.getElementById('dropZoneText');
  if(dropZoneText) dropZoneText.textContent = `Uploading: ${file.name} (0%)`;

    // query server for already received chunks
    let resp = await fetch('/upload_status?upload_id=' + encodeURIComponent(uploadId));
    let received = [];
    if(resp.ok){ const j = await resp.json(); received = j.received || []; }
    // compute next index
    const receivedSet = new Set(received);
    let uploadedCount = received.length;

    for(let i=0;i<total;i++){
      if(receivedSet.has(i)) continue; // skip already uploaded
      const start = i * CHUNK_SIZE; const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);
      const form = new FormData(); form.append('chunk', blob, file.name);
      // use headers for metadata
      const headers = {
        'X-Upload-Id': uploadId,
        'X-Chunk-Index': String(i),
        'X-Total-Chunks': String(total),
        'X-File-Name': file.name
      };
      try{
        const r = await fetch('/upload_chunk', {method:'POST', body: form, headers});
        if(!r.ok) throw new Error('Upload chunk failed: ' + r.status);
        const jr = await r.json();
        uploadedCount += 1;
        const pct = Math.round((uploadedCount/total)*100);
        inner.style.width = pct + '%';
        if(dropZoneText) dropZoneText.textContent = `Uploading: ${file.name} (${pct}%)`;
        // if assembled, server may indicate final path
        if(jr.assembled){
          // set hidden input so generate can use server-stored file
          if(uploadedFilenameInput) uploadedFilenameInput.value = file.name;
          // show quick action
          const span = document.createElement('div'); span.className='muted small'; span.textContent = 'Upload complete: ' + file.name; resultsEl.appendChild(span);
          if(dropZoneText) dropZoneText.textContent = `Uploaded: ${file.name}`;

          // set main video preview source so user can preview immediately
          try{
            const vMain = document.getElementById('videoPlayerMain');
            if(vMain){
              // uploaded files are saved to `media/<filename>` on the server,
              // so request the file as `/files/media/<filename>` so the
              // `files` endpoint will serve the correct path.
              vMain.src = '/files/' + encodeURIComponent('media/' + file.name);
              vMain.load();
              // revoke any temporary object URL used for local preview
              try{ if(objectUrl) URL.revokeObjectURL(objectUrl); }catch(e){}
            }
          }catch(e){ console.warn('set main video src failed', e); }
        }
      }catch(err){ console.error(err); alert('Upload failed: '+err.message); break; }
    }
    inner.style.width = '100%';
    if(dropZoneText && uploadedFilenameInput && uploadedFilenameInput.value === file.name){ dropZoneText.textContent = `Uploaded: ${file.name}`; }
  }

  // Function to update progress UI
  function updateProgressStep(stepName) {
    const steps = document.querySelectorAll('.progress-step');
    steps.forEach(step => {
      if(step.dataset.step === stepName) {
        step.style.opacity = '1';
        step.style.background = 'rgba(6,182,212,0.15)';
        step.style.borderLeft = '3px solid #06b6d4';
      } else if(step.dataset.step < stepName) {
        step.style.opacity = '0.6';
        step.style.background = 'rgba(6,182,212,0.05)';
      }
    });
    
    const statusEl = document.getElementById('progressStatus');
    const statusMap = {
      'transcribing': '⏳ Transcribing',
      'translating': '🌍 Translating',
      'exporting': '📦 Exporting'
    };
    if(statusEl) statusEl.textContent = statusMap[stepName] || 'Processing...';
  }

  form.addEventListener('submit', async function(ev){
    ev.preventDefault();
    resultsEl.innerHTML = '';
    errorsEl.innerHTML = '';
    spinnerWrap.style.display = 'block';
    submit.disabled = true;
    
    // Show progress section and start with transcribing step
    const progressSection = document.getElementById('progressSection');
    if(progressSection) progressSection.style.display = 'block';
    updateProgressStep('transcribing');

    const fd = new FormData(form);
    try{
      const resp = await fetch('/generate', {method:'POST', body:fd, headers:{'X-Requested-With':'XMLHttpRequest'}});
      if(!resp.ok){
        const txt = await resp.text();
        errorsEl.textContent = `Server error: ${resp.status}`;
        console.error(txt);
        spinnerWrap.style.display = 'none';
        submit.disabled = false;
        return;
      }

      const j = await resp.json();
      const jobId = j.job_id;
      // subscribe to SSE for live logs and final result
      const es = new EventSource('/events/' + jobId);
      const logEl = document.getElementById('log');
      if(logEl) logEl.innerHTML = '';

      // interim segments for live preview subtitles on main video player
      let interimSegments = [];
      const videoPlayerMain = document.getElementById('videoPlayerMain');
      const videoSubtitleOverlayMain = document.getElementById('videoSubtitleOverlayMain');

      // function to show subtitle on main video based on current time
      function updateMainVideoSubtitle(){
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
        } else if(videoSubtitleOverlayMain) {
          videoSubtitleOverlayMain.style.display = 'none';
        }
      }

      // wire up main video to update subtitle overlay during playback
      if(videoPlayerMain){
        videoPlayerMain.addEventListener('timeupdate', updateMainVideoSubtitle);
        videoPlayerMain.addEventListener('play', updateMainVideoSubtitle);
        videoPlayerMain.addEventListener('seeked', updateMainVideoSubtitle);
      }

      es.onmessage = function(evt){
        try{
          const item = JSON.parse(evt.data);
          if(item.type === 'progress'){
            const msg = item.payload.toLowerCase();
            // Update progress step based on message content
            if(msg.includes('translat')) updateProgressStep('translating');
            else if(msg.includes('export') || msg.includes('export')) updateProgressStep('exporting');
            
            const p = document.createElement('div');
            p.textContent = '→ ' + item.payload;
            p.style.padding = '4px 0';
            p.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            if(logEl) logEl.appendChild(p);
            if(logEl) logEl.scrollTop = logEl.scrollHeight;
          } else if(item.type === 'partial'){
            // interim SRT file ready — parse and show on main video preview
            const srtPath = item.payload.path;
            const modelName = item.payload.model;
            if(srtPath){
              (async ()=>{
                try{
                  const resp = await fetch('/files/' + encodeURIComponent(srtPath));
                  if(!resp.ok) return;
                  const srtText = await resp.text();
                  // simple SRT parser: extract segments
                  const lines = srtText.split('\n');
                  const segments = [];
                  let current = null;
                  for(let i=0;i<lines.length;i++){
                    const line = lines[i].trim();
                    if(!line) continue;
                    if(/^\d+$/.test(line)){
                      // new segment index
                      if(current) segments.push(current);
                      current = null;
                    } else if(line.includes(' --> ')){
                      // timecode line
                      const parts = line.split(' --> ');
                      if(parts.length===2){
                        const start = parseSRTTime(parts[0].trim());
                        const end = parseSRTTime(parts[1].trim());
                        current = {start, end, text: ''};
                      }
                    } else if(current){
                      // text line
                      current.text += (current.text ? '\n' : '') + line;
                    }
                  }
                  if(current) segments.push(current);
                  if(segments.length > 0){
                    interimSegments = segments;
                    updateMainVideoSubtitle();
                  }
                }catch(e){ console.warn('parse SRT failed', e); }
              })();
            }
          } else if(item.type === 'done'){
            // Update progress to complete
            updateProgressStep('exporting');
            const statusEl = document.getElementById('progressStatus');
            if(statusEl) statusEl.textContent = '✅ Complete';
            
            // show final results
            const results = item.payload.srt_paths || [];
            const errors = item.payload.errors || [];
            if(results.length){
              const ul = document.createElement('ul'); ul.className='result-list';
              results.forEach(r=>{ const li = document.createElement('li'); const a = document.createElement('a'); a.href='/files/'+encodeURIComponent(r); a.textContent = r; li.appendChild(a); ul.appendChild(li); });
              resultsEl.appendChild(ul);
            } else {
              resultsEl.textContent = 'No subtitle files generated.';
            }

            if(errors.length){
              const ul = document.createElement('ul'); ul.className='result-list';
              errors.forEach(e=>{ const li = document.createElement('li'); li.textContent = e; ul.appendChild(li)});
              errorsEl.appendChild(ul);
            }
            es.close();
            spinnerWrap.style.display = 'none';
            submit.disabled = false;
          } else if(item.type === 'error'){
            const p = document.createElement('div'); p.textContent = 'Error: '+item.payload; if(logEl) logEl.appendChild(p);
            es.close();
            spinnerWrap.style.display = 'none';
            submit.disabled = false;
          }
        }catch(err){ console.error('SSE parse error', err); }
      };
      es.onerror = function(ev){ console.error('SSE error', ev); };

    }catch(err){
      errorsEl.textContent = String(err);
      console.error(err);
      spinnerWrap.style.display = 'none';
      submit.disabled = false;
    }
  });

  // Tab handling
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-pane');
  tabs.forEach(t => t.addEventListener('click', ()=>{
    const target = t.dataset.target;
    tabs.forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    tabContents.forEach(c=>{ if(c.id===target) c.style.display='block'; else c.style.display='none'; });
  }));

  // Model card selection
  const modelInput = document.querySelector('input[name="model"]');
  document.querySelectorAll('.model-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const name = card.dataset.name;
      const disabled = card.classList.contains('disabled');
      if(disabled){
        // show install guidance modal for missing models
        const hints = {
          'whisper':'pip install -U openai-whisper',
          'wav2vec2':'pip install transformers torch',
          'silero':'pip install torch (then use torch.hub to load silero)',
          'nemo':'pip install nemo-toolkit[asr]',
          'vosk':'pip install vosk'
        };
        const cmd = hints[name] || 'pip install <package-for-'+name+'>';
        const modal = document.getElementById('installModal');
        const installCmd = document.getElementById('installCmd');
        if(modal && installCmd){
          installCmd.textContent = cmd;
          modal.style.display = 'flex';
        } else {
          alert(name.toUpperCase() + ' is not installed. Suggested install:\n' + cmd + '\n\nInstall in your venv and restart the server.');
        }
        return;
      }
      document.querySelectorAll('.model-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      if(modelInput) modelInput.value = name;
    });
  });

  // Ensure a default model is selected on load
  (function ensureDefault(){
    const selected = document.querySelector('.model-card.selected');
    if(!selected){
      const first = document.querySelector('.model-card:not(.disabled)');
      if(first){ first.classList.add('selected'); if(modelInput) modelInput.value = first.dataset.name; }
    }
  })();



  // Install modal handlers
  const installModal = document.getElementById('installModal');
  const copyBtn = document.getElementById('copyInstall');
  const closeBtn = document.getElementById('closeInstall');
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ if(installModal) installModal.style.display='none'; });
  if(copyBtn) copyBtn.addEventListener('click', ()=>{
    const cmd = document.getElementById('installCmd').textContent || '';
    navigator.clipboard.writeText(cmd).then(()=>{
      copyBtn.textContent = 'Copied';
      setTimeout(()=>copyBtn.textContent='Copy', 1500);
    });
  });

});
