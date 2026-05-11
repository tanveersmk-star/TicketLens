// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS/REVIEW-AGENT.JS — Agent 2: Content Review & Timeline Extraction
//
// Sends preprocessed PDF text to the LLM with the Content Reviewer + ITSM Expert
// skill prompts and returns a fully structured incident JSON.
//
// This agent's output feeds both the SM Agent and EA Agent (token optimization).
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Build the full system prompt for the review agent ────────────────────────
function buildReviewPrompt(mappingInjection) {
  const reviewSkill = window.SkillRegistry
    ? window.SkillRegistry.get('review')
    : (window._DEFAULT_REVIEW_SKILL || '');

  const itsmSkill = window.SkillRegistry
    ? window.SkillRegistry.get('itsm')
    : (window._DEFAULT_ITSM_SKILL || '');

  const parserSkill = window.SkillRegistry
    ? window.SkillRegistry.get('parser')
    : (window._DEFAULT_PARSER_SKILL || '');

  const base   = reviewSkill  || window.REVIEW_TRANSLATE_PROMPT_BASE || '';
  const itsm   = itsmSkill    || window.DEFAULT_ITSM_SKILL || '';
  const parser = parserSkill  || '';

  return (
    (window.SECURITY_SYSTEM_CONSTRAINT || '') +
    (base || window.REVIEW_TRANSLATE_PROMPT || '') +
    (itsm   ? '\n\n--- MERGED SKILL: ITSM Expert ---\n'              + itsm   : '') +
    (parser ? '\n\n--- MERGED SKILL: OmniTracker Document Parser ---\n' + parser : '') +
    (mappingInjection || '')
  );
}

// ── Client-side sentiment enforcement filter ──────────────────────────────────
// Strips any sentiment flag the LLM attached to resolver-side roles.
function enforceTimelineSentiment(timeline, actorMap) {
  if (!Array.isArray(timeline)) return;
  const cfg = (window.CONFIG && window.CONFIG.role_sentiment_config) || {};

  const isSupportTeamActivity = (actorText, summaryText) => {
    const combined = `${actorText || ''} ${summaryText || ''}`.toLowerCase();
    return /\b(support\s+team|service\s+desk|resolver|agent|internal\s+note|ops\s+team|status\s+update|requested|acknowledged|confirmed|asked|continued\s+to|closed|reassigned|transferred|checked)\b/.test(combined);
  };

  timeline.forEach(ev => {
    if (!ev.sentiment_flag || ev.sentiment_flag === 'null') return;

    const mappedRole = resolveMappedActor(ev.actor, actorMap)?.role || null;

    if (mappedRole) {
      if (cfg[mappedRole] === false) ev.sentiment_flag = null;
    } else {
      if (isSupportTeamActivity(ev.actor, ev.detailed_activity_summary)) ev.sentiment_flag = null;
      else if (isSupportTeamActivity(ev.actor, '')) ev.sentiment_flag = null;
    }
  });
}

// ── Run the review agent ──────────────────────────────────────────────────────
async function runReviewAgent(endpointConf, apiKey, pdfText, mappingInjection) {
  const systemPrompt = buildReviewPrompt(mappingInjection);

  const rawJson = await callLLM(
    endpointConf,
    apiKey,
    pdfText,
    systemPrompt
  );

  let data = safeParseJSON(rawJson);

  // Apply client-side sentiment enforcement
  if (data && data.timeline) {
    const actorMap = parseActorRoleMap();
    enforceTimelineSentiment(data.timeline, actorMap);
    normalizeTimelineActors(data.timeline, actorMap);
  }

  // Security scan
  if (data) {
    const hits = secDeepScan(data);
    if (hits.length > 0) showSecurityWarning(hits, 'AI review analysis output');
  }

  return data;
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.buildReviewPrompt       = buildReviewPrompt;
window.enforceTimelineSentiment = enforceTimelineSentiment;
window.runReviewAgent           = runReviewAgent;
