// ═══════════════════════════════════════════════════════════════════════════════
// CORE/CONFIG-MANAGER.JS — 3-Tier Configuration Resolution
//
// Priority chain (highest wins):
//   1. localStorage  (runtime changes via Admin panel)
//   2. window.ADMIN_CONFIG / window.CONFIG (physical files: admin-config.js, config.js)
//   3. Hardcoded JS defaults
//
// Model registry is stored under LS_KEY in localStorage.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

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

// ── Generic 3-tier getter ─────────────────────────────────────────────────────
function cfgGet(lsKey, fileFn, fallback) {
  const ls = localStorage.getItem(lsKey);
  if (ls) { try { return JSON.parse(ls); } catch (_) { return ls; } }
  const fileVal = typeof fileFn === 'function' ? fileFn() : fileFn;
  if (fileVal !== null && fileVal !== undefined) return fileVal;
  return fallback;
}

// ── Seed model list from window.CONFIG (config.js) ───────────────────────────
function seedFromConfig() {
  const cfg  = window.CONFIG || {};
  const keys = cfg.KEYS || {};
  const eps  = cfg.ENDPOINTS || {};

  const defaults = [
    { id: 'openai', label: 'OpenAI', iconText: 'AI', iconBg: ICON_COLORS[0] },
    { id: 'glm5',   label: 'GLM',    iconText: 'GL', iconBg: ICON_COLORS[1] },
    { id: 'qwen',   label: 'Qwen',   iconText: 'QW', iconBg: ICON_COLORS[2] },
  ];

  return Object.keys(eps).map((id, idx) => {
    const def = defaults.find(d => d.id === id) || {};
    return {
      id,
      label:     def.label    || id,
      modelId:   eps[id].model || '',
      url:       eps[id].url   || '',
      apiKey:    keys[id]      || '',
      iconText:  def.iconText  || id.slice(0, 2).toUpperCase(),
      iconBg:    def.iconBg    || ICON_COLORS[idx % ICON_COLORS.length],
      enabled:   true,
      isDefault: idx === 0
    };
  });
}

// ── Normalize model list (ensure single default, assign icons) ───────────────
function normalizeConfiguredModels(models) {
  const merged = Array.isArray(models) ? models.filter(Boolean) : [];
  const configModels = seedFromConfig();
  const existingIds  = new Set(merged.map(m => m.id));

  configModels.forEach(cfgModel => {
    if (!existingIds.has(cfgModel.id)) merged.push(cfgModel);
  });

  if (!merged.some(m => m.isDefault) && merged.length > 0) {
    merged[0].isDefault = true;
  }

  let seenDefault = false;
  merged.forEach((m, idx) => {
    if (m.isDefault && !seenDefault) {
      seenDefault = true;
    } else {
      m.isDefault = false;
    }
    if (!m.iconBg)   m.iconBg   = ICON_COLORS[idx % ICON_COLORS.length];
    if (!m.iconText) m.iconText = (m.label || m.id || 'AI').slice(0, 2).toUpperCase();
  });

  return merged;
}

function getConfiguredModels() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return normalizeConfiguredModels(JSON.parse(stored));
  } catch (_) {}
  return normalizeConfiguredModels(seedFromConfig());
}

function saveConfiguredModels(models) {
  localStorage.setItem(LS_KEY, JSON.stringify(normalizeConfiguredModels(models)));
  if (typeof renderActiveModelBar === 'function')      renderActiveModelBar();
  if (typeof updateReanalyzeToolbarModels === 'function') updateReanalyzeToolbarModels();
  if (typeof resetToNewFile === 'function')            resetToNewFile();
}

function getActiveModel() {
  const models = getConfiguredModels();
  return models.find(m => m.isDefault) || models[0] || null;
}

function getCurrentModelKey() {
  const active = getActiveModel();
  return active ? active.id : null;
}

function setDefaultModel(id) {
  const models = getConfiguredModels();
  models.forEach(m => { m.isDefault = m.id === id; });
  saveConfiguredModels(models);
  if (typeof renderActiveModelBar === 'function') renderActiveModelBar();
  if (typeof updateReanalyzeToolbarModels === 'function') updateReanalyzeToolbarModels();
}

// ── Role config helpers ───────────────────────────────────────────────────────
function getRolesConfig() {
  const stored = localStorage.getItem('ITSM_ROLES_CONFIG_V2');
  if (stored) { try { return JSON.parse(stored); } catch (_) {} }
  const adminCfg = window.ADMIN_CONFIG || {};
  if (adminCfg.roles && adminCfg.roles.length > 0) return JSON.parse(JSON.stringify(adminCfg.roles));
  // Legacy: transform from config.js map
  const oldMap = (window.CONFIG || {}).role_sentiment_config || {};
  const colors = ['#0078b4','#5b21b6','#a02818','#e69500','#00a86b','#d63d2f','#6f5091','#009999','#e69500','#0078b4','#00a86b'];
  return Object.keys(oldMap).map((name, i) => ({
    role: name, description: name, order: i + 1,
    active: true, sentiment: oldMap[name], color: colors[i % colors.length]
  }));
}

function saveRolesConfig(roles) {
  localStorage.setItem('ITSM_ROLES_CONFIG_V2', JSON.stringify(roles));
  // Sync window.CONFIG.role_sentiment_config for analysis engine
  if (window.CONFIG) {
    window.CONFIG.role_sentiment_config = Object.fromEntries(roles.map(r => [r.role, r.sentiment]));
  }
}

function getRoleOptions() {
  return getRolesConfig().filter(r => r.active).map(r => r.role);
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.LS_KEY                    = LS_KEY;
window.ICON_COLORS               = ICON_COLORS;
window.cfgGet                    = cfgGet;
window.seedFromConfig            = seedFromConfig;
window.normalizeConfiguredModels = normalizeConfiguredModels;
window.getConfiguredModels       = getConfiguredModels;
window.saveConfiguredModels      = saveConfiguredModels;
window.getActiveModel            = getActiveModel;
window.getCurrentModelKey        = getCurrentModelKey;
window.setDefaultModel           = setDefaultModel;
window.getRolesConfig            = getRolesConfig;
window.saveRolesConfig           = saveRolesConfig;
window.getRoleOptions            = getRoleOptions;
