// ═══════════════════════════════════════════════════════════════════════════════
// SKILL-REGISTRY.JS — Dynamic SKILL.md Loader with 3-Tier Fallback
//
// Loading priority per skill:
//   1. localStorage   (admin panel override — hot, session-persistent)
//   2. fetch()        (physical SKILL.md file — works with web server / CDN)
//   3. JS constant    (hardcoded fallback — always available, including file://)
//
// Usage:
//   await SkillRegistry.init();          // call once at app startup
//   const prompt = SkillRegistry.get('ea');   // returns merged skill text
//   SkillRegistry.set('ea', customText); // override via admin panel
//   SkillRegistry.reset('ea');           // clear override, reload from file
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const SkillRegistry = (() => {

  // ── Skill definitions ────────────────────────────────────────────────────────
  const SKILL_DEFS = {
    itsm: {
      lsKey: 'SKILL_itsm',
      path: './skills/itsm-expert/SKILL.md',
      fallback: () => window._DEFAULT_ITSM_SKILL || ''
    },
    review: {
      lsKey: 'SKILL_review',
      path: './skills/content-reviewer/SKILL.md',
      fallback: () => window._DEFAULT_REVIEW_SKILL || ''
    },
    sm: {
      lsKey: 'SKILL_sm',
      path: './skills/service-manager/SKILL.md',
      fallback: () => window._DEFAULT_SM_SKILL || ''
    },
    ea: {
      lsKey: 'SKILL_ea',
      path: './skills/enterprise-architect/SKILL.md',
      fallback: () => window._DEFAULT_EA_SKILL || ''
    },
    parser: {
      lsKey: 'SKILL_parser',
      path: './skills/omnitracker-parser/SKILL.md',
      fallback: () => window._DEFAULT_PARSER_SKILL || ''
    }
  };

  // ── In-memory cache (populated by init()) ────────────────────────────────────
  const _cache = {};

  // ── Fetch a single SKILL.md file ─────────────────────────────────────────────
  async function _fetchSkillFile(path) {
    const resp = await fetch(path, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    // Strip YAML frontmatter (--- ... ---)
    return text.replace(/^---[\s\S]*?---\s*/m, '').trim();
  }

  // ── Load one skill: ls → file → fallback ─────────────────────────────────────
  async function _loadSkill(id) {
    const def = SKILL_DEFS[id];
    if (!def) return '';

    // Tier 1: localStorage override
    const lsVal = localStorage.getItem(def.lsKey);
    if (lsVal) return lsVal;

    // Tier 2: admin-config.js physical file override
    const adminCfg = (window.ADMIN_CONFIG || {}).skills || {};
    if (adminCfg[id]) return adminCfg[id];

    // Tier 3: fetch SKILL.md from filesystem/server
    try {
      return await _fetchSkillFile(def.path);
    } catch (_) {
      // Tier 4: hardcoded JS fallback
      return def.fallback() || '';
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  async function init() {
    const ids = Object.keys(SKILL_DEFS);
    const results = await Promise.allSettled(ids.map(id => _loadSkill(id)));
    ids.forEach((id, i) => {
      _cache[id] = results[i].status === 'fulfilled' ? results[i].value : (SKILL_DEFS[id].fallback() || '');
    });
  }

  function get(id) {
    return _cache[id] || (SKILL_DEFS[id] ? SKILL_DEFS[id].fallback() : '');
  }

  function set(id, text) {
    _cache[id] = text;
    if (SKILL_DEFS[id]) localStorage.setItem(SKILL_DEFS[id].lsKey, text);
  }

  function reset(id) {
    if (SKILL_DEFS[id]) localStorage.removeItem(SKILL_DEFS[id].lsKey);
    // Re-fetch from file
    _loadSkill(id).then(text => { _cache[id] = text; });
  }

  function resetAll() {
    Object.keys(SKILL_DEFS).forEach(id => {
      if (SKILL_DEFS[id]) localStorage.removeItem(SKILL_DEFS[id].lsKey);
    });
    return init();
  }

  // Returns all cached skill texts as a plain object (for export)
  function exportAll() {
    return { ...Object.fromEntries(Object.keys(SKILL_DEFS).map(id => [id, _cache[id] || ''])) };
  }

  return { init, get, set, reset, resetAll, exportAll };
})();

// Make globally accessible
window.SkillRegistry = SkillRegistry;
