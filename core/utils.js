// ═══════════════════════════════════════════════════════════════════════════════
// CORE/UTILS.JS — Shared utility functions
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── HTML escaping (used by ALL renderers before DOM insertion) ────────────────
function esc(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Missing value check ───────────────────────────────────────────────────────
function isMissing(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// ── Get value with N/A fallback ───────────────────────────────────────────────
function gv(v) {
  return isMissing(v) ? '<span class="na">Not available</span>' : esc(String(v));
}

// ── Robust JSON parser ────────────────────────────────────────────────────────
// Handles AI preamble ("Here is the JSON:"), markdown fences (```json...```),
// and trailing text after the closing brace.
function safeParseJSON(str) {
  if (!str) return null;
  let c = str.trim();

  const firstBrace = c.indexOf('{');
  const lastBrace  = c.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    c = c.substring(firstBrace, lastBrace + 1);
  } else {
    c = c.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  try {
    return JSON.parse(c);
  } catch (e) {
    console.error('[safeParseJSON] Parse error:', e, '\nCleaned string preview:', c.slice(0, 200));
    throw new Error('AI returned invalid JSON. Please try again.');
  }
}

// ── Shallow object merge (does not deep-clone) ────────────────────────────────
function mergeObjects(...objs) {
  return Object.assign({}, ...objs.filter(Boolean));
}

// ── Simple ID generator (no crypto dep) ──────────────────────────────────────
function genId(prefix) {
  return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9);
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.esc          = esc;
window.isMissing    = isMissing;
window.gv           = gv;
window.safeParseJSON = safeParseJSON;
window.mergeObjects = mergeObjects;
window.genId        = genId;
