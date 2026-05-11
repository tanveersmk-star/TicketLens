// ═══════════════════════════════════════════════════════════════════════════════
// CORE/APP.JS — Application Bootstrap
//
// Initializes app state, wires DOM event listeners, and starts the skill registry.
// Loaded last so all modules are already available on window.*.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── App State ─────────────────────────────────────────────────────────────────
let pdfText           = '';
let pdfPages          = [];
let smData            = null;
let archData          = null;
let reviewTranslations = null;
let currentFileName   = '';
let analysisComplete  = false;
let pendingReanalyzeModel = null;
let extractedUsers    = [];
let activeMappingString = '';

// ── DOM Shortcuts ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Reset State ───────────────────────────────────────────────────────────────
function resetToNewFile() {
  pdfText = ''; pdfPages = []; smData = null; archData = null;
  reviewTranslations = null; currentFileName = ''; analysisComplete = false;
  activeMappingString = ''; extractedUsers = [];

  const fileStatus = $('file-status');
  if (fileStatus) fileStatus.innerHTML = '';

  const resultsArea = $('results-area');
  if (resultsArea) resultsArea.style.display = 'none';

  const progressPanel = $('progress-panel');
  if (progressPanel) progressPanel.style.display = 'none';

  const rolePanel = $('role-mapping-panel');
  if (rolePanel) rolePanel.style.display = 'none';

  const toolbar = $('reanalyze-toolbar');
  if (toolbar) toolbar.style.display = 'none';

  hideError();

  const fileInput = $('file-input');
  if (fileInput) fileInput.value = '';
}

// ── Error Helpers ─────────────────────────────────────────────────────────────
function showError(msg) {
  const el = $('alert-box');
  if (!el) return;
  el.className = 'alert error';
  el.style.display = 'block';
  el.textContent = msg;
}

function hideError() {
  const el = $('alert-box');
  if (!el) return;
  el.className = 'alert';
  el.style.display = 'none';
}

// ── Toolbar: Re-analyze with different model ──────────────────────────────────
function updateReanalyzeToolbar(activeModelKey) {
  const toolbar = $('reanalyze-toolbar');
  if (!toolbar) return;

  const fname = currentFileName || '—';
  const filenameEl = $('toolbar-filename');
  if (filenameEl) filenameEl.textContent = fname;

  const models = getConfiguredModels();
  const activeModel = models.find(m => m.id === activeModelKey) || { label: activeModelKey, modelId: '' };
  const labelEl = $('toolbar-model-label');
  if (labelEl) labelEl.textContent = `Analyzed with ${activeModel.label}${activeModel.modelId ? ' (' + activeModel.modelId + ')' : ''}`;

  const pillsEl = $('toolbar-model-pills');
  if (pillsEl) {
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
  }

  pendingReanalyzeModel = null;
  const reanalyzeBtn = $('btn-reanalyze');
  if (reanalyzeBtn) reanalyzeBtn.disabled = true;

  toolbar.style.display = 'block';
}

function updateReanalyzeToolbarModels() {
  if (analysisComplete && currentFileName) {
    const active = getActiveModel();
    if (active) updateReanalyzeToolbar(active.id);
  }
}

function selectToolbarModel(key) {
  pendingReanalyzeModel = key;
  document.querySelectorAll('#toolbar-model-pills .toolbar-model-btn').forEach(btn => {
    btn.classList.toggle('active-model', btn.dataset.modelKey === key);
  });
  const reanalyzeBtn = $('btn-reanalyze');
  if (reanalyzeBtn) reanalyzeBtn.disabled = false;
}

function triggerReanalyze() {
  if (!pendingReanalyzeModel || !pdfText) return;
  const models = getConfiguredModels();
  models.forEach(m => { m.isDefault = (m.id === pendingReanalyzeModel); });
  localStorage.setItem(LS_KEY, JSON.stringify(models));
  if (typeof renderActiveModelBar === 'function') renderActiveModelBar();
  pendingReanalyzeModel = null;
  const reanalyzeBtn = $('btn-reanalyze');
  if (reanalyzeBtn) reanalyzeBtn.disabled = true;
  if (activeMappingString && activeMappingString.trim()) {
    runAIPipeline();
  } else {
    runPreAnalysis();
  }
}

function onModelChange() {
  if (analysisComplete && activeMappingString && pdfText.trim()) return; // let user use toolbar
  if (pdfText.trim() && !analysisComplete) runPreAnalysis();
}

// ── Tab switcher ──────────────────────────────────────────────────────────────
function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const tabBtn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
  const tabContent = $('tab-' + id);
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');
}

// ── Wire DOM event listeners ──────────────────────────────────────────────────
window.addEventListener('load', async () => {
  const btnBrowse  = $('btn-browse');
  const fileInput  = $('file-input');
  const dropzone   = $('dropzone');

  if (btnBrowse) btnBrowse.addEventListener('click', e => { e.stopPropagation(); fileInput && fileInput.click(); });
  if (dropzone)  dropzone.addEventListener('click', () => fileInput && fileInput.click());
  if (fileInput) fileInput.addEventListener('change', e => { if (e.target.files.length) runPipeline(e.target.files[0]); });

  if (dropzone) {
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) runPipeline(e.dataTransfer.files[0]);
    });
  }

  // Initialize skill registry (fetch SKILL.md files from server/CDN)
  if (window.SkillRegistry) {
    await window.SkillRegistry.init().catch(() => {}); // silent if file:// protocol
  }

  // Initialize admin state
  if (typeof initAdminState === 'function') initAdminState();

  // Render active model bar
  if (typeof renderActiveModelBar === 'function') renderActiveModelBar();

  // Wire admin overlay close-on-background-click
  const adminOverlay = $('admin-overlay');
  if (adminOverlay) {
    adminOverlay.addEventListener('click', e => {
      if (e.target === adminOverlay) closeAdmin();
    });
  }
});

// ── Expose globals ────────────────────────────────────────────────────────────
window.pdfText              = pdfText;        // modules can read but should use global directly
window.pdfPages             = pdfPages;
window.resetToNewFile       = resetToNewFile;
window.showError            = showError;
window.hideError            = hideError;
window.updateReanalyzeToolbar       = updateReanalyzeToolbar;
window.updateReanalyzeToolbarModels = updateReanalyzeToolbarModels;
window.selectToolbarModel   = selectToolbarModel;
window.triggerReanalyze     = triggerReanalyze;
window.onModelChange        = onModelChange;
window.switchTab            = switchTab;
window.$                    = $;
