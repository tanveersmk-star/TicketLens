// ═══════════════════════════════════════════════════════════════════════════════
// CORE/TOKEN-TRACKER.JS — Per-model token usage tracking
//
// Stores cumulative token usage in localStorage under ITSM_TOKEN_USAGE.
// Tracking is best-effort — failures are silently swallowed.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const LS_TOKEN_KEY = 'ITSM_TOKEN_USAGE';

function getTokenUsage() {
  try { return JSON.parse(localStorage.getItem(LS_TOKEN_KEY)) || {}; } catch (_) { return {}; }
}

function saveTokenUsage(usage) {
  try { localStorage.setItem(LS_TOKEN_KEY, JSON.stringify(usage)); } catch (_) {}
}

function recordTokenUsage(modelId, inputTokens, outputTokens) {
  try {
    const usage = getTokenUsage();
    if (!usage[modelId]) usage[modelId] = { input: 0, output: 0, total: 0, calls: 0, lastUsed: null };
    usage[modelId].input  += (inputTokens  || 0);
    usage[modelId].output += (outputTokens || 0);
    usage[modelId].total  += ((inputTokens || 0) + (outputTokens || 0));
    usage[modelId].calls  += 1;
    usage[modelId].lastUsed = new Date().toISOString();
    saveTokenUsage(usage);
  } catch (_) {}
}

function resetTokenUsage(modelId) {
  const usage = getTokenUsage();
  delete usage[modelId];
  saveTokenUsage(usage);
  if (typeof renderAdminModelList === 'function') renderAdminModelList();
  if (typeof showAdminNotice === 'function') showAdminNotice('Token usage reset for this model.', 'success');
}

function formatTokenCount(n) {
  if (!n || n === 0) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.LS_TOKEN_KEY      = LS_TOKEN_KEY;
window.getTokenUsage     = getTokenUsage;
window.saveTokenUsage    = saveTokenUsage;
window.recordTokenUsage  = recordTokenUsage;
window.resetTokenUsage   = resetTokenUsage;
window.formatTokenCount  = formatTokenCount;
