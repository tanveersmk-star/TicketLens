// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS/SM-AGENT.JS — Agent 3: IT Service Manager Analysis
//
// Receives a slim JSON payload extracted from the review agent's output.
// Analyzes customer experience, sentiment, timeliness, and improvements.
//
// Input token budget: ~5–6K (vs ~58K for raw PDF) — 90% reduction.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Build SM-specific JSON payload (only SM-relevant fields) ─────────────────
function buildSmPayload(reviewData) {
  const rd = reviewData || {};
  return {
    incident: rd.incident || {},
    timeline: (rd.timeline || []).map(e => ({
      date:                      e.date,
      day_name:                  e.day_name,
      time:                      e.time,
      time_ampm:                 e.time_ampm,
      ticket_priority:           e.ticket_priority,
      event_type:                e.event_type,
      status:                    e.status,
      actor:                     e.actor,
      actor_role:                e.actor_role,
      action_description:        e.action_description,
      intent_reasoning:          e.intent_reasoning,
      message_summary:           e.message_summary,
      key_questions_or_requests: e.key_questions_or_requests,
      detailed_activity_summary: e.detailed_activity_summary,
      sentiment_flag:            e.sentiment_flag
    })),
    priority_changes:  rd.priority_changes  || [],
    quality:           rd.quality           || {},
    document_languages: rd.document_languages,
    primary_language:  rd.primary_language
  };
}

// ── Build SM system prompt ────────────────────────────────────────────────────
function buildSmPrompt(mappingInjection) {
  const smSkill = window.SkillRegistry
    ? window.SkillRegistry.get('sm')
    : (window._DEFAULT_SM_SKILL || '');

  const itsmSkill = window.SkillRegistry
    ? window.SkillRegistry.get('itsm')
    : (window._DEFAULT_ITSM_SKILL || '');

  const base = smSkill || window.SM_SYSTEM_PROMPT_BASE || '';
  const itsm = itsmSkill || window.DEFAULT_ITSM_SKILL || '';

  return (
    (window.SECURITY_SYSTEM_CONSTRAINT || '') +
    base +
    (itsm ? '\n\n--- MERGED SKILL: ITSM Expert ---\n' + itsm : '') +
    (mappingInjection || '')
  );
}

// ── Client-side SM sentiment enforcement filter ───────────────────────────────
// Strips any hallucinated resolver-side sentiment from SM output.
function enforceSmSentiment(smData, actorMap) {
  if (!smData || !smData.sentiment_summary) return smData;
  const cfg = (window.CONFIG && window.CONFIG.role_sentiment_config) || {};

  const isSupportTeamRole = (roleText, actorText, impactText) => {
    const combined = `${roleText || ''} ${actorText || ''} ${impactText || ''}`.toLowerCase();
    return /\b(support\s+team|service\s+desk|resolver|agent|internal|ops\s+team|status\s+update|requested|acknowledged|confirmed|asked|continued|closed|reassigned|transferred)\b/.test(combined);
  };

  smData.sentiment_summary = smData.sentiment_summary.filter(s => {
    const raisedByMatch  = resolveMappedActor(s.raised_by, actorMap);
    const roleFieldMatch = resolveMappedActor(s.role, actorMap);
    const raisedByRole   = raisedByMatch?.role  || null;
    const roleFieldRole  = roleFieldMatch?.role || null;
    const effectiveRole  = raisedByRole || roleFieldRole || s.role;

    if (raisedByMatch) {
      s.raised_by = raisedByMatch.name;
      s.role      = raisedByMatch.role;
    }

    const exactMatch = Object.keys(cfg).find(r =>
      normalizeActorKey(r).includes(normalizeActorKey(effectiveRole || '')) ||
      normalizeActorKey(effectiveRole || '').includes(normalizeActorKey(r))
    );

    if (exactMatch && cfg[exactMatch] === true) return true;
    if (isSupportTeamRole(s.role, s.raised_by, s.business_impact)) return false;
    return false;
  });

  return smData;
}

// ── Run the SM agent ──────────────────────────────────────────────────────────
async function runSmAgent(endpointConf, apiKey, reviewData, mappingInjection) {
  const payload    = buildSmPayload(reviewData);
  const systemPrompt = buildSmPrompt(mappingInjection);
  const userPrefix = 'Analyze this pre-extracted ITSM incident data (structured JSON from OmniTracker) and return strict JSON';

  const rawJson = await callLLM(endpointConf, apiKey, JSON.stringify(payload), systemPrompt, userPrefix);
  let data = safeParseJSON(rawJson);

  // Apply client-side enforcement
  const actorMap = parseActorRoleMap();
  data = enforceSmSentiment(data, actorMap);

  // Security scan
  if (data) {
    const hits = secDeepScan(data);
    if (hits.length > 0) showSecurityWarning(hits, 'AI service manager output');
  }

  return data;
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.buildSmPayload    = buildSmPayload;
window.buildSmPrompt     = buildSmPrompt;
window.enforceSmSentiment = enforceSmSentiment;
window.runSmAgent        = runSmAgent;
