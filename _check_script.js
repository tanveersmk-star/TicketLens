
    // ─── State ───
    let pdfText = "";
    let pdfPages = [];
    let smData = null;
    let archData = null;
    let reviewTranslations = null;
    let currentFileName = "";
    let analysisComplete = false;
    let pendingReanalyzeModel = null;

    // ─── DOM ───
    const $ = id => document.getElementById(id);
    const elDropzone = $('dropzone');
    const elFileInput = $('file-input');
    const elFileStatus = $('file-status');
    const elProgress = $('progress-panel');
    const elResults = $('results-area');
    const elAlert = $('alert-box');

    // ──────────────────────────────────────────────────
    // ─── Model Registry (Dynamic from config + localStorage) ───
    // ──────────────────────────────────────────────────
    const LS_KEY = 'ITSM_MODELS_CONFIG';
    const ICON_COLORS = [
      'linear-gradient(135deg,#00a67e,#007a5e)',
      'linear-gradient(135deg,#5b6af0,#3a47d5)',
      'linear-gradient(135deg,#f07030,#c0501e)',
      'linear-gradient(135deg,#7c3aed,#5b21b6)',
      'linear-gradient(135deg,#0078b4,#005a8c)',
      'linear-gradient(135deg,#d63d2f,#a02818)',
      'linear-gradient(135deg,#e69500,#a06800)',
    ];

    function seedFromConfig() {
      const cfg = window.CONFIG || {};
      const keys = cfg.KEYS || {};
      const eps  = cfg.ENDPOINTS || {};
      const defaults = [
        { id:'openai', label:'OpenAI', modelId:'gpt-4o-mini', iconText:'AI', iconBg:ICON_COLORS[0] },
        { id:'glm5',   label:'GLM',    modelId:'glm-4-flash',  iconText:'GL', iconBg:ICON_COLORS[1] },
        { id:'qwen',   label:'Qwen',   modelId:'qwen-max',     iconText:'QW', iconBg:ICON_COLORS[2] },
      ];
      const models = Object.keys(eps).map((id, idx) => {
        const def = defaults.find(d => d.id === id) || {};
        return {
          id,
          label:   def.label    || id,
          modelId: eps[id].model || '',
          url:     eps[id].url   || '',
          apiKey:  keys[id]      || '',
          iconText:def.iconText  || id.slice(0,2).toUpperCase(),
          iconBg:  def.iconBg    || ICON_COLORS[idx % ICON_COLORS.length],
          enabled: true,
          isDefault: idx === 0  // first model is default
        };
      });
      return models;
    }

    function getConfiguredModels() {
      try {
        const stored = localStorage.getItem(LS_KEY);
        if (stored) return JSON.parse(stored);
      } catch(_) {}
      return seedFromConfig();
    }

    function saveConfiguredModels(models) {
      localStorage.setItem(LS_KEY, JSON.stringify(models));
      renderActiveModelBar();
      updateReanalyzeToolbarModels();
      resetToNewFile(); // Config changed → reset app
    }

    // ── Get active (default) model ──
    function getActiveModel() {
      const models = getConfiguredModels();
      return models.find(m => m.isDefault) || models[0] || null;
    }

    // ── Set a model as default ──
    function setDefaultModel(id) {
      const models = getConfiguredModels();
      models.forEach(m => m.isDefault = (m.id === id));
      saveConfiguredModels(models);
      renderAdminModelList();
      showAdminNotice(`✓ "${models.find(m=>m.id===id)?.label || id}" is now the default model. App reset.`, 'success');
    }

    // ── Key masking ──
    function maskKey(key) {
      if (!key || key.startsWith('YOUR_')) return 'No key set';
      if (key.length <= 10) return '••••••••';
      return key.slice(0, 6) + '••••••••••••' + key.slice(-4);
    }
    function maskUrl(url) {
      try { return new URL(url).hostname; } catch(_) { return url.slice(0,40); }
    }

    // ── Render active model bar (header chip) ──
    function renderActiveModelBar() {
      const m = getActiveModel();
      const iconEl  = $('hmc-icon');
      const nameEl  = $('hmc-name');
      const subEl   = $('hmc-sub');
      if (!m) {
        if (nameEl) nameEl.textContent = 'No model configured';
        return;
      }
      if (iconEl) { iconEl.textContent = m.iconText || m.id.slice(0,2).toUpperCase(); iconEl.style.background = m.iconBg; }
      if (nameEl) nameEl.textContent = m.label;
      if (subEl)  subEl.textContent  = m.modelId + ' · ' + maskUrl(m.url);
    }

    // ── Utility: simple HTML escape for dynamic pill content ──
    function escHtml(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ──────────────────────────────────────────────────
    // ─── Admin Panel ───
    // ──────────────────────────────────────────────────
    function openAdmin() {
      renderAdminModelList();
      $('admin-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeAdmin() {
      $('admin-overlay').classList.remove('open');
      document.body.style.overflow = '';
      // Close any open edit forms
      document.querySelectorAll('.model-admin-editform.open').forEach(f => f.classList.remove('open'));
      $('admin-addform').classList.remove('open');
    }
    function adminOverlayClick(e) {
      if (e.target === $('admin-overlay')) closeAdmin();
    }
    function toggleAddForm() {
      $('admin-addform').classList.toggle('open');
    }

    function renderAdminModelList() {
      const models = getConfiguredModels();
      const list = $('admin-model-list');
      if (!list) return;
      if (models.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-light);">No models configured. Add one below.</div>';
        return;
      }
      list.innerHTML = models.map((m, idx) => {
        const isDefault = !!m.isDefault;
        const hasKey = m.apiKey && !m.apiKey.startsWith('YOUR_') && m.apiKey.trim() !== '';
        return `
        <div class="model-admin-card" id="acard-${idx}" style="${isDefault ? 'border-color:var(--primary);box-shadow:0 0 0 2px rgba(0,166,126,0.12);' : ''}">
          <div class="model-admin-card-main">
            <span class="model-admin-icon" style="background:${m.iconBg};">${escHtml(m.iconText||'?')}</span>
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <div class="model-admin-label">${escHtml(m.label)}</div>
                ${isDefault ? '<span class="badge-default">★ Default</span>' : ''}
              </div>
              <div class="model-admin-sub">${escHtml(m.modelId)}</div>
              <div class="model-admin-url">${escHtml(m.url)}</div>
            </div>
            <div>
              <div style="font-size:0.66rem;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;">API Key</div>
              <div class="model-admin-key-row">
                <span class="model-admin-key-text ${hasKey ? '' : 'no-key'}" id="keytext-${idx}">${hasKey ? escHtml(maskKey(m.apiKey)) : 'No key set'}</span>
                <button class="btn-eye" onclick="toggleKeyReveal(${idx})" title="Show/Hide key">👁</button>
              </div>
            </div>
            <div class="model-admin-actions">
              ${!isDefault
                ? `<button class="btn-set-default" onclick="setDefaultModel('${m.id}')" title="Use this model for all operations">★ Set Default</button>`
                : '<span style="font-size:0.68rem;color:var(--primary);font-weight:700;">✓ In Use</span>'}
              <button class="btn-admin-action" onclick="adminTestModel(${idx})" title="Test Connection">⚡ Test</button>
              <button class="btn-admin-action" onclick="toggleEditForm(${idx})">✏ Edit</button>
              <button class="btn-admin-action del" onclick="adminDeleteModel(${idx})">✕</button>
            </div>
          </div>
          <!-- Full-width readable test result panel -->
          <div class="model-test-result" id="testresult-${idx}"></div>
          <div class="model-admin-editform" id="editform-${idx}">
            <div class="admin-notice" style="margin-bottom:10px;">⚠ Saving will reset the current analysis.</div>
            <div class="admin-form-grid">
              <div class="admin-field"><label>Provider Label</label><input type="text" id="ef-label-${idx}" value="${escHtml(m.label)}"></div>
              <div class="admin-field"><label>Model ID</label><input type="text" id="ef-modelid-${idx}" value="${escHtml(m.modelId)}"></div>
              <div class="admin-field full"><label>Endpoint URL</label><input type="text" id="ef-url-${idx}" value="${escHtml(m.url)}"></div>
              <div class="admin-field full"><label>API Key</label><input type="password" id="ef-key-${idx}" value="${escHtml(m.apiKey)}" placeholder="Leave blank to keep existing"></div>
              <div class="admin-field"><label>Icon Text (2-3 chars)</label><input type="text" id="ef-icon-${idx}" value="${escHtml(m.iconText||'')}" maxlength="3"></div>
              <div class="admin-field"><label>Icon Color / Gradient</label><input type="text" id="ef-color-${idx}" value="${escHtml(m.iconBg)}"></div>
            </div>
            <div class="admin-form-actions">
              <button class="btn-admin-save" onclick="adminSaveEdit(${idx})">✓ Save & Apply</button>
              <button class="btn-admin-cancel" onclick="toggleEditForm(${idx})">Cancel</button>
            </div>
          </div>
        </div>`).join('');
    }

    function toggleKeyReveal(idx) {
      const models = getConfiguredModels();
      const m = models[idx];
      if (!m) return;
      const el = $('keytext-' + idx);
      if (!el) return;
      el.textContent = el.dataset.revealed === '1' ? maskKey(m.apiKey) : (m.apiKey || '');
      el.dataset.revealed = el.dataset.revealed === '1' ? '0' : '1';
    }

    function toggleEditForm(idx) {
      const form = $('editform-' + idx);
      if (!form) return;
      form.classList.toggle('open');
    }

    function adminSaveEdit(idx) {
      const models = getConfiguredModels();
      if (idx < 0 || idx >= models.length) return;
      const m = models[idx];
      const newKey = $('ef-key-' + idx)?.value || '';
      models[idx] = {
        ...m,
        label:   $('ef-label-'   + idx)?.value || m.label,
        modelId: $('ef-modelid-' + idx)?.value || m.modelId,
        url:     $('ef-url-'     + idx)?.value || m.url,
        apiKey:  newKey.trim() ? newKey.trim() : m.apiKey,
        iconText:$('ef-icon-'    + idx)?.value || m.iconText,
        iconBg:  $('ef-color-'   + idx)?.value || m.iconBg,
      };
      saveConfiguredModels(models);
      renderAdminModelList();
      showAdminNotice('✓ Model updated. App has been reset.', 'success');
    }

    function adminDeleteModel(idx) {
      const models = getConfiguredModels();
      if (!confirm(`Delete model "${models[idx]?.label}"? This will reset the app.`)) return;
      models.splice(idx, 1);
      saveConfiguredModels(models);
      renderAdminModelList();
      showAdminNotice('✓ Model deleted. App has been reset.', 'success');
    }

    function adminSaveNewModel() {
      const label   = $('new-label')?.value.trim();
      const modelId = $('new-modelid')?.value.trim();
      const url     = $('new-url')?.value.trim();
      const apiKey  = $('new-key')?.value.trim();
      const iconText= ($('new-icon')?.value.trim() || label.slice(0,2)).toUpperCase();
      const iconBg  = $('new-color')?.value.trim() || ICON_COLORS[0];
      if (!label || !modelId || !url) {
        showAdminNotice('⚠ Label, Model ID and URL are required.', 'warn');
        return;
      }
      const models = getConfiguredModels();
      const id = label.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,20) + '_' + Date.now().toString(36);
      models.push({ id, label, modelId, url, apiKey, iconText, iconBg, enabled: true });
      saveConfiguredModels(models);
      // Clear the form
      ['new-label','new-modelid','new-url','new-key','new-icon'].forEach(f => { if ($(f)) $(f).value=''; });
      $('admin-addform').classList.remove('open');
      renderAdminModelList();
      showAdminNotice('✓ New model added. App has been reset.', 'success');
    }

    function adminResetDefaults() {
      if (!confirm('Reset to config.js defaults? All custom models will be removed and the app will reset.')) return;
      localStorage.removeItem(LS_KEY);
      saveConfiguredModels(seedFromConfig()); // seeds and saves
      renderAdminModelList();
      showAdminNotice('✓ Reset to config.js defaults.', 'success');
    }

    async function adminTestModel(idx) {
      const models = getConfiguredModels();
      const m = models[idx];
      if (!m) return;
      const panel = $('testresult-' + idx);
      if (!panel) return;
      panel.className = 'model-test-result'; // reset
      panel.textContent = '⏳ Testing connection…';
      panel.style.display = 'block';
      panel.style.background = 'var(--teal-bg)';
      panel.style.color = 'var(--primary-dark)';
      panel.style.borderLeft = '4px solid var(--primary)';
      try {
        const resp = await fetch(m.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${m.apiKey}` },
          body: JSON.stringify({ model: m.modelId, max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] })
        });
        if (resp.ok) {
          panel.className = 'model-test-result ok';
          panel.innerHTML = '✅ <strong>Connection successful.</strong> The model responded correctly with HTTP 200.';
        } else {
          const rawText = await resp.text().catch(() => '');
          let errBody = {};
          try { errBody = JSON.parse(rawText); } catch(_) {}
          const apiMsg = errBody?.error?.message || errBody?.message || rawText || `HTTP ${resp.status}`;
          panel.className = 'model-test-result err';
          panel.innerHTML = `<strong>❌ HTTP ${resp.status} — ${escHtml(m.label)}</strong><br><br>
            <strong>Error:</strong> ${escHtml(apiMsg)}<br><br>
            <strong>Model ID sent:</strong> <code style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">${escHtml(m.modelId)}</code><br>
            <strong>Endpoint:</strong> <code style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">${escHtml(m.url)}</code><br><br>
            <em style="color:#7f1d1d;">Tip: Click ✏ Edit to update the Model ID or API Key, then test again.</em>`;
        }
      } catch(e) {
        panel.className = 'model-test-result err';
        panel.innerHTML = `<strong>❌ Network Error</strong><br><br>
          Could not reach: <code style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">${escHtml(m.url)}</code><br><br>
          ${escHtml(e.message)}<br><br>
          <em style="color:#7f1d1d;">Check that the Endpoint URL is correct and accessible from your browser.</em>`;
      }
    }

    function showAdminNotice(msg, type='success') {
      const el = $('admin-notice');
      if (!el) return;
      el.style.display = 'flex';
      el.style.background = type === 'success' ? 'var(--success-bg)' : 'var(--warning-bg)';
      el.style.color      = type === 'success' ? 'var(--success)'    : 'var(--warning)';
      el.style.border     = `1px solid ${type==='success'?'var(--success-border)':'var(--warning-border)'}`;
      el.textContent = msg;
      setTimeout(() => { el.style.display='none'; }, 4000);
    }

    function updateReanalyzeToolbarModels() {
      // Rebuild toolbar model buttons when registry changes
      if (!analysisComplete) return;
      const models = getConfiguredModels();
      const pillsEl = $('toolbar-model-pills');
      if (!pillsEl) return;
      pillsEl.innerHTML = '';
      const currentRadio = document.querySelector('input[name="ai-model"]:checked');
      const currentId = currentRadio ? currentRadio.value : '';
      models.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'toolbar-model-btn' + (m.id === currentId ? ' active-model' : '');
        btn.textContent = m.label;
        btn.title = m.modelId;
        btn.dataset.modelKey = m.id;
        if (m.id !== currentId) btn.onclick = () => selectToolbarModel(m.id);
        pillsEl.appendChild(btn);
      });
    }

    // ─── File Handling ───
    $('btn-browse').addEventListener('click', e => { e.stopPropagation(); elFileInput.click(); });
    elDropzone.addEventListener('click', () => elFileInput.click());
    elFileInput.addEventListener('change', e => { if (e.target.files.length) runPipeline(e.target.files[0]); });
    elDropzone.addEventListener('dragover', e => { e.preventDefault(); elDropzone.classList.add('dragover'); });
    elDropzone.addEventListener('dragleave', () => elDropzone.classList.remove('dragover'));
    elDropzone.addEventListener('drop', e => { e.preventDefault(); elDropzone.classList.remove('dragover'); if (e.dataTransfer.files.length) runPipeline(e.dataTransfer.files[0]); });

    // ─── Init: render active model bar after all scripts load ───
    window.addEventListener('load', function() {
      renderActiveModelBar();
    });

    const getRoleOptions = () => {
      let baseRoles = ["Affected Business User", "Service Desk Agent", "Support Team", "Major Incident Manager", "Problem Manager", "Service Delivery Manager", "Escalation Owner", "Leadership / Tower Lead", "Ignored / Bot"];
      if (window.CONFIG && window.CONFIG.role_sentiment_config) {
         baseRoles = Object.keys(window.CONFIG.role_sentiment_config);
         if (!baseRoles.includes("Ignored / Bot")) baseRoles.push("Ignored / Bot");
      }
      return baseRoles;
    };
    let extractedUsers = [];
    let activeMappingString = "";

    // ─── Reset to New File ───
    function resetToNewFile() {
      pdfText = ""; pdfPages = []; smData = null; archData = null;
      reviewTranslations = null; currentFileName = ""; analysisComplete = false;
      activeMappingString = ""; extractedUsers = [];
      elFileStatus.innerHTML = "";
      elResults.style.display = 'none';
      elProgress.style.display = 'none';
      $('role-mapping-panel').style.display = 'none';
      $('reanalyze-toolbar').style.display = 'none';
      hideError();
      // Reset file input so same file can be re-selected
      elFileInput.value = '';
    }

    // ─── Toolbar: Re-analyze with different model ───
    function updateReanalyzeToolbar(activeModelKey) {
      const fname = currentFileName || '—';
      $('toolbar-filename').textContent = fname;
      const models = getConfiguredModels();
      const activeModel = models.find(m => m.id === activeModelKey) || { label: activeModelKey, modelId: '' };
      $('toolbar-model-label').textContent = `Analyzed with ${activeModel.label}${activeModel.modelId ? ' (' + activeModel.modelId + ')' : ''}`;

      // Build model switch buttons
      const pillsEl = $('toolbar-model-pills');
      pillsEl.innerHTML = '';
      models.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'toolbar-model-btn' + (m.id === activeModelKey ? ' active-model' : '');
        btn.textContent = m.label;
        btn.title = m.modelId;
        btn.dataset.modelKey = m.id;
        if (m.id !== activeModelKey) btn.onclick = () => selectToolbarModel(m.id);
        pillsEl.appendChild(btn);
      });

      pendingReanalyzeModel = null;
      $('btn-reanalyze').disabled = true;
      $('reanalyze-toolbar').style.display = 'block';
    }

    function selectToolbarModel(key) {
      pendingReanalyzeModel = key;
      // Highlight selected
      document.querySelectorAll('#toolbar-model-pills .toolbar-model-btn').forEach(btn => {
        btn.classList.toggle('active-model', btn.dataset.modelKey === key);
      });
      $('btn-reanalyze').disabled = false;
    }

    function triggerReanalyze() {
      if (!pendingReanalyzeModel || !pdfText) return;
      // Set the pending model as the new default then re-run
      const models = getConfiguredModels();
      models.forEach(m => m.isDefault = (m.id === pendingReanalyzeModel));
      localStorage.setItem(LS_KEY, JSON.stringify(models));
      renderActiveModelBar();
      pendingReanalyzeModel = null;
      $('btn-reanalyze').disabled = true;
      if (activeMappingString && activeMappingString.trim()) {
        runAIPipeline();
      } else {
        runPreAnalysis();
      }
    }

    function onModelChange() {
      // Only auto-trigger if we already have PDF text loaded
      if (analysisComplete && activeMappingString && pdfText && pdfText.trim().length > 0) {
         // Analysis is done – don't auto-re-run, let user use the toolbar
         return;
      } else if (pdfText && pdfText.trim().length > 0 && !analysisComplete) {
         runPreAnalysis(); // Re-do pre-analysis with new model if still in role-mapping phase
      }
    }

    // ─── Main Pipeline ───
    async function runPipeline(file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) { showError("Please select a .pdf file."); return; }

      // Validate active model exists and has a key
      const activeModel = getActiveModel();
      if (!activeModel) {
        showError("No AI model configured. Click 'Configure Models' to set one up.");
        return;
      }
      if (!activeModel.apiKey || activeModel.apiKey.startsWith('YOUR_') || activeModel.apiKey.trim() === '') {
        showError(`No API key for "${activeModel.label}". Click 'Configure Models' \u2192 Edit to add your key.`);
        return;
      }

      currentFileName = file.name;
      analysisComplete = false;
      $('reanalyze-toolbar').style.display = 'none';
      hideError();
      elResults.style.display = 'none';
      $('role-mapping-panel').style.display = 'none';
      elProgress.style.display = 'block';
      setStep('extract', 'active'); setStep('mapping', ''); setStep('review', ''); setStep('sm', ''); setStep('arch', '');
      elFileStatus.innerHTML = `Reading <strong>${esc(file.name)}</strong>...`;

      try {
        const ab = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        let pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          pages.push(extractPageText(tc.items));
        }
        pdfPages = pages;
        pdfText = pages.join("\n\n");
        setStep('extract', 'done');
        elFileStatus.innerHTML = `✅ <strong>${esc(file.name)}</strong> — ${pdf.numPages} pages extracted`;

        await runPreAnalysis();
      } catch (err) {
        elProgress.style.display = 'none';
        showError(err.message);
      }
    }

    async function runPreAnalysis() {
      const modelRadio = document.querySelector('input[name="ai-model"]:checked');
      const modelKey = modelRadio ? modelRadio.value : null;
      if (!modelKey) { showError('Please select an AI model first.'); return; }
      // Resolve from dynamic model registry
      const allModels = getConfiguredModels();
      const modelDef = allModels.find(m => m.id === modelKey);
      if (!modelDef) { showError(`Model "${modelKey}" not found in registry.`); return; }
      const apiKey = modelDef.apiKey || '';
      const endpointConf = { url: modelDef.url, model: modelDef.modelId };
      if (!apiKey || apiKey.startsWith('YOUR_') || apiKey.trim() === '') {
        showError(`No API key configured for "${modelDef.label}". Open Configure Models to add one.`);
        return;
      }

      setStep('mapping', 'active');
      $('role-mapping-panel').style.display = 'none';
      elResults.style.display = 'none';
      
      try {
        const userRaw = await callLLM(endpointConf, apiKey, pdfText, getUserExtractionPrompt());
        const userObj = safeParseJSON(userRaw);
        extractedUsers = userObj.users || [];
        
        let mapHtml = '';
        if (extractedUsers.length === 0) {
            mapHtml = '<div style="color:var(--text-muted);font-style:italic;">No distinct human users identified in the text.</div>';
        } else {
            extractedUsers.forEach((u, i) => {
              let opts = getRoleOptions().map(r => `<option value="${r}" ${r.toLowerCase() === (u.suggested_role || '').toLowerCase() ? 'selected' : ''}>${r}</option>`).join('');
              mapHtml += `<div class="role-map-row">
                <div class="role-map-name">👤 ${esc(u.name)}</div>
                <select id="user-role-${i}" class="role-map-select">${opts}</select>
              </div>`;
            });
        }
        $('role-mapping-list').innerHTML = mapHtml;
        setStep('mapping', 'done');
        $('role-mapping-panel').style.display = 'block';

      } catch(err) {
        showError("Failed to extract roles: " + err.message);
        setStep('mapping', 'done'); // allow failure fallback
        $('role-mapping-panel').style.display = 'block';
      }
    }

    async function runFullAnalysis() {
      // Serialize selections
      activeMappingString = "";
      extractedUsers.forEach((u, i) => {
         const sel = $(`user-role-${i}`) ? $(`user-role-${i}`).value : u.suggested_role;
         activeMappingString += `- ${u.name}: ${sel}\n`;
      });
      if (!activeMappingString) activeMappingString = "No explicit human actors mapped.";
      
      $('role-mapping-panel').style.display = 'none';
      runAIPipeline();
    }

    async function runAIPipeline() {
      const modelRadio = document.querySelector('input[name="ai-model"]:checked');
      const modelKey = modelRadio ? modelRadio.value : null;
      if (!modelKey) { showError('Please select an AI model first.'); return; }
      // Resolve from dynamic model registry
      const allModels = getConfiguredModels();
      const modelDef = allModels.find(m => m.id === modelKey);
      if (!modelDef) { showError(`Model "${modelKey}" not found in registry.`); return; }
      const apiKey = modelDef.apiKey || '';
      const endpointConf = { url: modelDef.url, model: modelDef.modelId };
      if (!apiKey || apiKey.startsWith('YOUR_') || apiKey.trim() === '') {
        showError(`No API key configured for "${modelDef.label}". Open Configure Models to add one.`);
        return;
      }

      hideError();
      elProgress.style.display = 'block';
      
      setStep('review', 'active'); setStep('sm', ''); setStep('arch', '');
      
      // Enforce the Sentiment Config via Prompt Injection
      let sentimentRules = "";
      if (window.CONFIG && window.CONFIG.role_sentiment_config) {
          const cfg = window.CONFIG.role_sentiment_config;
          const allowedRoles = Object.keys(cfg).filter(k => cfg[k] === true);
          const deniedRoles = Object.keys(cfg).filter(k => cfg[k] === false);
          
          sentimentRules = `
[ABSOLUTE STRICT SENTIMENT ENFORCEMENT RULES]
You have been provided a list of humans and their user-validated roles below.
BEFORE setting 'sentiment_flag' on ANY timeline event, you MUST look up the actor's mapped role.
If the actor's role evaluates to ANY of these -> [${deniedRoles.join(", ")}] -> YOU MUST FORCIBLY SET sentiment_flag = null. NO EXCEPTIONS.
Do NOT flag system notifications, automated closure templates ("Guten Tag! Wir haben..."), or operational follow-ups as frustration.
Sentiment (frustration, escalation, concern) CAN ONLY BE SET if the actor's role is EXACTLY one of these -> [${allowedRoles.join(", ")}].
Violating this rule breaks the data contract.`;
      }

      const mappingInjection = `

===========================================
CRITICAL ITSM TICKET ROLE IDENTIFICATION:
Use the following human-verified role mapping to interpret actions correctly.
${sentimentRules}
---
${activeMappingString}
===========================================
`;
      const modReviewPrompt = REVIEW_TRANSLATE_PROMPT + mappingInjection;
      const modSmPrompt = SM_SYSTEM_PROMPT + mappingInjection;

      try {
        renderReviewTab(pdfText, pdfPages, null);
        elResults.style.display = 'block';
        switchTab('review');
        
        try {
          const reviewRaw = await callLLM(endpointConf, apiKey, pdfText, modReviewPrompt);
          reviewTranslations = safeParseJSON(reviewRaw);
          
          // --- FRONT-END ENFORCEMENT FILTER FOR SENTIMENT ---
          // Enforce role-based sentiment config by stripping sentiments from non-allowed roles
          if (reviewTranslations && reviewTranslations.timeline && window.CONFIG && window.CONFIG.role_sentiment_config) {
             const cfg = window.CONFIG.role_sentiment_config;
             const normalizeKey = txt => String(txt || '').trim().toLowerCase();
             
             // Build actor role map from user mapping
             const actorMap = {};
             activeMappingString.split('\n').filter(Boolean).forEach(line => {
                const match = line.match(/^- (.*?): (.*)$/);
                if (match) actorMap[match[1].trim()] = match[2].trim();
             });
             
             // Helper: find mapped role by actor name
             const findMappedRole = (actorText) => {
                if (!actorText) return null;
                const text = normalizeKey(actorText);
                // Exact match
                const exact = Object.keys(actorMap).find(name => normalizeKey(name) === text);
                if (exact) return actorMap[exact];
                // Partial match
                const partial = Object.keys(actorMap).find(name => text.includes(normalizeKey(name)) || normalizeKey(name).includes(text));
                return partial ? actorMap[partial] : null;
             };
             
             // Helper: detect if activity describes support team work (not user concern)
             const isSupportTeamActivity = (actorText, summaryText) => {
                const combined = `${actorText || ''} ${summaryText || ''}`.toLowerCase();
                return /\b(support\s+team|service\s+desk|resolver|agent|internal\s+note|ops\s+team|status\s+update|requested|acknowledged|confirmed|asked|continued\s+to|closed|reassigned|transferred|checked)\b/.test(combined);
             };
             
             reviewTranslations.timeline.forEach(ev => {
                 if (!ev.sentiment_flag || ev.sentiment_flag === 'null') return;
                 
                 const mappedRole = findMappedRole(ev.actor);
                 
                 if (mappedRole) {
                     // Actor has a mapped role: check if that role allows sentiments
                     if (cfg[mappedRole] === false) {
                         ev.sentiment_flag = null;
                     }
                 } else {
                     // No mapped role: use heuristic pattern matching
                     // If activity description mentions support team work, strip sentiment
                     if (isSupportTeamActivity(ev.actor, ev.detailed_activity_summary)) {
                         ev.sentiment_flag = null;
                     }
                     // If actor name itself looks like support team, strip sentiment
                     else if (isSupportTeamActivity(ev.actor, '')) {
                         ev.sentiment_flag = null;
                     }
                 }
             });
          }
        } catch (e) {
          reviewTranslations = null; 
        }
        renderReviewTab(pdfText, pdfPages, reviewTranslations);
        setStep('review', 'done');

        setStep('sm', 'active');
        const smRaw = await callLLM(endpointConf, apiKey, pdfText, modSmPrompt);
        smData = safeParseJSON(smRaw);
        
        // --- FRONT-END ENFORCEMENT FILTER FOR SM TAB --- 
        // Forcefully wipe service team sentiments that the LLM hallucinates
        if (smData && smData.sentiment_summary && window.CONFIG && window.CONFIG.role_sentiment_config) {
             const cfg = window.CONFIG.role_sentiment_config;
             const normalizeKey = txt => String(txt || '').trim().toLowerCase();
             const actorMapSM = {};
             activeMappingString.split('\n').filter(Boolean).forEach(line => {
                const match = line.match(/^- (.*?): (.*)$/);
                if (match) actorMapSM[match[1].trim()] = match[2].trim();
             });
             
             const findMappedRoleSM = (actorText) => {
                if (!actorText) return null;
                const text = normalizeKey(actorText);
                const exact = Object.keys(actorMapSM).find(name => normalizeKey(name) === text);
                if (exact) return actorMapSM[exact];
                const partial = Object.keys(actorMapSM).find(name => text.includes(normalizeKey(name)) || normalizeKey(name).includes(text));
                return partial ? actorMapSM[partial] : null;
             };
             
             const isSupportTeamRole = (roleText, actorText, impactText) => {
                const combined = `${roleText || ''} ${actorText || ''} ${impactText || ''}`.toLowerCase();
                return /\b(support\s+team|service\s+desk|resolver|agent|internal|ops\s+team|status\s+update|requested|acknowledged|confirmed|asked|continued|closed|reassigned|transferred)\b/.test(combined);
             };
             
             smData.sentiment_summary = smData.sentiment_summary.filter(s => {
                 const raisedByRole = findMappedRoleSM(s.raised_by);
                 const roleFieldRole = findMappedRoleSM(s.role);
                 const effectiveRole = raisedByRole || roleFieldRole || s.role;
                 
                 // Check config: if role is explicitly enabled (true), keep it
                 let exactMatch = Object.keys(cfg).find(r => 
                     normalizeKey(r).includes(normalizeKey(effectiveRole || '')) || normalizeKey(effectiveRole || '').includes(normalizeKey(r))
                 );
                 
                 if (exactMatch && cfg[exactMatch] === true) {
                     return true;
                 }
                 
                 // Check if this looks like support team activity (which should be ignored)
                 if (isSupportTeamRole(s.role, s.raised_by, s.business_impact)) {
                     return false;
                 }
                 
                 // If no explicit allow and not caught as support team, reject
                 return false; 
             });
        }
        setStep('sm', 'done');

        setStep('arch', 'active');
        const archRaw = await callLLM(endpointConf, apiKey, pdfText, ARCH_SYSTEM_PROMPT); // Architecture doesn't need mapping strictly, but could.
        archData = safeParseJSON(archRaw);
        setStep('arch', 'done');

        renderSMTab(smData);
        setTimeout(async () => {
           if (typeof mermaid !== 'undefined') {
              try { await mermaid.run({ querySelector: '.mermaid' }); } catch(err){ console.log("Mermaid parsing err:", err); }
           }
        }, 300);
        renderReviewTab(pdfText, pdfPages, reviewTranslations);
        renderArchTab(archData);
        elProgress.style.display = 'none';

        // Mark analysis complete & update toolbar
        analysisComplete = true;
        updateReanalyzeToolbar(modelKey);

      } catch (err) {
        elProgress.style.display = 'none';
        showError(err.message);
      }
    }

    // ─── Step Indicator ───
    function setStep(id, state) {
      const el = $('step-' + id);
      if (!el) return;
      el.className = 'step-item' + (state ? ' ' + state : '');
      const spinnerStyle = state === 'active' ? 'inline-block' : 'none';
      const checkMark = state === 'done' ? '✅ ' : '';
      const text = el.textContent.replace('✅ ', '').trim();
      el.innerHTML = `<span class="step-spinner" style="display:${spinnerStyle};"></span>${checkMark}${text}`;
    }

    // ─── System Prompts ───
    function extractPageText(items) {
      const rows = [];
      items
        .filter(item => item.str && item.str.trim())
        .map(item => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
        .sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x)
        .forEach(item => {
          let row = rows.find(r => Math.abs(r.y - item.y) <= 3);
          if (!row) {
            row = { y: item.y, items: [] };
            rows.push(row);
          }
          row.items.push(item);
        });

      return rows
        .sort((a, b) => b.y - a.y)
        .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
    }

    const getUserExtractionPrompt = () => `You are an ITSM extraction tool.
TASK: Identify ONLY the unique individual humans who are ACTIVELY involved in the ticket (people who have added comments, changed the ticket state, taken ownership, or explicitly communicated).
- EXCLUDE passive individuals (e.g. people who are merely CC'd on emails, mentioned in passing, or not taking direct actions).
- Determine what role they are likely playing based on the text.
- Suggested Roles: ${getRoleOptions().map(r => `"${r}"`).join(", ")}.
- Do not include system accounts if clearly marked, unless they need to be flagged as Ignored.

OUTPUT STRICT JSON ONLY:
{
  "users": [
    {
      "name": "string (full name if available)",
      "suggested_role": "string (one of the role definitions above)"
    }
  ]
}
`;

    const REVIEW_TRANSLATE_PROMPT = `You are an OmniTracker ITSM expert with deep ITIL and incident management knowledge.

TASK: Convert raw OmniTracker PDF text into a precise, structured JSON following the data contract below.
Translate non-English content (primarily German) but always preserve the originals.

PARSING RULES:
- Extract master data from the first summary pages.
- Use the History / Audit section as the primary chronological source.
- If multiple changes happen at the SAME timestamp, create SEPARATE timeline rows.
- Preserve each comment or email as its own timeline row; do not merge follow-ups into a single row.
- Preserve timestamps in dd.MM.yyyy HH:mm format where possible. Also extract AM/PM time format.
- Derive day_name from the date (Monday, Tuesday, Wednesday, ...).
- Track ticket_priority per event row - carry the most recent known priority forward to every subsequent row.
- Insert no_action rows for ALL date gaps (including weekends) between the first and last ticket activity.
- TIMELINE DETAIL: For each event, extract:
  * Exact time (convert to HH:MM AM/PM format if 24-hour clock is used)
  * Actor name and role
  * Detailed activity summary as a narrative sentence or short paragraph describing who acted, what was done, and what was requested or confirmed
  * Intent/reasoning (why this action was taken; what the actor was trying to determine, validate, escalate, or close)
  * Message summary (if communication, what was the key message; preserve the most important sentences verbatim when possible)
  * Key questions or requests made in the communication
  * If this is a support follow-up, identify whether it is the first follow-up, a repeat request, or a closure-warning escalation
- Set sentiment_flag ONLY for User-side/Business-side comments.
  Business/Leadership escalations and concerns ALWAYS trigger sentiment: 
    * If an allowed business role (like Leadership / Tower Lead, Affected User, Business Team) raises priority, expresses severe business impact, or mentions downtime/disruptions → set sentiment_flag = "escalation"
    * If an allowed business role reports that the issue STILL PERSISTS or has NOT been resolved despite previous support attempts → set sentiment_flag = "concern"
    * If an allowed business role expresses frustration, dissatisfaction, or urgency → set sentiment_flag = "frustration"
  DO NOT tag sentiment from: Resolver comments, Internal technical notes, Support team reassignment comments, System-generated notifications.
  Values: "escalation" | "frustration" | "concern" | null
- Root cause and resolution: derive ONLY from explicit comments, solution text, or notes.
- Do NOT infer missing facts.

EVENT TYPES - use EXACTLY these strings (no others):
ticket_created | state_changed | responsible_group_changed | responsible_person_changed |
priority_changed | comment_added | email_logged | attachment_added | provider_changed |
sla_updated | no_action | resolution_recorded | root_cause_recorded

OUTPUT: STRICT JSON ONLY. No markdown fences.
{
  "incident": {
    "ticket_number": "string",
    "parent_ticket": "string|null",
    "title": "string",
    "title_english": "string",
    "service": "string",
    "category": "string",
    "state": "string",
    "created_at": "string (dd.MM.yyyy HH:mm)",
    "priority_initial": "string",
    "priority_current": "string",
    "reporting_person": "string|null",
    "affected_person": "string|null",
    "responsible_group_current": "string|null",
    "responsible_person_current": "string|null",
    "impact": "string|null",
    "urgency": "string|null",
    "customer_priority": "string|null",
    "source": "string|null",
    "location": "string|null",
    "org_unit": "string|null",
    "description": "string|null",
    "root_cause": "string|null",
    "resolution": "string|null"
  },
  "timeline": [
    {
      "date": "dd.MM.yyyy",
      "day_name": "Monday",
      "time": "HH:mm",
      "time_ampm": "HH:MM AM/PM",
      "ticket_priority": "string (carry forward)",
      "event_type": "one of the taxonomy strings above",
      "status": "string",
      "actor": "string|null",
      "actor_role": "string|null",
      "from_value": "string|null",
      "to_value": "string|null",
      "action_description": "string — what specific action occurred",
      "intent_reasoning": "string — why was this action taken, what is being attempted or determined",
      "message_summary": "string — if this was a communication, what was the key message conveyed",
      "key_questions_or_requests": ["string"] — array of specific questions asked or requests made, if any",
      "detailed_activity_summary": "string — comprehensive description. If sentiment_flag is set, QUOTE the user's explicit comment/escalation directly here!",
      "sentiment_flag": "escalation|frustration|concern|null"
    }
  ],
  "priority_changes": [
    {
      "date": "string",
      "day_name": "string",
      "time": "string",
      "time_ampm": "string",
      "changed_by": "string",
      "previous_priority": "string",
      "new_priority": "string",
      "reason": "string"
    }
  ],
  "quality": {
    "quality_score": "string",
    "evaluation_criteria": "string",
    "customer_feedback_original": "string",
    "customer_feedback_english": "string",
    "csat_score": "string",
    "resubmission": "string"
  },
  "communications": [
    {
      "id": "string",
      "date": "string",
      "author": "string|null",
      "type": "string",
      "from": "string",
      "to": "string",
      "cc": "string",
      "subject": "string",
      "body_original": "string",
      "body_english": "string"
    }
  ],
  "work_notes": [
    {
      "date": "string",
      "author": "string",
      "content_original": "string",
      "content_english": "string",
      "type": "string"
    }
  ],
  "document_languages": ["string"],
  "primary_language": "string",
  "extraction_notes": "string"
}`;

    const SM_SYSTEM_PROMPT = `You are an ITSM Service Manager Intelligence Agent analyzing OmniTracker ticket PDF exports. Draw upon your extensive skills and experience in IT Service Management ticket handling, customer support, and ITIL best practices.

YOUR ROLE: You serve an IT Service Manager who reviews tickets for customer experience assessment and service quality evaluation based on ALREADY-EXTRACTED incident data. This review happens AFTER incident extraction is complete to avoid hallucinations. Translate any German or non-English content to English inline.

CRITICAL SCOPE RULES:
- STRICTLY USE ONLY THE PROVIDED HUMAN-VERIFIED ROLE MAPPING BELOW. DO NOT INVENT OR ASSUME ROLES. If an actor is not in the mapping, treat them as internal support and IGNORE their sentiments.
- Focus ONLY on comments and actions from BUSINESS-SIDE roles: Affected Business User, Reporting Person, Business Team, Process Owner, Service Delivery Manager, Escalation Owner, Leadership/Tower Lead.
- EXCLUDE sentiment from: Service Desk Agent, Support Team, Problem Manager, Major Incident Manager (internal resolver-side roles).
- Distinguish between: ticket_caller (requestor), business_team (stakeholders), and service_team (support/resolvers).
- Service team follow-ups and internal notes are NOT crucial for SM review—focus only on what the TICKET REQUESTOR and BUSINESS stakeholders communicated.
- Do NOT analyze SLA compliance; SLA breach tracking is not currently marked in the document. Focus only on observable timeline gaps and response timeliness.
- SENTIMENT ANALYSIS: Pay attention to sentiment_flag values in the extracted timeline:
  * "escalation" = business-side raised priority or expressed severe business impact
  * "concern" = business-side reported issue still persists or remains unresolved (TREAT AS RED FLAG)
  * "frustration" = business-side expressed dissatisfaction or urgency (TREAT AS RED FLAG)
- ANY concern or frustration from business users MUST BE FLAGGED AS A RED FLAG in your analysis.

ANALYSIS FOCUS (Strict rules based on Service Manager requirements):
1. CUSTOMER EXPERIENCE ASSESSMENT: Do not conclude anything as strictly good or bad. Analyze what could have went wrong in the ticket based on TICKET REQUESTOR perspective, possible causes, and indicators like timing or communication gaps that could indicate dissatisfaction. Frame as possibilities, not definitive conclusions.
2. SERVICE MANAGEMENT EXPERIENCE REVIEW: Review this ticket through the lens of a seasoned service management practitioner. Assess: the end-to-end business user experience, whether application/technical nuances influenced the resolution path, patterns in user engagement that reveal friction or unmet expectations, communication quality and timeliness from resolver to requestor, and whether resolution demonstrates domain knowledge. Frame findings as experiential observations from the BUSINESS USER perspective, not process checklist items.
3. TICKET REQUESTOR SENTIMENT ANALYSIS: Identify evidence of ticket requestor sentiment, satisfaction or frustration. Highlight concrete signals such as escalation phrases, repeated follow-ups, tone changes, timing gaps, and communication quality from support. IGNORE internal service team chatter or resolver-side activities. TREAT ANY BUSINESS USER CONCERNS AS RED FLAGS.
4. RESPONSE TIMELINESS ASSESSMENT: Evaluate whether the ticket workflow appears aligned with reasonable response and resolution timelines. Note delays, handoff gaps, or missed follow-up opportunities that would affect requestor satisfaction.
5. SERVICE MANAGER VALUE ASSESSMENT: Provide a concise service manager summary that explains why this ticket matters from a business user perspective, what core service quality issues are visible, and what improvements would best reduce repeat friction or improve requestor satisfaction. BASE THIS ONLY ON THE ROLES AND SENTIMENTS FROM THE PROVIDED MAPPING.
- Include a separate reasoning output that explains the underlying evidence and rationale for each service manager insight.
6. IMPROVEMENTS: Highlight what can be improved, providing a clear rationale why it is recommended for this specific ticket from the requestor's experience.
7. TIMELINE SUMMARY: Summarize the sequence of events focusing on: Issue reported by requestor, Escalations or concerns from BUSINESS-SIDE only, Response timing from support, Resolution clarity, and Closure communication. Ensure EVERY event showing business-side frustration, urgency, or concern is specifically highlighted as a RED FLAG.
- For each timeline item include reasoning that explains why the event is significant for escalation, concern, or service quality risk.
- Also add a key comment reference pointing to the specific business-side phrase or message that supports the escalation/concern assessment.

OUTPUT: STRICT JSON ONLY. No markdown fences. No prose.
{
  "sentiment_summary": [
    {
      "raised_by": "string (ticket requestor or business stakeholder name)",
      "role": "string (business-side role only)",
      "sentiment_type": "string (escalation|frustration|concern)",
      "severity": "string",
      "business_impact": "string",
      "escalation_risk": "string",
      "leadership_attention_required": boolean
    }
  ],
  "service_manager_insights": "string",
  "service_manager_reasoning": "string (detailed reasoning and evidence supporting the service manager insight)",
  "issue_root_driver": "string",
  "requestor_satisfaction_indicators": "string (renamed from customer_satisfaction_indicators)",
  "response_timeliness_summary": "string (renamed from sla_compliance_summary; does NOT require SLA tracking)",
  "service_health_summary": "string",
  "requestor_experience_assessment": {
    "analysis": "string (from ticket requestor's perspective: what could have been frustrating, possible causes, timing gaps, communication quality)"
  },
  "itsm_service_quality_gaps": {
    "resolution_clarity": "string",
    "response_timeliness": "string",
    "requestor_follow_up_burden": "string",
    "communication_effectiveness": "string",
    "knowledge_demonstration": "string"
  },
  "improvement_recommendations": [
    {
      "improvement": "string",
      "rationale": "string (why this improves ticket requestor satisfaction)"
    }
  ],
  "timeline_summary": [
    {
      "time_sequence": "string (e.g. Day 1 - Morning / Date)",
      "issue_reported": "string (by ticket requestor)",
      "escalations_or_concerns": "string (REQUIRED: only BUSINESS-SIDE comments; explicitly detail any frustration or urgency as RED FLAGS)",
      "resolution_team_response": "string (support's action)",
      "resolution_notes": "string",
      "closure_notes": "string (how was requestor informed of closure?)"
    }
  ],
  "confidence_score": 0
}`;

    const ARCH_SYSTEM_PROMPT = `You are a Technical Analysis Agent for Enterprise Architects and Application SMEs. Draw upon your extensive ticket resolution experience and ITIL service management skills.

YOUR ROLE: Analyze OmniTracker ITSM ticket PDF exports to extract the technical problem context, affected systems, root cause patterns, architectural implications, and the full technology stack involved. Translate any German or non-English content to English inline.

CONTEXT RULES:
- Treat each input as a completely separate, isolated analysis
- Read the FULL document including raw logs, work notes, and technical references in any language
- OmniTracker exports contain: ticket metadata, email threads with technical discussion, work/activity notes, diagnostic logs

ANALYSIS FOCUS:
1. PROBLEM IDENTIFICATION: What is the actual technical problem? What system/component is affected?
2. AFFECTED SYSTEMS: Identify all referenced systems, applications, platforms, services, APIs, databases, infrastructure components
3. TECHNICAL CONTEXT: Extract error messages, log entries, configuration references, version info, environment details
4. ROOT CAUSE ANALYSIS: Based on the ticket data, what appears to be the root cause? Is it infra, app, config, data, or process?
5. IMPACT ASSESSMENT: What is the business/technical impact? How many users/systems affected? Is it a recurring issue?
6. RESOLUTION PATH: What was the technical resolution? Was it a workaround or permanent fix?
7. ARCHITECTURAL IMPLICATIONS: Does this incident expose design weaknesses, single points of failure, missing monitoring, integration gaps?
8. PATTERN DETECTION: Does this look like a known issue pattern (performance degradation, connectivity, authentication, data corruption, etc.)?
9. TECHNOLOGY STACK: Map ALL technologies, platforms, protocols, frameworks, tools, and services referenced or implied in the ticket into a layered technology stack.

OUTPUT: STRICT JSON ONLY. No markdown fences. No prose.
{
  "ticket_id": "string",
  "problem_statement": "string (clear English description of the technical problem)",
  "original_problem_description": "string (original language if non-English)",
  "severity_assessment": "CRITICAL | HIGH | MEDIUM | LOW",
  "affected_systems": [{"name": "string", "type": "string (application/infrastructure/service/integration/database)", "role": "string"}],
  "affected_service_area": "string",
  "technical_category": "string (Performance | Connectivity | Authentication | Data | Configuration | UI/UX | Integration | Infrastructure | Security | Other)",
  "error_references": ["string array - exact error messages, codes, log entries found"],
  "environment_details": {"platform": "string", "component": "string", "version": "string", "environment": "string"},
  "root_cause_analysis": "string (detailed technical root cause assessment)",
  "root_cause_category": "string (Application Bug | Configuration Error | Infrastructure Issue | Data Issue | Integration Failure | User Error | Capacity/Performance | Unknown)",
  "resolution_description": "string (what was technically done to resolve)",
  "resolution_type": "PERMANENT_FIX | WORKAROUND | ESCALATED | UNRESOLVED",
  "diagnostic_steps_taken": ["string array"],
  "technology_stack": [
    {
      "name": "string (technology/platform/tool name)",
      "layer": "string (Application | Middleware | Database | Infrastructure | Network | Security | Integration | Monitoring | ITSM | Frontend | Other)",
      "role_in_incident": "string (brief description of how this tech relates to the incident)",
      "is_affected": true
    }
  ],
  "architectural_observations": ["string array - design concerns, single points of failure, missing resilience patterns"],
  "recommendations_for_engineering": ["string array - specific technical recommendations"],
  "monitoring_gaps": ["string array - what should have been monitored/alerted"],
  "pattern_indicators": ["string array - signs this is a recurring or systemic issue"],
  "related_technologies": ["string array - all technologies/tools/platforms mentioned"],
  "risk_assessment": "string (ongoing risk if not addressed)",
  "confidence_score": 0,
  "missing_technical_data": ["string array"],
  "translated_technical_notes": ["string array - key non-English technical content translated"]
}`;

    // ─── LLM Call ───
    async function callLLM(endpointConf, apiKey, text, systemPrompt) {
      const response = await fetch(endpointConf.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: endpointConf.model,
          temperature: 0.1,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analyze this OmniTracker ITSM ticket export and return strict JSON:\n\n${text}` }
          ]
        })
      });
      if (!response.ok) {
        // Read raw body — supports both JSON and plain text error responses
        const rawText = await response.text().catch(() => '');
        let errBody = {};
        try { errBody = JSON.parse(rawText); } catch (_) { /* non-JSON response */ }
        // Log full detail for developer inspection
        console.error('[callLLM] API error details:', {
          status: response.status,
          model: endpointConf.model,
          url: endpointConf.url,
          response: errBody,
          raw: rawText
        });
        // Surface the most useful message
        const apiMsg =
          errBody?.error?.message ||
          errBody?.message ||
          (typeof errBody?.error === 'string' ? errBody.error : null) ||
          rawText.slice(0, 300) ||
          `HTTP ${response.status}`;
        throw new Error(
          `[HTTP ${response.status}] ${apiMsg}\n` +
          `→ Model attempted: "${endpointConf.model}" (update ENDPOINTS.glm5.model in config.js)\n` +
          `→ Check browser Console (F12) for the full server response.`
        );
      }
      const data = await response.json();
      return data.choices[0].message.content;
    }

    function safeParseJSON(str) {
      let c = str.trim();
      if (c.startsWith('```json')) c = c.replace(/^```json/, '');
      else if (c.startsWith('```')) c = c.replace(/^```/, '');
      if (c.endsWith('```')) c = c.replace(/```$/, '');
      c = c.trim();
      try { return JSON.parse(c); }
      catch (e) { throw new Error("AI returned invalid JSON. Please try again."); }
    }

    function generateDaySummary(events) {
      if (events.length === 0) return 'No events recorded for this day.';
      
      const activeEvents = events.filter(e => e.event_type !== 'no_action');
      if (activeEvents.length === 0) return 'No ticket activity recorded for this day.';
      
      let summary = `This day had ${activeEvents.length} active event(s). `;
      
      const sentiments = activeEvents.filter(e => e.sentiment_flag && e.sentiment_flag !== 'null');
      if (sentiments.length > 0) {
        summary += `${sentiments.length} event(s) flagged for sentiment (${sentiments.map(s => s.sentiment_flag).join(', ')}). `;
      }
      
      const communications = activeEvents.filter(e => e.event_type === 'comment_added' || e.event_type === 'email_logged');
      if (communications.length > 0) {
        summary += `${communications.length} communication(s) sent. `;
      }
      
      const changes = activeEvents.filter(e => e.event_type.includes('changed') || e.event_type === 'priority_changed');
      if (changes.length > 0) {
        summary += `${changes.length} ticket update(s) made. `;
      }
      
      const resolutions = activeEvents.filter(e => e.event_type === 'resolution_recorded' || e.event_type === 'root_cause_recorded');
      if (resolutions.length > 0) {
        summary += 'Resolution documented. ';
      }
      
      return summary.trim();
    }

    // ─── Render: Extracted Content Review Tab ───
    function renderReviewTab(text, pages, rd) {
      const tab = $('tab-review');
      const hasData = rd && rd.incident;

      if (!hasData) {
        tab.innerHTML = `
          <div class="review-note"><strong>⏳ Structuring content...</strong> — Raw extracted text shown below while AI organizes it into structured sections.</div>
          ${pages.map((p, i) => makeCard('Page ' + (i + 1), '<div class="review-raw">' + esc(p) + '</div>')).join('')}
        `;
        return;
      }

      const inc  = rd.incident || {};
      const tl   = rd.timeline || [];
      const comms = rd.communications || [];
      const notes = rd.work_notes || [];
      const qual  = rd.quality || {};
      const prioChanges = rd.priority_changes || [];
      const langBadges  = (rd.document_languages || []).map(l => `<span class="badge badge-info">${esc(l)}</span>`).join(' ');
      const sentimentCount = tl.filter(e => e.sentiment_flag && e.sentiment_flag !== 'null').length;

      let html = '';

      // ── 1. Incident Summary ──────────────────────────────────────────────
      const incFields = [
        ['🎫 Ticket Number', inc.ticket_number],
        ['🔗 Parent Ticket', inc.parent_ticket],
        ['📝 Title', inc.title_english || inc.title],
        ['🛠️ Service', inc.service],
        ['📂 Category', inc.category],
        ['🔄 State', inc.state],
        ['📅 Created', inc.created_at],
        ['📥 Source', inc.source],
        ['⚡ Priority', (inc.priority_initial || '—') + ' → ' + (inc.priority_current || '—') + ' (Initial → Current)'],
        ['👤 Reporting Person', inc.reporting_person],
        ['🤕 Affected Person', inc.affected_person],
        ['👥 Responsible Group', inc.responsible_group_current],
        ['🧑‍💻 Responsible Person', inc.responsible_person_current],
        ['💥 Impact', inc.impact],
        ['🚨 Urgency', inc.urgency],
        ['🏢 Customer Priority', inc.customer_priority],
        ['📍 Location', inc.location],
        ['🏢 Org Unit', inc.org_unit],
      ].filter(([, v]) => v && v !== 'null' && String(v).trim() !== '');

      html += makeCard('📋 Incident Summary', `
        <div class="inc-grid">
          ${incFields.map(([label, val]) => `
            <div class="inc-cell">
              <div class="meta-label">${esc(label)}</div>
              <div class="meta-value" style="margin-top:2px;">${esc(String(val))}</div>
            </div>`).join('')}
        </div>
        ${inc.description ? `<div class="highlight-box highlight-teal" style="margin-top:12px;">
          <div class="meta-label" style="margin-bottom:4px;">Description</div>${esc(inc.description)}</div>` : ''}
        ${inc.root_cause ? `<div class="highlight-box highlight-info" style="margin-top:8px;">
          <div class="meta-label" style="margin-bottom:4px;">Root Cause</div>${esc(inc.root_cause)}</div>` : ''}
        ${inc.resolution ? `<div class="highlight-box highlight-teal" style="margin-top:8px;">
          <div class="meta-label" style="margin-bottom:4px;">Resolution</div>${esc(inc.resolution)}</div>` : ''}
      `);

      // ── 2. Stats Bar ─────────────────────────────────────────────────────
      html += `<div class="review-section-grid" style="margin-bottom:16px;">
        <div class="review-stat"><strong>${pages.length}</strong><span>PDF Pages</span></div>
        <div class="review-stat"><strong>${tl.length}</strong><span>Timeline Events</span></div>
        <div class="review-stat"><strong style="color:${sentimentCount > 0 ? 'var(--danger)' : 'var(--success)'};">${sentimentCount}</strong><span>Flagged Events</span></div>
        <div class="review-stat"><strong>${prioChanges.length}</strong><span>Priority Changes</span></div>
        <div class="review-stat"><strong>${comms.length}</strong><span>Communications</span></div>
        <div class="review-stat"><strong>${notes.length}</strong><span>Work Notes</span></div>
      </div>`;

      if (rd.extraction_notes) html += `<div class="review-note">📝 ${esc(rd.extraction_notes)}</div>`;

      // ── 3. Quality Score ─────────────────────────────────────────────────
      if (qual.quality_score || qual.csat_score || qual.customer_feedback_original) {
        const qScore = qual.quality_score;
        const qColor = !qScore ? '#94a3b8' : (parseInt(qScore) >= 80 ? '#10b981' : parseInt(qScore) >= 50 ? '#f59e0b' : '#ef4444');
        html += makeCard('⭐ Quality Score & Customer Feedback', `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:${qual.customer_feedback_original ? '14px' : '0'};">
            <div class="quality-gauge">
              <div class="quality-ring" style="background:${qColor};">${qScore || '—'}</div>
              <div class="quality-detail"><div class="label">Quality Score</div><div class="value">${gv(qual.evaluation_criteria)}</div></div>
            </div>
            <div class="quality-gauge">
              <div class="quality-ring" style="background:${qual.csat_score ? '#6366f1' : '#94a3b8'};font-size:0.9rem;">${qual.csat_score || '—'}</div>
              <div class="quality-detail"><div class="label">CSAT Score</div><div class="value">${gv(qual.resubmission)}</div></div>
            </div>
          </div>
          ${qual.customer_feedback_original ? `
            <div class="meta-label" style="margin-bottom:4px;">Customer Feedback (Original)</div>
            <div class="review-raw" style="margin-bottom:8px;">${esc(qual.customer_feedback_original)}</div>
            ${qual.customer_feedback_english && qual.customer_feedback_english !== qual.customer_feedback_original
              ? `<div class="review-translation"><div class="tl-label">🌐 English</div>${esc(qual.customer_feedback_english)}</div>` : ''}
          ` : ''}
        `);
      }

      // ── 4. Priority Changes ──────────────────────────────────────────────
      if (prioChanges.length > 0) {
        let pcHtml = '<div style="display:flex;flex-direction:column;gap:8px;">';
        prioChanges.forEach(pc => {
          pcHtml += `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:10px 14px;
            background:var(--warning-bg);border-left:4px solid var(--warning);border-radius:4px;">
            <span style="font-size:0.78rem;font-weight:700;color:var(--warning);">⚡ ${esc(pc.date || '')} ${esc(pc.time_ampm || pc.time || '')}</span>
            <span style="font-size:0.74rem;color:var(--text-muted);">${esc(pc.day_name || '')}</span>
            <span class="prio-track-pill">${esc(pc.previous_priority || '?')} → ${esc(pc.new_priority || '?')}</span>
            <span style="font-size:0.82rem;color:var(--text-secondary);flex:1;">${esc(pc.reason || '')}${pc.changed_by ? ' · by <strong>' + esc(pc.changed_by) + '</strong>' : ''}</span>
          </div>`;
        });
        pcHtml += '</div>';
        html += makeCard('⚡ Priority Change History', pcHtml, prioChanges.length);
      }

      // ── 5. Timeline Card View ────────────────────────────────────────────
      if (tl.length > 0) {
        let tlHtml = '';
        if (sentimentCount > 0) {
          tlHtml += `<div class="sentinel-banner">🚨
            <span>This ticket has <strong>${sentimentCount} flagged event(s)</strong> — escalation, frustration, or concern — highlighted below.</span>
          </div>`;
        }



        // Fill in missing gap days automatically from min to max date
        let minTime = Infinity;
        let maxTime = -Infinity;
        const knownDates = new Set();
        
        tl.forEach(ev => {
          if (ev.date) {
            const parts = ev.date.split('.');
            if (parts.length === 3) {
              const nd = new Date(parts[2], parts[1] - 1, parts[0]);
              if (!isNaN(nd)) {
                ev._ts = nd.getTime();
                knownDates.add(ev.date);
                if (ev._ts < minTime) minTime = ev._ts;
                if (ev._ts > maxTime) maxTime = ev._ts;
              }
            }
          }
        });

        if (minTime !== Infinity && maxTime !== -Infinity) {
          let curr = new Date(minTime);
          const max = new Date(maxTime);
          let lastSeenPrio = null;
          
          tl.sort((a, b) => (a._ts || 0) - (b._ts || 0));
          
          while (curr <= max) {
            const d = String(curr.getDate()).padStart(2, '0');
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const y = curr.getFullYear();
            const dateStr = `${d}.${m}.${y}`;
            
            const evsOnDay = tl.filter(e => e.date === dateStr);
            if (evsOnDay.length > 0) {
              const p = evsOnDay[evsOnDay.length - 1].ticket_priority;
              if (p && p !== 'null') lastSeenPrio = p;
            } else if (!knownDates.has(dateStr)) {
              tl.push({
                date: dateStr,
                time: "00:00",
                event_type: "no_action",
                detailed_activity_summary: "No ticket activity recorded",
                ticket_priority: lastSeenPrio || "—",
                _ts: curr.getTime()
              });
              knownDates.add(dateStr);
            }
            curr.setDate(curr.getDate() + 1);
          }
        }
        
        // Re-sort strictly by timestamp so padding events are in order
        tl.sort((a, b) => (a._ts || 0) - (b._ts || 0));

        // Recalculate Day Name accurately from dd.MM.yyyy
        tl.forEach(ev => {
          if (ev.date) {
            const parts = ev.date.split('.');
            if (parts.length === 3) {
              const nd = new Date(parts[2], parts[1] - 1, parts[0]);
              if (!isNaN(nd)) {
                ev.day_name = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(nd);
              }
            }
          }
        });

        // Group events by date
        const dayMap = {};
        const dayOrder = [];
        tl.forEach(ev => {
          const key = ev.date || 'Unknown';
          if (!dayMap[key]) { dayMap[key] = []; dayOrder.push(key); }
          dayMap[key].push(ev);
        });

        dayOrder.forEach(dateKey => {
          const evts   = dayMap[dateKey];
          const first  = evts[0];
          const dayName = first.day_name || '';
          const isWeekend = /saturday|sunday|samstag|sonntag/i.test(dayName);
          const allNoAction = evts.every(e => e.event_type === 'no_action');

          tlHtml += `<div class="evt-day-block ${allNoAction ? 'evt-collapsed' : ''}" onclick="this.classList.toggle('evt-collapsed')">
              <div class="evt-day-header clickable" title="Click to expand/collapse">
                <div>
                  <div class="evt-day-date-big"><span class="evt-toggle-icon">▼</span>📅 ${esc(dateKey)}</div>
                  <div class="evt-day-name-text">${esc(dayName)}</div>
                </div>
                <span class="evt-day-badge ${isWeekend ? 'evt-weekend' : 'evt-workday'}">${isWeekend ? '🌙 Weekend' : '🏢 Working Day'}</span>
              </div>
              <div class="evt-items-container">`;

            evts.forEach(ev => {
              const isSentiment = ev.sentiment_flag && ev.sentiment_flag !== 'null' && ev.sentiment_flag !== '';
              const isPrioChg   = ev.event_type === 'priority_changed';
              const isNoAction  = ev.event_type === 'no_action';
              const isCreated   = ev.event_type === 'ticket_created';
              const isResolved  = ev.event_type === 'resolution_recorded' || ev.event_type === 'root_cause_recorded';

              let cardCls = 'evt-card';
              if (isSentiment)    cardCls += ' evt-card-sentiment';
              else if (isPrioChg)  cardCls += ' evt-card-priority';
              else if (isNoAction) cardCls += ' evt-card-noaction';
              else if (isCreated)  cardCls += ' evt-card-created';
              else if (isResolved) cardCls += ' evt-card-resolved';

              const dotClr = isSentiment ? 'var(--danger)'
                : isPrioChg  ? 'var(--warning)'
                : isCreated  ? 'var(--teal)'
                : isResolved ? 'var(--success)'
                : isNoAction ? 'var(--text-light)'
                : 'var(--info)';

              const sentimentTag = isSentiment
                ? `<span class="evt-sentiment-tag">${esc(ev.sentiment_flag)}</span>` : '';

              const changeRow = (ev.from_value && ev.to_value)
                ? `<div class="evt-change-row">📌 ${esc(ev.from_value)} <span style="color:var(--text-light);">→</span> ${esc(ev.to_value)}</div>`
                : (ev.from_value || ev.to_value)
                  ? `<div class="evt-change-row">📌 ${esc(ev.from_value || ev.to_value)}</div>`
                  : '';

              const actorRow = ev.actor
                ? `<div class="evt-actor-row">👤 ${esc(ev.actor)}${ev.actor_role ? ` <span style="color:var(--text-muted);">(${esc(ev.actor_role)})</span>` : ''}</div>` : '';

              const narrativeText = formatTimelineNarrative(ev);
              const narrativeRow = narrativeText
                ? `<div class="evt-narrative-row">${esc(narrativeText)}</div>`
                : '';

              const actionDescRow = ev.action_description
                ? `<div style="margin-top:6px;padding:8px;background:var(--bg);border-radius:4px;font-size:0.85rem;color:var(--text-secondary);"><strong>Action:</strong> ${esc(ev.action_description)}</div>`
                : '';

              const intentRow = ev.intent_reasoning
                ? `<div style="margin-top:6px;padding:8px;background:var(--bg);border-radius:4px;font-size:0.85rem;color:var(--text-secondary);"><strong>Intent/Reasoning:</strong> ${esc(ev.intent_reasoning)}</div>`
                : '';

              const messageRow = ev.message_summary
                ? `<div style="margin-top:6px;padding:8px;background:var(--info-bg);border-left:3px solid var(--info);border-radius:4px;font-size:0.85rem;color:var(--text);"><strong>Message:</strong> ${esc(ev.message_summary)}</div>`
                : '';

              const questionsRow = ev.key_questions_or_requests && Array.isArray(ev.key_questions_or_requests) && ev.key_questions_or_requests.length > 0
                ? `<div style="margin-top:6px;padding:8px;background:var(--surface);border-left:3px solid var(--primary);border-radius:4px;font-size:0.85rem;"><strong>Key Questions/Requests:</strong><ul style="margin:4px 0 0 16px;padding:0;">${ev.key_questions_or_requests.map(q => `<li style="margin:3px 0;color:var(--text-secondary);">${esc(q)}</li>`).join('')}</ul></div>`
                : '';

              tlHtml += `<div class="${cardCls}" style="--dot-clr:${dotClr};">
                <div class="evt-header-row">
                  <span class="evt-time-tag">${esc(ev.time_ampm || ev.time || '??:??')}</span>
                  ${renderEvtBadge(ev.event_type)}
                  ${renderPriorityBadge(ev.ticket_priority)}
                  ${sentimentTag}
                </div>
                <div class="evt-body-text">${getEvtIcon(ev.event_type, isSentiment)} ${esc(ev.detailed_activity_summary || '')}</div>
                ${changeRow}
                ${actorRow}
                ${narrativeRow}
                ${actionDescRow}
                ${intentRow}
                ${messageRow}
                ${questionsRow}
              </div>`;
            });

            const daySummary = generateDaySummary(evts);
            tlHtml += `<div class="evt-day-summary" style="margin-top:12px;padding:10px;background:var(--bg);border-radius:6px;font-size:0.85rem;color:var(--text-secondary);border:1px solid var(--border-light);">
    <strong>Day Summary:</strong> ${esc(daySummary)}
</div>`;

            tlHtml += `</div></div>`;
        });

        html += makeCard('📅 Detailed Event Timeline', tlHtml, tl.length);
      }

      // ── 6. Communications ────────────────────────────────────────────────
      if (comms.length > 0) {
        let commHtml = '';
        comms.forEach(em => {
          commHtml += `<div class="review-email">
            <div class="review-email-header">
              <div class="review-email-label">From</div><div>${gv(em.from)}</div>
              <div class="review-email-label">To</div><div>${gv(em.to)}</div>
              ${em.cc ? `<div class="review-email-label">CC</div><div>${esc(em.cc)}</div>` : ''}
              <div class="review-email-label">Date</div><div>${gv(em.date)}</div>
              <div class="review-email-label">Subject</div><div style="font-weight:600;">${gv(em.subject)}</div>
            </div>
            <div class="review-raw">${esc(em.body_original || '')}</div>
            ${em.body_english && em.body_original && em.body_english !== em.body_original
              ? `<div class="review-translation"><div class="tl-label">🌐 English Translation</div>${esc(em.body_english)}</div>` : ''}
          </div>`;
        });
        html += makeCard('✉️ Communications (Email Threads)', commHtml, comms.length);
      }

      // ── 7. Work Notes ────────────────────────────────────────────────────
      if (notes.length > 0) {
        let notesHtml = '';
        notes.forEach(n => {
          notesHtml += `<div class="review-email">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div><span class="badge badge-purple">${esc(n.type || 'note')}</span>
                ${n.author ? `<span style="font-size:0.82rem;color:var(--text-muted);margin-left:6px;">${esc(n.author)}</span>` : ''}
              </div>
              <div style="font-size:0.82rem;font-weight:600;color:var(--primary-dark);">${gv(n.date)}</div>
            </div>
            <div class="review-raw">${esc(n.content_original || '')}</div>
            ${n.content_english && n.content_original && n.content_english !== n.content_original
              ? `<div class="review-translation"><div class="tl-label">🌐 English</div>${esc(n.content_english)}</div>` : ''}
          </div>`;
        });
        html += makeCard('🔧 Work Notes & Activity', notesHtml, notes.length);
      }

      // ── 8. Raw Extract ───────────────────────────────────────────────────
      html += makeCard('📃 Full Page-by-Page Extract (Raw)', pages.map((page, idx) => `
        <div class="review-email">
          <div class="meta-label">Page ${idx + 1}</div>
          <div class="review-raw">${esc(page)}</div>
        </div>`).join(''), pages.length, true);

      
      

      tab.innerHTML = html;

    }

    function renderEvtBadge(type) {
      const map = {
        ticket_created:             ['evt-created',  'Created'],
        state_changed:              ['evt-state',    'State ⇕'],
        responsible_group_changed:  ['evt-group',    'Group ⇕'],
        responsible_person_changed: ['evt-person',   'Person ⇕'],
        priority_changed:           ['evt-priority', 'Priority ⇕'],
        comment_added:              ['evt-comment',  'Comment'],
        email_logged:               ['evt-email',    'Email'],
        attachment_added:           ['evt-comment',  'Attachment'],
        provider_changed:           ['evt-group',    'Provider ⇕'],
        sla_updated:                ['evt-state',    'SLA ⇕'],
        no_action:                  ['evt-noaction', 'No Action'],
        resolution_recorded:        ['evt-resolved', 'Resolved'],
        root_cause_recorded:        ['evt-resolved', 'Root Cause'],
      };
      const t = type || 'other';
      const [cls, label] = map[t] || ['evt-other', esc(String(t))];
      return `<span class="evt-badge ${cls}">${label}</span>`;
    }

    function renderPriorityBadge(p) {
      if (!p || p === 'null' || p === null || String(p).trim() === '') {
        return '<span class="prio-badge prio-default">—</span>';
      }
      const lower = String(p).toLowerCase();
      const cls = lower.includes('critical')
        ? 'prio-critical'
        : lower.includes('high') || lower.includes('hoch')
          ? 'prio-high'
          : lower.includes('medium') || lower.includes('mittel') || lower.includes('normal')
            ? 'prio-medium'
            : lower.includes('low') || lower.includes('niedrig')
              ? 'prio-low'
              : 'prio-default';
      return `<span class="prio-badge ${cls}">${esc(String(p))}</span>`;
    }

    function formatTimelineNarrative(ev) {
      const actorLabel = ev.actor ? `${ev.actor}${ev.actor_role ? ` (${ev.actor_role})` : ''}` : 'Support';
      const isEmail = ev.event_type === 'email_logged';
      const isComment = ev.event_type === 'comment_added';
      if (!isEmail && !isComment) return '';

      const lines = [];
      const actionText = ev.action_description ? ev.action_description : isEmail ? 'sent an email' : 'sent a follow-up comment';
      lines.push(`${actorLabel} ${actionText}.`);

      if (ev.message_summary) {
        lines.push('', 'Message summary:', ev.message_summary.trim());
      }

      if (ev.key_questions_or_requests && Array.isArray(ev.key_questions_or_requests) && ev.key_questions_or_requests.length > 0) {
        lines.push('', 'They specifically wanted confirmation on:');
        ev.key_questions_or_requests.forEach(q => lines.push(`- ${q.trim()}`));
      }

      if (ev.intent_reasoning) {
        lines.push('', 'This was meant to determine whether:', ev.intent_reasoning.trim());
      }

      const closureMatch = /(closure|close|final escalation|last notice|final notice|ticket will be closed|closure-warning|closing warning)/i;
      if (closureMatch.test(ev.action_description || '') || closureMatch.test(ev.message_summary || '')) {
        lines.push('', 'This was effectively the final notice before closure.');
      }

      return lines.join('\n');
    }

    function getEvtIcon(type, isSentiment) {
      if (isSentiment) return '🚨';
      const m = {
        ticket_created:'🎫', state_changed:'🔄',
        responsible_group_changed:'👥', responsible_person_changed:'👤',
        priority_changed:'⚡', comment_added:'💬',
        email_logged:'📧', attachment_added:'📎',
        sla_updated:'⏱', provider_changed:'🔁',
        no_action:'─', resolution_recorded:'✅', root_cause_recorded:'🔍',
      };
      return m[type] || '📌';
    }



        // ─── Ticket Health Metrics ───
    function parseTimelineDateTime(date, time) {
      if (!date) return null;
      const trimmedDate = String(date).trim();
      const trimmedTime = String(time || '00:00').trim();
      const parts = trimmedDate.split('.');
      if (parts.length !== 3) return null;
      const [day, month, year] = parts.map(p => Number(p));
      const [hour = '00', minute = '00'] = trimmedTime.split(':');
      const dt = new Date(year, month - 1, day, Number(hour), Number(minute));
      return isNaN(dt.getTime()) ? null : dt;
    }

    function computeTicketHealthMetrics(reviewTranslations, incident) {
      if (!reviewTranslations || !Array.isArray(reviewTranslations.timeline) || reviewTranslations.timeline.length === 0) return null;
      const timeline = reviewTranslations.timeline.map(ev => ({
        ...ev,
        dt: parseTimelineDateTime(ev.date, ev.time)
      })).filter(ev => ev.dt);
      if (timeline.length === 0) return null;
      timeline.sort((a, b) => a.dt - b.dt);
      const created = timeline.find(ev => ev.event_type === 'ticket_created') || timeline[0];
      const firstResponse = timeline.find(ev => ev.event_type !== 'ticket_created' && ev.event_type !== 'no_action');
      const resolutionEvent = timeline.find(ev => ev.event_type === 'resolution_recorded' || ev.event_type === 'root_cause_recorded');
      const createdFromIncident = incident && incident.created_at ? parseTimelineDateTime(...incident.created_at.split(' ')) : null;
      const createdDt = createdFromIncident || created.dt;
      const formatDuration = mins => {
        if (mins === null || mins === undefined) return 'N/A';
        if (mins < 60) return `${mins} min`;
        const hours = Math.floor(mins / 60);
        const remainder = mins % 60;
        return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
      };
      const responseDelay = firstResponse && createdDt ? Math.max(0, Math.round((firstResponse.dt - createdDt) / 60000)) : null;
      const resolutionGap = resolutionEvent && createdDt ? Math.max(0, Math.round((resolutionEvent.dt - createdDt) / 60000)) : null;
      const followUpCount = timeline.filter(ev => ev.event_type === 'comment_added' || ev.event_type === 'email_logged').length;
      const escalationCount = timeline.filter(ev => ev.sentiment_flag && ev.sentiment_flag !== 'null').length;
      const totalDuration = createdDt && timeline.length > 0 ? Math.max(0, Math.round((timeline[timeline.length - 1].dt - createdDt) / 60000)) : null;
      return {
        firstResponse: firstResponse ? formatDuration(responseDelay) : 'No response event found',
        resolutionGap: resolutionGap !== null ? formatDuration(resolutionGap) : 'No resolution event found',
        followUpCount,
        escalationCount,
        totalDuration: totalDuration !== null ? formatDuration(totalDuration) : 'N/A',
        responseDelayMinutes: responseDelay,
        resolutionGapMinutes: resolutionGap,
        eventCount: timeline.length,
        lastEvent: timeline[timeline.length - 1] ? `${timeline[timeline.length - 1].date || ''} ${timeline[timeline.length - 1].time || ''}`.trim() : ''
      };
    }

    // ─── Render: Service Manager Tab ───
    function renderSMTab(d) {
      const tab = $('tab-sm');
      let html = '';

      if (d.service_manager_insights || d.service_manager_reasoning || d.issue_root_driver || d.requestor_satisfaction_indicators || d.response_timeliness_summary || d.service_health_summary) {
        html += makeCard('🧠 Service Manager Snapshot', `
          <div class="meta-grid" style="grid-template-columns: 1fr; gap: 12px;">
            ${d.service_manager_insights ? `<div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;"><strong style="color:var(--primary-dark);">Service Manager Insight</strong><div style="margin-top:8px;font-size:0.9rem;">${gv(d.service_manager_insights)}</div></div>` : ''}
            ${d.service_manager_reasoning ? `<div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;"><strong style="color:var(--primary-dark);">Service Manager Reasoning</strong><div style="margin-top:8px;font-size:0.9rem;">${gv(d.service_manager_reasoning)}</div></div>` : ''}
            ${d.service_health_summary ? `<div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;"><strong style="color:var(--primary-dark);">Ticket Health Summary</strong><div style="margin-top:8px;font-size:0.9rem;">${gv(d.service_health_summary)}</div></div>` : ''}
            ${d.issue_root_driver ? `<div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;"><strong style="color:var(--primary-dark);">Likely Issue Driver</strong><div style="margin-top:8px;font-size:0.9rem;">${gv(d.issue_root_driver)}</div></div>` : ''}
            ${d.requestor_satisfaction_indicators ? `<div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;"><strong style="color:var(--primary-dark);">Ticket Requestor Satisfaction Signals</strong><div style="margin-top:8px;font-size:0.9rem;">${gv(d.requestor_satisfaction_indicators)}</div></div>` : ''}
            ${d.response_timeliness_summary ? `<div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;"><strong style="color:var(--primary-dark);">Response Timeliness Assessment</strong><div style="margin-top:8px;font-size:0.9rem;">${gv(d.response_timeliness_summary)}</div></div>` : ''}
          </div>
        `);
      }

      // 1. Requestor Experience Assessment
      html += makeCard('⭐ Ticket Requestor Experience Assessment', `
        <div class="highlight-box highlight-info" style="margin-bottom:12px;">
            <div style="font-size:0.8rem;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:6px;">Analysis from Requestor Perspective</div>
            <div style="font-size:0.95rem;line-height:1.6;color:var(--info-dark);">${gv(d.requestor_experience_assessment?.analysis)}</div>
        </div>
        `);

      const health = computeTicketHealthMetrics(reviewTranslations, reviewTranslations?.incident);
      if (health) {
        html += makeCard('📈 Ticket Health Scorecard', `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:8px;">
              <div style="font-size:0.85rem;font-weight:700;color:var(--primary-dark);margin-bottom:6px;">Total Events</div>
              <div style="font-size:1.3rem;font-weight:700;">${health.eventCount}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:8px;">
              <div style="font-size:0.85rem;font-weight:700;color:var(--primary-dark);margin-bottom:6px;">First Response Delay</div>
              <div style="font-size:1.3rem;font-weight:700;">${health.firstResponse}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:8px;">
              <div style="font-size:0.85rem;font-weight:700;color:var(--primary-dark);margin-bottom:6px;">Resolution Gap</div>
              <div style="font-size:1.3rem;font-weight:700;">${health.resolutionGap}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:8px;">
              <div style="font-size:0.85rem;font-weight:700;color:var(--primary-dark);margin-bottom:6px;">Follow-up Count</div>
              <div style="font-size:1.3rem;font-weight:700;">${health.followUpCount}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:8px;">
              <div style="font-size:0.85rem;font-weight:700;color:var(--primary-dark);margin-bottom:6px;">Escalation Signals</div>
              <div style="font-size:1.3rem;font-weight:700;">${health.escalationCount}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:8px;">
              <div style="font-size:0.85rem;font-weight:700;color:var(--primary-dark);margin-bottom:6px;">Total Duration</div>
              <div style="font-size:1.3rem;font-weight:700;">${health.totalDuration}</div>
            </div>
          </div>
        `);
      }

      // 1.5 Sentiment Summary
      if (d.sentiment_summary && d.sentiment_summary.length > 0) {
        let sentHtml = '<div style="display:flex;flex-direction:column;gap:12px;">';
        d.sentiment_summary.forEach(s => {
          sentHtml += `<div style="background:var(--danger-bg);border:1px solid var(--danger);border-left:4px solid var(--danger);border-radius:6px;padding:14px;box-shadow:var(--shadow-sm);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
               <div style="font-weight:700;color:var(--danger);font-size:1rem;">🚨 ${esc(s.sentiment_type)}</div>
               <span class="badge badge-purple" style="background:var(--danger);color:#fff;">${esc(s.severity)} Severity</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.85rem;color:var(--text-dark);">
               <div><strong style="color:var(--primary-dark);">Raised By:</strong> ${esc(s.raised_by)} <span style="color:var(--text-muted);">(${esc(s.role)})</span></div>
               <div><strong style="color:var(--primary-dark);">Escalation Risk:</strong> ${esc(s.escalation_risk)}</div>
            </div>
            <div style="margin-top:8px;font-size:0.9rem;">
               <strong style="color:var(--primary-dark);">Business Impact:</strong> ${esc(s.business_impact)}
            </div>
            ${s.leadership_attention_required ? `<div style="margin-top:10px;font-size:0.8rem;font-weight:700;text-transform:uppercase;color:#fff;background:#9b2318;display:inline-block;padding:4px 8px;border-radius:4px;">⚠️ Leadership Attention Required</div>` : ''}
          </div>`;
        });
        sentHtml += '</div>';
        html += makeCard('🚨 Service Manager Sentiment & Escalation Summary', sentHtml);
      }

      // 2. ITSM Service Quality Gaps
      if (d.itsm_service_quality_gaps) {
        html += makeCard('🔍 Service Management Experience Review', `
          <div class="meta-grid" style="grid-template-columns: 1fr; gap: 16px;">
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;">
               <strong style="color:var(--primary-dark);font-size:0.85rem;text-transform:uppercase;">Resolution Clarity</strong>
               <div style="margin-top:6px;font-size:0.9rem;">${gv(d.itsm_service_quality_gaps.resolution_clarity)}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;">
               <strong style="color:var(--primary-dark);font-size:0.85rem;text-transform:uppercase;">Response Timeliness</strong>
               <div style="margin-top:6px;font-size:0.9rem;">${gv(d.itsm_service_quality_gaps.response_timeliness)}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;">
               <strong style="color:var(--primary-dark);font-size:0.85rem;text-transform:uppercase;">Requestor Follow-up Burden</strong>
               <div style="margin-top:6px;font-size:0.9rem;">${gv(d.itsm_service_quality_gaps.requestor_follow_up_burden)}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;">
               <strong style="color:var(--primary-dark);font-size:0.85rem;text-transform:uppercase;">Communication Effectiveness</strong>
               <div style="margin-top:6px;font-size:0.9rem;">${gv(d.itsm_service_quality_gaps.communication_effectiveness)}</div>
            </div>
            <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:6px;">
               <strong style="color:var(--primary-dark);font-size:0.85rem;text-transform:uppercase;">Knowledge Demonstration</strong>
               <div style="margin-top:6px;font-size:0.9rem;">${gv(d.itsm_service_quality_gaps.knowledge_demonstration)}</div>
            </div>
          </div>
        `);
      }

      // 3. Improvements
      if (d.improvement_recommendations && d.improvement_recommendations.length > 0) {
        let impHtml = '<div style="display:flex;flex-direction:column;gap:12px;">';
        d.improvement_recommendations.forEach(r => {
          impHtml += `<div class="review-email">
             <div style="font-weight:700;color:var(--primary-dark);margin-bottom:6px;font-size:0.95rem;">💡 ${esc(r.improvement)}</div>
             <div style="font-size:0.88rem;color:var(--text-secondary);background:var(--teal-bg);padding:8px;border-radius:4px;border-left:3px solid var(--primary);"><strong>Rationale:</strong> ${esc(r.rationale)}</div>
           </div>`;
        });
        impHtml += '</div>';
        html += makeCard('🚀 Improvement Recommendations', impHtml);
      }

      // 4. Timeline Summary
      if (d.timeline_summary && d.timeline_summary.length > 0) {
        let sumHtml = '<div class="vtl">';
        d.timeline_summary.forEach(s => {
          sumHtml += `<div class="vtl-item">
            <div class="vtl-dot purple">⧖</div>
            <div class="vtl-date" style="font-size:0.85rem;color:var(--primary-dark);font-weight:700;">${esc(s.time_sequence)}</div>
            <div class="vtl-content" style="background:var(--surface);border:1px solid var(--border-light);padding:14px;border-radius:6px;margin-top:8px;box-shadow:var(--shadow-sm);">
               ${s.issue_reported ? `<div style="margin-bottom:8px;"><strong>Issue Reported:</strong> ${esc(s.issue_reported)}</div>` : ''}
               ${s.escalations_or_concerns ? `<div style="margin-bottom:8px;color:#9b2318;padding:8px;background:var(--danger-bg);border-left:4px solid var(--danger);border-radius:4px;"><strong>Escalations/Concerns:</strong> ${esc(s.escalations_or_concerns)}</div>` : ''}
               ${s.reasoning ? `<div style="margin-bottom:8px;color:var(--text);padding:8px;background:#f3f6f7;border-left:4px solid var(--primary);border-radius:4px;"><strong>Reasoning:</strong> ${esc(s.reasoning)}</div>` : ''}
               ${s.key_comment_references ? `<div style="margin-bottom:8px;color:var(--text);padding:8px;background:#fbf1f0;border-left:4px solid var(--danger);border-radius:4px;"><strong>Key Comment Reference:</strong> ${esc(s.key_comment_references)}</div>` : ''}
               ${s.resolution_team_response ? `<div style="margin-bottom:8px;color:var(--info);"><strong>Team Response:</strong> ${esc(s.resolution_team_response)}</div>` : ''}
               ${s.resolution_notes ? `<div style="margin-bottom:8px;color:var(--success);"><strong>Resolution Notes:</strong> ${esc(s.resolution_notes)}</div>` : ''}
               ${s.closure_notes ? `<div style="margin-bottom:0;"><strong>Closure Notes:</strong> ${esc(s.closure_notes)}</div>` : ''}
            </div>
          </div>`;
        });
        sumHtml += '</div>';
        html += makeCard('📅 Timeline Summary (Sequence of Time)', sumHtml);
      }

      // 5. Mermaid Sequence Diagram
      if (typeof reviewTranslations !== 'undefined' && reviewTranslations && reviewTranslations.timeline && reviewTranslations.timeline.length > 0) {
        let mmd = "sequenceDiagram\n";
        mmd += "  autonumber\n";
        
        let participants = new Set();
        let flowSteps = "";
        
        reviewTranslations.timeline.forEach((ev, i) => {
            if (ev.event_type === 'no_action') return;
            
            // Clean names to be valid mermaid participants (alphanumeric only)
            let rawActor = ev.actor ? ev.actor.replace(/[^a-zA-Z0-9 ]/g, '').trim() : 'System';
            if (!rawActor) rawActor = 'System';
            let safeActorKey = rawActor.replace(/\s+/g, '');
            
            participants.add(`participant ${safeActorKey} as ${rawActor}`);
            
            let actionType = ev.event_type.replace(/_/g, ' ');
            let safeMsg = `${actionType}\n${ev.date || ''} ${ev.time || ''}`.trim();
            safeMsg = safeMsg.replace(/[^a-zA-Z0-9 :\n\/\-]/g, ''); // strip weird chars that break mermaid
            
            // Generate sequence step. Assume System -> Actor if actor is present, or just Actor to System
            if (ev.sentiment_flag && String(ev.sentiment_flag) !== 'null') {
                flowSteps += `  rect rgb(255, 230, 230)\n`;
                flowSteps += `  ${safeActorKey}->>System: 🚨 [${ev.sentiment_flag.toUpperCase()}] ${safeMsg.replace(/\n/g, ' ')}\n`;
                flowSteps += `  end\n`;
            } else if (actionType.includes("resolution") || actionType.includes("root cause")) {
                flowSteps += `  rect rgb(230, 255, 230)\n`;
                flowSteps += `  ${safeActorKey}->>System: ✅ ${safeMsg.replace(/\n/g, ' ')}\n`;
                flowSteps += `  end\n`;
            } else {
                flowSteps += `  ${safeActorKey}->>System: ${safeMsg.replace(/\n/g, ' ')}\n`;
            }
        });
        
        // Assemble Diagram
        participants.add(`participant System as OmniTracker System`);
        mmd += Array.from(participants).join("\n") + "\n";
        mmd += flowSteps;
        
        const mmdHtml = `<div class="mermaid" style="display:flex; justify-content:center; padding:20px; overflow-x:auto;">${mmd}</div>`;
        html += makeCard('📊 Event Sequence Flowchart', mmdHtml);
      }

      tab.innerHTML = html;
    }

    // ─── Render: Architecture Tab ───
    function renderArchTab(d) {
      const tab = $('tab-arch');
      let html = '';

      const sevClass = { 'CRITICAL': 'badge-danger', 'HIGH': 'badge-danger', 'MEDIUM': 'badge-warning', 'LOW': 'badge-success' }[d.severity_assessment] || 'badge-info';

      // 1. Problem Statement
      html += makeCard('🎯 Problem Statement', `
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
            <span class="badge ${sevClass}">Severity: ${gv(d.severity_assessment)}</span>
            <span class="badge badge-purple">${gv(d.technical_category)}</span>
            <span class="badge badge-info">${gv(d.resolution_type)}</span>
        </div>
        <div class="highlight-box highlight-danger">${gv(d.problem_statement)}</div>
        ${d.original_problem_description && d.original_problem_description !== d.problem_statement ? `<div class="translation-note" style="margin-top:10px;"><div class="tl-label">Original (translated above)</div>${esc(d.original_problem_description)}</div>` : ''}
        `);

      // 2. Affected Systems
      if (d.affected_systems && d.affected_systems.length > 0) {
        let sysHtml = '<div class="meta-grid">';
        d.affected_systems.forEach(s => {
          sysHtml += `<div style="padding:12px;background:var(--purple-bg);border-radius:var(--radius-sm);border:1px solid var(--purple-border);">
                <div style="font-weight:700;font-size:0.92rem;color:#4c1d95;">${esc(s.name)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Type: ${esc(s.type)} · ${esc(s.role)}</div>
            </div>`;
        });
        sysHtml += '</div>';
        html += makeCard('🖥️ Affected Systems & Components', sysHtml, d.affected_systems.length);
      }

      // 3. Environment
      if (d.environment_details) {
        html += makeCard('⚙️ Environment Details', `<div class="meta-grid">
            ${metaField('Platform', d.environment_details.platform)}
            ${metaField('Component', d.environment_details.component)}
            ${metaField('Version', d.environment_details.version)}
            ${metaField('Environment', d.environment_details.environment)}
        </div>`);
      }

      // 4. Error References
      html += makeCard('🐛 Error References & Log Entries', renderCodeList(d.error_references));

      // 5. Root Cause
      html += makeCard('🔍 Root Cause Analysis', `
        <span class="badge badge-warning" style="margin-bottom:10px;display:inline-flex;">${gv(d.root_cause_category)}</span>
        <div class="highlight-box highlight-teal" style="margin-top:8px;">${gv(d.root_cause_analysis)}</div>
      `);

      // 6. Resolution
      html += makeCopyCard('✅ Resolution Description', d.resolution_description);

      // 7. Diagnostic Steps
      html += makeCard('🔬 Diagnostic Steps Taken', renderBullets(d.diagnostic_steps_taken));

      // 8. Architecture Observations
      html += makeCard('🏗️ Architectural Observations', `
        ${renderBullets(d.architectural_observations)}
        <div style="margin-top:14px;">${renderList(d.monitoring_gaps, '📡 Monitoring Gaps')}</div>
      `);

      // 9. Engineering Recommendations
      html += makeCard('💡 Recommendations for Engineering', renderBullets(d.recommendations_for_engineering));

      // 10. Pattern & Risk
      html += makeCard('⚡ Pattern Indicators & Risk', `
        ${renderBullets(d.pattern_indicators)}
        ${d.risk_assessment ? `<div class="highlight-box highlight-danger" style="margin-top:12px;"><strong>Ongoing Risk:</strong> ${esc(d.risk_assessment)}</div>` : ''}
      `);

      // 11. Technology Stack
      if (d.technology_stack && d.technology_stack.length > 0) {
        const layerColors = { Application: '#6366f1', Middleware: '#8b5cf6', Database: '#14b8a6', Infrastructure: '#f59e0b', Network: '#3b82f6', Security: '#ef4444', Integration: '#10b981', Monitoring: '#f97316', ITSM: '#64748b', Frontend: '#ec4899', Other: '#94a3b8' };
        let techHtml = '<div class="tech-stack-grid">';
        d.technology_stack.forEach(t => {
          const color = layerColors[t.layer] || '#94a3b8';
          techHtml += `<div class="tech-stack-item" style="border-left:3px solid ${color};">
                <div class="tech-stack-icon" style="background:${color};">${esc(t.name?.charAt(0) || '?')}</div>
                <div>
                    <div class="tech-stack-name">${esc(t.name)}</div>
                    <div class="tech-stack-layer">${esc(t.layer)}${t.is_affected ? ' · <span style="color:#ef4444;font-weight:600;">Affected</span>' : ''}</div>
                    <div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px;">${esc(t.role_in_incident || '')}</div>
                </div>
            </div>`;
        });
        techHtml += '</div>';
        html += makeCard('🧩 Technology Stack', techHtml, d.technology_stack.length);
      }

      // 11b. Related Technologies (tags)
      if (d.related_technologies && d.related_technologies.length > 0) {
        let techHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
        d.related_technologies.forEach(t => { techHtml += `<span class="badge badge-info">${esc(t)}</span>`; });
        techHtml += '</div>';
        html += makeCard('🔗 Related Technologies', techHtml);
      }

      // 12. Translations
      if (d.translated_technical_notes && d.translated_technical_notes.length > 0) {
        let tlHtml = '';
        d.translated_technical_notes.forEach(n => { tlHtml += `<div class="translation-note"><div class="tl-label">🌐 Translated</div>${esc(n)}</div>`; });
        html += makeCard('🌐 Translated Technical Notes', tlHtml);
      }

      // 13. Confidence
      html += renderConfidence(d.confidence_score, d.missing_technical_data);

      tab.innerHTML = html;
    }

    // ─── UI Helpers ───
    function switchTab(id) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelector(`.tab-btn[data-tab="${id}"]`).classList.add('active');
      $('tab-' + id).classList.add('active');
    }

    function makeCard(title, content, count = null, startCollapsed = false) {
      const id = 'c-' + Math.random().toString(36).substr(2, 7);
      return `<div class="card">
        <div class="card-header" onclick="$('${id}').classList.toggle('collapsed');this.querySelector('.chevron').classList.toggle('collapsed')">
            <div class="title">${title}${count !== null ? ` <span class="badge-count">${count}</span>` : ''}</div>
            <span class="chevron ${startCollapsed ? 'collapsed' : ''}">▼</span>
        </div>
        <div id="${id}" class="card-body ${startCollapsed ? 'collapsed' : ''}">${content}</div>
    </div>`;
    }

    function makeCopyCard(title, text) {
      const copyId = 'cp-' + Math.random().toString(36).substr(2, 9);
      return makeCard(title, `<div class="copy-wrapper">
        <button class="btn-copy" onclick="doCopy('${copyId}', this)">Copy</button>
        <div id="${copyId}" class="text-block">${gv(text)}</div>
    </div>`);
    }

    function doCopy(id, btn) {
      const el = document.getElementById(id);
      const txt = el ? el.textContent : '';
      navigator.clipboard.writeText(txt).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      }).catch(() => {
        btn.textContent = 'Error';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      });
    }

    function metaField(label, val, badgeClass = null) {
      let v = gv(val);
      if (!isMissing(val) && badgeClass) v = `<span class="badge ${badgeClass}">${v}</span>`;
      return `<div><div class="meta-label">${esc(label)}</div><div class="meta-value">${v}</div></div>`;
    }

    function renderTimeline(arr) {
      if (isMissing(arr)) return '<span class="na">Not available</span>';
      return `<ul class="timeline">${arr.map(a => `<li class="timeline-item">${esc(a)}</li>`).join('')}</ul>`;
    }

    function renderBullets(arr) {
      if (isMissing(arr)) return '<span class="na">Not available</span>';
      return `<ul class="styled-list">${arr.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
    }

    function renderList(arr, heading) {
      if (isMissing(arr)) return '';
      let html = heading ? `<div style="font-weight:600;font-size:0.85rem;margin:10px 0 6px;">${heading}</div>` : '';
      html += `<ul class="styled-list">${arr.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
      return html;
    }

    function renderCodeList(arr) {
      if (isMissing(arr)) return '<span class="na">No error references found</span>';
      return arr.map(e => `<div style="padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:6px;font-family:monospace;font-size:0.82rem;color:#991b1b;word-break:break-all;">${esc(e)}</div>`).join('');
    }

    function renderConfidence(score, missing) {
      const s = isMissing(score) ? 0 : Number(score);
      const clr = s > 80 ? '#166534' : s > 50 ? '#92400e' : '#991b1b';
      return makeCard('📊 Analysis Confidence', `
        <div class="meta-grid"><div>
            <div class="meta-label">Confidence Score</div>
            <div style="font-size:1.5rem;font-weight:800;color:${clr};">${s}%</div>
            <div class="score-bar-track"><div class="score-bar-fill" style="width:${s}%;background:${clr}"></div></div>
        </div><div>
            <div class="meta-label">Missing Data</div>
            ${isMissing(missing) ? '<span class="na">None identified</span>' : renderBullets(missing)}
        </div></div>
    `, null, true);
    }

    function isMissing(v) { return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0); }
    function gv(v) { return isMissing(v) ? '<span class="na">Not available</span>' : esc(String(v)); }
    function esc(s) { return typeof s !== 'string' ? s : s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function showError(msg) { elAlert.className = 'alert error'; elAlert.style.display = 'block'; elAlert.textContent = msg; }
    function hideError() { elAlert.className = 'alert'; elAlert.style.display = 'none'; }
  