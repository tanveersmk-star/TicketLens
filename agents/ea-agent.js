// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS/EA-AGENT.JS — Agent 4: Enterprise Architect / SME Analysis
//
// Receives a slim JSON payload from the review agent's output.
// Analyzes root cause, affected systems, tech stack, architectural gaps.
//
// Runs in parallel with SM Agent (Promise.all) — same JSON input, different lens.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Build EA-specific JSON payload (technical fields only) ───────────────────
function buildEaPayload(reviewData) {
  const rd = reviewData || {};
  return {
    incident: rd.incident || {},
    timeline: (rd.timeline || []).map(e => ({
      date:                      e.date,
      day_name:                  e.day_name,
      time:                      e.time,
      event_type:                e.event_type,
      status:                    e.status,
      actor:                     e.actor,
      actor_role:                e.actor_role,
      from_value:                e.from_value,
      to_value:                  e.to_value,
      action_description:        e.action_description,
      detailed_activity_summary: e.detailed_activity_summary
    })),
    communications:    rd.communications || [],
    work_notes:        rd.work_notes || [],
    document_languages: rd.document_languages,
    primary_language:  rd.primary_language,
    extraction_notes:  rd.extraction_notes
  };
}

// ── Build EA system prompt ────────────────────────────────────────────────────
function buildEaPrompt() {
  const eaSkill = window.SkillRegistry
    ? window.SkillRegistry.get('ea')
    : (window._DEFAULT_EA_SKILL || '');

  const itsmSkill = window.SkillRegistry
    ? window.SkillRegistry.get('itsm')
    : (window._DEFAULT_ITSM_SKILL || '');

  const base = eaSkill || window.ARCH_SYSTEM_PROMPT_BASE || '';
  const itsm = itsmSkill || window.DEFAULT_ITSM_SKILL || '';

  return (
    (window.SECURITY_SYSTEM_CONSTRAINT || '') +
    base +
    (itsm ? '\n\n--- MERGED SKILL: ITSM Expert ---\n' + itsm : '')
  );
}

// ── Run the EA agent ──────────────────────────────────────────────────────────
async function runEaAgent(endpointConf, apiKey, reviewData) {
  const payload    = buildEaPayload(reviewData);
  const systemPrompt = buildEaPrompt();
  const userPrefix = 'Analyze this pre-extracted ITSM incident data (structured JSON from OmniTracker) and return strict JSON';

  const rawJson = await callLLM(endpointConf, apiKey, JSON.stringify(payload), systemPrompt, userPrefix);
  const data = safeParseJSON(rawJson);

  // Security scan
  if (data) {
    const hits = secDeepScan(data);
    if (hits.length > 0) showSecurityWarning(hits, 'AI architecture output');
  }

  return data;
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.buildEaPayload = buildEaPayload;
window.buildEaPrompt  = buildEaPrompt;
window.runEaAgent     = runEaAgent;
