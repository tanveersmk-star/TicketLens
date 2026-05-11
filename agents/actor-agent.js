// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS/ACTOR-AGENT.JS — Agent 1: Client-Side Actor & Role Extraction
//
// Extracts human actor names from the PDF header and COMM blocks using
// pure client-side regex — zero LLM tokens required.
// Suggests roles based on context heuristics around each actor's name.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Name normalization ────────────────────────────────────────────────────────
function normalizeActorKey(txt) {
  return String(txt || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCaseName(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => /^[A-Z]{2,}$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

// ── Single proper-noun check (first name only, from trusted field labels) ─────
// Used only when the value came from a structured field like "Reporting Person: Pascal"
// so false-positive risk is low — the label itself guarantees it's a person field.
function looksLikeSingleFirstName(value) {
  const v = String(value || '').trim();
  if (!v || v.length < 3 || v.length > 30) return false;
  if (/\d/.test(v) || /\s/.test(v)) return false;
  // Must be a single alphabetic word (allows Unicode names like Müller, Dávid)
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]{3,}$/.test(v)) return false;
  const low = v.toLowerCase();
  // Exclude common field labels, greetings, and generic words that could leak in
  const banned = new Set([
    'system','service','support','resolver','queue','mailbox','noreply','omnitracker','bot',
    'monitor','alert','ticket','incident','automation','workflow','provider','customer','guest',
    'basis','progress','assigned','assignment','status','target','state','stopped','date','group',
    'person','priority','impact','urgency','category','location','site','department','phone',
    'email','created','modified','reporting','affected','caller','contact','history','verlauf',
    'historie','verantwortlich','bearbeiter','autor','author','verfasser','attachment','property',
    'label','value','next','current','previous','start','end','duration','hours','minutes',
    'seconds','total','standard','custom','type','number','key','reference','internal','external',
    'public','private','technical','business','functional','operational',
    'good','dear','hello','guten','hallo','from','subject','gesendet','von','betreff',
    'team','group','desk','level','info','noreply','admin','mailer','notification','alert',
    'open','closed','new','done','pending',
  ]);
  return !banned.has(low);
}

// ── Human name detection ─────────────────────────────────────────────────────
function looksLikeHumanActorName(name) {
  const value = String(name || '').trim();
  if (!value || /\d/.test(value)) return false;
  if (value.length < 4 || value.length > 80) return false;

  const banned = /\b(system|service desk|support team|resolver|queue|mailbox|noreply|no-reply|omnitracker|bot|monitor|alert|ticket|incident|internal note|automation|workflow|status update|provider|customer service|guest|basis|progress|assigned|assignment|status|current provider|in progress|new assigned|kollegen|target|state|stopped|times|nachrichten|date|group|person|priority|impact|urgency|service|category|location|site|department|phone|email|created|modified|reporting|affected|caller|contact|history|verlauf|historie|verantwortlich|bearbeiter|autor|author|verfasser|sende|empfang|anhang|attachment|property|label|value|next|current|previous|start|end|duration|hours|minutes|seconds|total|sum|count|average|min|max|standard|custom|type|id|number|key|ref|reference|internal|external|public|private|technical|business|functional|operational)\b/i;
  if (banned.test(value)) return false;

  if (/^(Next|Current|Previous|Target|Status|Response|Resolution|Responsible|Sende|Service)\b/i.test(value)) return false;
  if (/\b(Target|State|Stopped|Date|Group|Person|Times|Nachrichten|Indicators|Summary|Details|Notes|Description|Title|Category|Priority|Impact|Urgency)$/i.test(value)) return false;

  const tokens = value.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
  const greetings = new Set(['good', 'day', 'morning', 'afternoon', 'evening', 'hello', 'hi', 'dear', 'guten', 'tag', 'hallo', 'liebe', 'lieben']);
  const badTokens = new Set(['current', 'provider', 'customer', 'service', 'guest', 'new', 'assigned', 'basis', 'progress', 'ihrem', 'kollegen', 'team', 'support']);

  if (tokens.length < 2 && !/@/.test(value)) return false;
  if (tokens.some(t => greetings.has(t.toLowerCase()))) return false;
  if (tokens.every(t => badTokens.has(t.toLowerCase()))) return false;
  if (tokens.some(t => t.length < 2)) return false;

  const alphaTokens = tokens.filter(t => /^[A-Za-zÀ-ÖØ-öø-ÿ'`.-]+$/.test(t));
  if (alphaTokens.length !== tokens.length) return false;
  return true;
}

function isStrictHumanActor(name) {
  const value = String(name || '').trim();
  if (!looksLikeHumanActorName(value)) return false;
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length > 4) return false;
  if (/^(good\s+(day|morning|afternoon|evening)|guten\s+tag|hello|hi|dear)\b/i.test(value)) return false;
  if (/^(current\s+provider|customer\s+service|guest\s+new\s+assigned|in\s+progress(?:\s+assigned)?|hi\s+basis|ihrem\s+kollegen)$/i.test(value)) return false;
  return tokens.some(t => t.length >= 3);
}

// ── Name extraction from raw chunks ──────────────────────────────────────────
function extractNameFromActorChunk(chunk) {
  if (!chunk) return null;
  let value = String(chunk).trim();
  if (!value) return null;

  const angleMatch = value.match(/^([^<]+)</);
  if (angleMatch) value = angleMatch[1].trim();

  if (/@/.test(value) && !/\s/.test(value)) {
    const local = value.split('@')[0].replace(/[._-]+/g, ' ').trim();
    if (looksLikeHumanActorName(local)) return toTitleCaseName(local);
    // Single-word email local part (e.g. pascal@external.com → "Pascal")
    const singleLocal = local.split(/\s+/)[0];
    if (looksLikeSingleFirstName(toTitleCaseName(singleLocal))) return toTitleCaseName(singleLocal);
  }

  value = value.replace(/\([^)]*\)/g, ' ').replace(/["']/g, '').replace(/\s+/g, ' ').trim();

  const explicitName = value.match(/[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'`-]+(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'`-]+)+/);
  if (explicitName && looksLikeHumanActorName(explicitName[0])) return toTitleCaseName(explicitName[0]);
  if (looksLikeHumanActorName(value)) return toTitleCaseName(value);
  return null;
}

// ── Main extraction: scan text for actor candidates ───────────────────────────
function extractActorCandidatesFromText(text) {
  const candidates = new Map();
  const lines = String(text || '').split(/\r?\n/);

  // Ticket header field labels that carry a person's name as the value
  const actorTaggedLine = /\b(changed by|updated by|comment by|kommentar von|author|autor|bearbeiter|assigned to|owner|responsible person|verantwortlich(?:e person)?|resolved by|closed by|worked by|processed by|escalated by|approved by|reporting person|reported by|meldende person|affected person|betroffene person|caller|contact person|kontaktperson|requested by|submitted by|opened by|created by)\b\s*[:\-]\s*(.+)$/i;
  const actionLine = /\b(commented|updated|changed|assigned|reassigned|took ownership|owned by|resolved|closed|provided|replied|responded|escalated|approved|investigated|confirmed|requested|followed up|added note|sent email|wrote|posted)\b/i;
  // Exclude distribution lists and passive recipients only — NOT header field labels
  const excludeLine = /\b(^to\s*:|^an\s*:|^cc\s*:|copied|distribution list|recipient|verteiler|mailing list|contact list)\b/i;

  const addCandidate = raw => {
    const name = extractNameFromActorChunk(raw);
    if (!name) return;
    const key = normalizeActorKey(name);
    if (!key || candidates.has(key)) return;
    candidates.set(key, name);
  };

  // For trusted field labels (Reporting Person:, Caller:, etc.) also accept single first names.
  const addTaggedCandidate = raw => {
    const cleaned = String(raw || '').replace(/\([^)]*\)/g, '').replace(/["'<>]/g, '').trim();
    if (!cleaned) return;
    // Normal path first
    const name = extractNameFromActorChunk(cleaned);
    if (name) { addCandidate(cleaned); return; }
    // Single-word fallback: proper first name from a trusted label context
    const single = toTitleCaseName(cleaned);
    if (looksLikeSingleFirstName(single)) {
      const key = normalizeActorKey(single);
      if (key && !candidates.has(key)) candidates.set(key, single);
    }
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const tagged = trimmed.match(actorTaggedLine);
    if (tagged && tagged[2]) {
      tagged[2].split(/[;|]/).forEach(addTaggedCandidate);
      return;
    }

    if (excludeLine.test(trimmed)) return;

    const isFromHeader = /^From\s*:/i.test(trimmed);
    const isCommHeader = isFromHeader || /^To\s*:|^Cc\s*:|^By\s*:/i.test(trimmed);
    if (!isCommHeader && !actionLine.test(trimmed)) return;
    if (trimmed.endsWith(':') || /^[A-Z\s\-]{4,}:?$/.test(trimmed)) return;

    // Try capitalized name extraction first
    const directNames = trimmed.match(/[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'`-]+(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'`-]+){1,2}/g) || [];
    directNames.forEach(addCandidate);

    // For From: lines, also extract raw email address when no display name is present
    if (isFromHeader && directNames.length === 0) {
      const emailMatch = trimmed.match(/From\s*:\s*<?\s*([^\s<>@,;]+@[^\s<>@,;]+)\s*>?/i);
      if (emailMatch) addCandidate(emailMatch[1]);
    }
  });

  return Array.from(candidates.values());
}

// ── Merge AI-extracted users with supplemental regex candidates ───────────────
function mergeExtractedUsers(aiUsers, supplementalNames) {
  const merged = new Map();

  const isAcceptableName = n => isStrictHumanActor(n) || looksLikeSingleFirstName(n);

  (Array.isArray(aiUsers) ? aiUsers : []).forEach(user => {
    const name = extractNameFromActorChunk(user?.name) || (looksLikeSingleFirstName(toTitleCaseName(String(user?.name || ''))) ? toTitleCaseName(String(user.name)) : null);
    if (!name || !isAcceptableName(name)) return;
    merged.set(normalizeActorKey(name), { name, suggested_role: user?.suggested_role || 'Support Team' });
  });

  (Array.isArray(supplementalNames) ? supplementalNames : []).forEach(name => {
    const cleanName = extractNameFromActorChunk(name) || (looksLikeSingleFirstName(toTitleCaseName(String(name || ''))) ? toTitleCaseName(String(name)) : null);
    if (!cleanName || !isAcceptableName(cleanName)) return;
    const key = normalizeActorKey(cleanName);
    if (!merged.has(key)) merged.set(key, { name: cleanName, suggested_role: 'Support Team' });
  });

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Role mapping helpers ──────────────────────────────────────────────────────
function parseActorRoleMap(mappingString) {
  const str = mappingString || (typeof activeMappingString !== 'undefined' ? activeMappingString : '');
  const actorMap = {};
  String(str || '').split('\n').filter(Boolean).forEach(line => {
    const match = line.match(/^- (.*?): (.*)$/);
    if (match) actorMap[match[1].trim()] = match[2].trim();
  });
  return actorMap;
}

function resolveMappedActor(actorText, actorMap) {
  if (!actorText || !actorMap) return null;
  const text = normalizeActorKey(actorText);
  if (!text) return null;
  const actorNames = Object.keys(actorMap);
  const exact = actorNames.find(name => normalizeActorKey(name) === text);
  if (exact) return { name: exact, role: actorMap[exact] };
  const partial = actorNames.find(name => text.includes(normalizeActorKey(name)) || normalizeActorKey(name).includes(text));
  if (partial) return { name: partial, role: actorMap[partial] };
  return null;
}

function findMappedActorInText(text, actorMap) {
  const content = normalizeActorKey(text);
  if (!content) return null;
  const matches = Object.keys(actorMap).filter(name => {
    const key = normalizeActorKey(name);
    return key && content.includes(key);
  });
  if (matches.length !== 1) return null;
  return { name: matches[0], role: actorMap[matches[0]] };
}

function normalizeTimelineActors(timeline, actorMap) {
  if (!Array.isArray(timeline)) return;
  const genericActor = /^(system|support|support team|service desk|resolver|agent|requestor|requester|user|caller|customer|business user|business team|leadership|tower lead)$/i;

  timeline.forEach(ev => {
    if (!ev) return;
    let mappedActor = resolveMappedActor(ev.actor, actorMap);

    if (!mappedActor && (!ev.actor || genericActor.test(String(ev.actor).trim()))) {
      mappedActor = findMappedActorInText(
        [ev.detailed_activity_summary, ev.message_summary, ev.action_description, ev.intent_reasoning].filter(Boolean).join(' '),
        actorMap
      );
    }

    if (mappedActor) {
      ev.actor = mappedActor.name;
      ev.actor_role = mappedActor.role || ev.actor_role || null;
    }
  });
}

// ── Sentiment highlight builder ───────────────────────────────────────────────
function getAllowedSentimentRoles() {
  const cfg = (window.CONFIG && window.CONFIG.role_sentiment_config) || {};
  return new Set(Object.keys(cfg).filter(role => cfg[role] === true));
}

function buildActorSentimentHighlights(timeline, actorMap) {
  if (!Array.isArray(timeline)) return [];
  const allowedRoles = getAllowedSentimentRoles();
  const highlights = [];
  const seen = new Set();

  timeline.forEach(ev => {
    if (!ev) return;
    const mappedActor = resolveMappedActor(ev.actor, actorMap);
    const actorName = mappedActor?.name || ev.actor;
    const actorRole = mappedActor?.role || ev.actor_role || null;
    if (!actorName || !actorRole || !allowedRoles.has(actorRole)) return;

    const detail = [ev.message_summary, ev.detailed_activity_summary, ev.action_description].filter(Boolean).join(' ');
    let tone = null;
    if      (ev.sentiment_flag === 'frustration') tone = 'upset';
    else if (ev.sentiment_flag === 'concern')     tone = 'concerned';
    else if (ev.sentiment_flag === 'escalation')  tone = 'escalating';
    else if (/\b(thank you|thanks|appreciate|works now|working again|resolved|issue fixed|looks good|great|perfect|danke|funktioniert|behoben|gelöst)\b/i.test(detail)) tone = 'happy';

    if (!tone) return;

    const evidence  = (ev.message_summary || ev.detailed_activity_summary || ev.action_description || '').trim();
    const signature = `${normalizeActorKey(actorName)}|${tone}|${normalizeActorKey(evidence).slice(0, 80)}`;
    if (seen.has(signature)) return;
    seen.add(signature);

    highlights.push({
      actor: actorName,
      role:  actorRole,
      tone,
      when:  [ev.date, ev.time].filter(Boolean).join(' '),
      evidence: evidence.slice(0, 220)
    });
  });

  return highlights;
}

// ── Role suggestion heuristic ─────────────────────────────────────────────────
function suggestRoleFromContext(name, fullText) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contextRegex = new RegExp(`.{0,150}${escapedName}.{0,150}`, 'gi');
  const matches = fullText.match(contextRegex) || [];
  const ctx = matches.join(' ').toLowerCase();

  // TIMA org-unit suffix heuristic: (DI MC ...) = business/manufacturing, (DI IT ...) = IT/support
  // Extract org unit from context: name followed by (ORG UNIT)
  const orgMatch = fullText.match(new RegExp(escapedName + '\\s*\\(([^)]+)\\)', 'i'));
  const orgUnit  = orgMatch ? orgMatch[1].toLowerCase() : '';

  if (/\b(affected|betroffene|caller|requestor|requester|melder|meldende)\b/.test(ctx))              return 'Affected Business User';
  if (/\b(reporting person|meldende person|reported by)\b/.test(ctx))                                return 'Affected Business User';
  // TIMA-specific: DI MC = business manufacturing, DI SC = supply chain, DI FA = factory automation
  if (/\bdi\s+(mc|sc|fa|cs|sw|pa|oc|mf)\b/.test(orgUnit))                                           return 'Affected Business User';
  if (/\b(tower\s*lead|leadership|management|leitung|abteilungsleiter|head of)\b/.test(ctx))         return 'Leadership / Tower Lead';
  if (/\b(escalat|eskalat)\b/.test(ctx))                                                              return 'Escalation Owner';
  if (/\b(service\s*delivery|sdm|service\s*manager)\b/.test(ctx))                                    return 'Service Delivery Manager';
  if (/\b(major\s*incident|mim)\b/.test(ctx))                                                         return 'Major Incident Manager';
  if (/\b(problem\s*manager)\b/.test(ctx))                                                            return 'Problem Manager';
  if (/\b(service\s*desk|1st\s*level|first\s*level|helpdesk)\b/.test(ctx))                          return 'Service Desk Agent';
  if (/\b(resolver|resolved|2nd\s*level|3rd\s*level|engineer|developer|admin|technician|ops)\b/.test(ctx)) return 'Support Team';
  // TIMA-specific: DI IT = IT department = resolver/support
  if (/\bdi\s+it\b/.test(orgUnit))                                                                    return 'Support Team';
  return 'Support Team';
}

// ── Run pre-analysis (populates role-mapping wizard) ─────────────────────────
async function runPreAnalysis() {
  const modelKey = getCurrentModelKey();
  if (!modelKey) { showError('No AI model configured. Click "Configure" to set a default model.'); return; }

  setStep('mapping', 'active');
  document.getElementById('role-mapping-panel').style.display = 'none';
  document.getElementById('results-area').style.display = 'none';

  try {
    // Client-side extraction — zero LLM tokens
    // TIMA pdfminer splits every field: label alone on line N, blank, value on line N+2
    // COMM blocks: COMM-XXXXX → blank → sender name (no field label prefix)
    // EMAIL blocks: always tima.it system notifications — skip entirely
    const lines = (pdfText || '').split('\n');
    const scanChunks = [];

    // ── Phase 1: Header actor fields (split-line pdfminer format) ──────────────
    const HEADER_ACTOR_RE = /^(Responsible Person|Reporting Person|Affected Person|Caller|Contact Person|Verantwortliche Person|Meldende Person|Betroffene Person)\s*:?\s*$/i;
    let awaitingLabel = null;

    lines.slice(0, 200).forEach(line => {
      const trimmed = line.trim();
      if (awaitingLabel) {
        if (trimmed) {
          // Value line — combine with its label so actorTaggedLine can match
          scanChunks.push(awaitingLabel + ' ' + trimmed);
          awaitingLabel = null;
        }
        return;
      }
      if (HEADER_ACTOR_RE.test(trimmed)) {
        // Pure label line; value is on the next non-empty line
        awaitingLabel = trimmed.endsWith(':') ? trimmed : trimmed + ':';
      } else {
        // Also handle same-line format: "Reporting Person: John Smith"
        const m = trimmed.match(/^(Responsible Person|Reporting Person|Affected Person|Caller|Contact Person)\s*:\s*(.+)/i);
        if (m) scanChunks.push(m[1] + ': ' + m[2]);
      }
    });

    // ── Phase 2: COMM block sender extraction ──────────────────────────────────
    // Handles multiple PDF extraction formats from PDF.js and pdfminer:
    //
    //   Format A — PDF.js inline (all cells same row, same Y):
    //     "COMM-2724479 Schreiber Pascal (DI IT ERP DE EWM 1) 24.11.2025 07:59:21 Normal"
    //
    //   Format B — PDF.js fragmented ID (hyphen causes text item split):
    //     "COMM- 2724479 Schreiber Pascal (DI IT ERP DE EWM 1) 24.11.2025 07:59:21 Normal"
    //
    //   Format C — pdfminer split-line (each cell on its own line):
    //     "COMM-2724479\n\nSchreiber Pascal (DI IT ERP DE EWM 1)\n..."
    //
    //   Format D — Y-tolerance split (date/priority cell at different Y than COMM-ID):
    //     "COMM-2724479\n23.09.2025 11:55:39\nNormal\nSchreiber Pascal (DI IT ERP DE EWM 1)"
    //
    //   Format E — date cell before COMM-ID (date has higher Y coordinate):
    //     "23.09.2025 11:55:39 COMM-2724479 Schreiber Pascal (DI IT ERP DE EWM 1) Normal"
    //
    // EMAIL blocks are always tima.it system notifications — skip entirely.
    let prevWasCommId = false;
    let commSkipCount = 0;  // lines skipped since COMM-ID seen (date/priority lines)

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (/^EMAIL-\d+/i.test(trimmed)) { prevWasCommId = false; commSkipCount = 0; return; }

      // Match COMM-ID at start of line (Format A/B/C): allow optional space after hyphen
      if (/^COMM-\s*\d+/i.test(trimmed)) {
        prevWasCommId = false; commSkipCount = 0;
        // Format A/B: sender follows on same line after the COMM-ID
        const m = trimmed.match(/^COMM-\s*\d+\s+(.+)/i);
        if (m && m[1]) {
          let candidate = m[1]
            .replace(/^\d{2}\.\d{2}\.\d{4}[\s\S]*$/, '')   // strip if LEADING date (PDF puts date col first)
            .replace(/^\d{2}:\d{2}:\d{2}[\s\S]*$/, '')     // strip if LEADING time
            .replace(/\s+\d{2}\.\d{2}\.\d{4}[\s\S]*$/, '') // strip trailing date + rest
            .replace(/\s+(normal|high|critical|low|medium|urgent)\s*$/i, '')
            .trim();
          // Only accept if candidate actually contains letter characters (is a name, not metadata)
          if (candidate && candidate.length > 3 && /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(candidate)) {
            scanChunks.push('comment by: ' + candidate);
            return;
          }
        }
        // Candidate was empty or pure metadata — sender is on a following line (Format C/D)
        prevWasCommId = true;
        commSkipCount = 0;
        return;
      }

      // Format E: COMM-ID appears mid-line (date/other content came first due to Y ordering)
      if (!prevWasCommId) {
        const embedded = trimmed.match(/COMM-\s*\d+\s+(.+)/i);
        if (embedded && embedded[1]) {
          let candidate = embedded[1]
            .replace(/^\d{2}\.\d{2}\.\d{4}[\s\S]*$/, '')
            .replace(/^\d{2}:\d{2}:\d{2}[\s\S]*$/, '')
            .replace(/\s+\d{2}\.\d{2}\.\d{4}[\s\S]*$/, '')
            .replace(/\s+(normal|high|critical|low|medium|urgent)\s*$/i, '')
            .trim();
          if (candidate && candidate.length > 3 && /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(candidate)) {
            scanChunks.push('comment by: ' + candidate);
          }
          return;
        }
      }

      // Format C/D fallback: looking for sender on lines after COMM-ID
      if (prevWasCommId) {
        // Page-break markers are transparent — skip without resetting the search
        if (/^---\s*PAGE\s*BREAK\s*---/.test(trimmed)) return;

        const isDateLine     = /^\d{2}\.\d{2}\.\d{4}/.test(trimmed);
        const isPriorityLine = /^(normal|high|critical|low|medium|urgent)\s*$/i.test(trimmed);
        // Field labels that appear between COMM-ID and sender in OmniTracker exports
        const isFieldLabel   = /^(to-?recipients?|from|subject|description|number|sender|created|priority|status|type|category|impact|urgency|cc|bcc|date|time|von|an|betreff|erstellt|priorit[äa]t|kategorie)\s*:?\s*$/i.test(trimmed);

        // Skip non-sender lines without limit — keep scanning until a real name appears
        if (isDateLine || isPriorityLine || isFieldLabel) {
          commSkipCount++;
          return;  // prevWasCommId stays true — next line is still a candidate
        }

        prevWasCommId = false; commSkipCount = 0;
        if (!isDateLine && !isPriorityLine && !isFieldLabel) {
          scanChunks.push('comment by: ' + trimmed);
        }
      }
    });

    const scanText = scanChunks.join('\n');

    const regexCandidates = extractActorCandidatesFromText(scanText);
    const clientUsers = regexCandidates
      .filter(name => isStrictHumanActor(name))
      .map(name => ({ name, suggested_role: suggestRoleFromContext(name, scanText) }));

    extractedUsers = mergeExtractedUsers(clientUsers, []);

    let mapHtml = '';
    if (extractedUsers.length === 0) {
      mapHtml = '<div style="color:var(--text-muted);font-style:italic;">No distinct human users identified in the text.</div>';
    } else {
      extractedUsers.forEach((u, i) => {
        const opts = getRoleOptions().map(r =>
          `<option value="${r}" ${r.toLowerCase() === (u.suggested_role || '').toLowerCase() ? 'selected' : ''}>${r}</option>`
        ).join('');
        mapHtml += `<div class="role-map-row">
          <div class="role-map-name">👤 ${esc(u.name)}</div>
          <select id="user-role-${i}" class="role-map-select">${opts}</select>
        </div>`;
      });
    }

    document.getElementById('role-mapping-list').innerHTML = mapHtml;
    setStep('mapping', 'done');
    document.getElementById('role-mapping-panel').style.display = 'block';

  } catch (err) {
    showError('Failed to extract roles: ' + err.message);
    setStep('mapping', 'done');
    document.getElementById('role-mapping-panel').style.display = 'block';
  }
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.normalizeActorKey                = normalizeActorKey;
window.toTitleCaseName                  = toTitleCaseName;
window.looksLikeSingleFirstName         = looksLikeSingleFirstName;
window.looksLikeHumanActorName          = looksLikeHumanActorName;
window.isStrictHumanActor               = isStrictHumanActor;
window.extractNameFromActorChunk        = extractNameFromActorChunk;
window.extractActorCandidatesFromText   = extractActorCandidatesFromText;
window.mergeExtractedUsers              = mergeExtractedUsers;
window.parseActorRoleMap                = parseActorRoleMap;
window.resolveMappedActor               = resolveMappedActor;
window.findMappedActorInText            = findMappedActorInText;
window.normalizeTimelineActors          = normalizeTimelineActors;
window.getAllowedSentimentRoles         = getAllowedSentimentRoles;
window.buildActorSentimentHighlights    = buildActorSentimentHighlights;
window.suggestRoleFromContext           = suggestRoleFromContext;
window.runPreAnalysis                   = runPreAnalysis;
