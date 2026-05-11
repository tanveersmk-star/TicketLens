// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS/ORCHESTRATOR.JS — Pipeline Coordinator
//
// Coordinates the 4-agent analysis pipeline:
//   Stage 1 (zero tokens): Actor extraction (client-side regex)
//   Stage 2 (Human-in-Loop): User confirms role mapping
//   Stage 3 (LLM): Review agent — full PDF → structured JSON
//   Stage 4 (LLM, parallel): SM agent + EA agent — JSON → specialist views
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Step indicator helper ─────────────────────────────────────────────────────
function setStep(id, state) {
  const el = document.getElementById('step-' + id);
  if (!el) return;
  el.className = 'step-item' + (state ? ' ' + state : '');
  const spinnerStyle = state === 'active' ? 'inline-block' : 'none';
  const checkMark    = state === 'done' ? '✅ ' : '';
  const text = el.textContent.replace('✅ ', '').trim();
  el.innerHTML = `<span class="step-spinner" style="display:${spinnerStyle};"></span>${checkMark}${text}`;
}

// ── Main pipeline entry: file → PDF extraction → role mapping ────────────────
async function runPipeline(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showError('Please select a .pdf file.');
    return;
  }

  const activeModel = getActiveModel();
  if (!activeModel) {
    showError("No AI model configured. Click 'Configure Models' to set one up.");
    return;
  }
  if (!activeModel.apiKey || activeModel.apiKey.startsWith('YOUR_') || activeModel.apiKey.trim() === '') {
    showError(`No API key for "${activeModel.label}". Click 'Configure Models' → Edit to add your key.`);
    return;
  }

  currentFileName  = file.name;
  analysisComplete = false;

  document.getElementById('reanalyze-toolbar').style.display = 'none';
  hideError();
  document.getElementById('results-area').style.display = 'none';
  document.getElementById('role-mapping-panel').style.display = 'none';
  document.getElementById('progress-panel').style.display = 'block';

  setStep('extract', 'active'); setStep('mapping', ''); setStep('review', ''); setStep('sm', ''); setStep('arch', '');
  document.getElementById('file-status').innerHTML = `Reading <strong>${esc(file.name)}</strong>...`;

  try {
    const { text, pages } = await extractPdfText(file);
    pdfPages = pages;
    // Normalize split log identifiers caused by PDF extraction (e.g. "COMM- 12345" -> "COMM-12345")
    pdfText  = (text || '').replace(/\b(COMM|EMAIL)\s*-\s*(\d+)\b/gi, '$1-$2');

    setStep('extract', 'done');
    document.getElementById('file-status').innerHTML =
      `✅ <strong>${esc(file.name)}</strong> — ${pages.length} pages extracted`;

    // Security: scan extracted PDF text for prompt injection
    const pdfScanHits = secDeepScan({ pdfText });
    if (pdfScanHits.length > 0) showSecurityWarning(pdfScanHits, 'uploaded PDF content');

    await runPreAnalysis();
  } catch (err) {
    document.getElementById('progress-panel').style.display = 'none';
    showError(err.message);
  }
}

// ── Role confirmation → trigger full analysis ─────────────────────────────────
async function runFullAnalysis() {
  activeMappingString = '';
  extractedUsers.forEach((u, i) => {
    const sel = document.getElementById(`user-role-${i}`);
    const role = sel ? sel.value : (u.suggested_role || 'Support Team');
    activeMappingString += `- ${u.name}: ${role}\n`;
  });
  if (!activeMappingString) activeMappingString = 'No explicit human actors mapped.';

  document.getElementById('role-mapping-panel').style.display = 'none';
  await runAIPipeline();
}

// ── Full AI pipeline (Agents 2, 3, 4) ────────────────────────────────────────
async function runAIPipeline() {
  const modelKey = getCurrentModelKey();
  if (!modelKey) { showError('No AI model configured.'); return; }

  const allModels = getConfiguredModels();
  const modelDef  = allModels.find(m => m.id === modelKey);
  if (!modelDef) { showError(`Model "${modelKey}" not found in registry.`); return; }

  const apiKey      = modelDef.apiKey || '';
  const endpointConf = { url: modelDef.url, model: modelDef.modelId, registryId: modelDef.id };

  if (!apiKey || apiKey.startsWith('YOUR_') || apiKey.trim() === '') {
    showError(`No API key configured for "${modelDef.label}". Open Configure Models to add one.`);
    return;
  }

  hideError();
  document.getElementById('progress-panel').style.display = 'block';
  setStep('review', 'active'); setStep('sm', ''); setStep('arch', '');

  // ── Build mapping injection (role context for all agents) ──────────────────
  let sentimentRules = '';
  if (window.CONFIG && window.CONFIG.role_sentiment_config) {
    const cfg        = window.CONFIG.role_sentiment_config;
    const allowedRoles = Object.keys(cfg).filter(k => cfg[k] === true);
    const deniedRoles  = Object.keys(cfg).filter(k => cfg[k] === false);
    sentimentRules = `
[ABSOLUTE STRICT SENTIMENT ENFORCEMENT RULES]
You have been provided a list of humans and their user-validated roles below.
BEFORE setting 'sentiment_flag' on ANY timeline event, you MUST look up the actor's mapped role.
If the actor's role evaluates to ANY of these -> [${deniedRoles.join(', ')}] -> YOU MUST FORCIBLY SET sentiment_flag = null. NO EXCEPTIONS.
Do NOT flag system notifications, automated closure templates, or operational follow-ups as frustration.
Sentiment (frustration, escalation, concern) CAN ONLY BE SET if the actor's role is EXACTLY one of these -> [${allowedRoles.join(', ')}].
Violating this rule breaks the data contract.`;
  }

  // Build mandatory COMM manifest from preprocessed PDF text.
  // pdfText has already had "COMM- XXXXX" normalized to "COMM-XXXXX" by preprocessPdfText,
  // so this scan reliably finds every COMM block the PDF contains.
  const commIdsInPdf = [...new Set((pdfText || '').match(/\bCOMM-\d+\b/gi) || [])].sort();
  const commManifest = commIdsInPdf.length > 0
    ? `\n\nMANDATORY COMM BLOCKS — every one of the following MUST appear as exactly one comment_added entry in the timeline. Cross-check before finalising output:\n${commIdsInPdf.join(', ')}`
    : '';

  const mappingInjection = `

===========================================
CRITICAL ITSM TICKET ROLE IDENTIFICATION:
Use the following human-verified role mapping to interpret actions correctly.
${sentimentRules}
---
${activeMappingString}${commManifest}
===========================================
`;

  try {
    // Initial render while analysis runs
    if (typeof renderReviewTab === 'function') renderReviewTab(pdfText, pdfPages, null);
    document.getElementById('results-area').style.display = 'block';
    if (typeof switchTab === 'function') switchTab('review');

    // ── Agent 2: Content Review ────────────────────────────────────────────
    try {
      reviewTranslations = await runReviewAgent(endpointConf, apiKey, pdfText, mappingInjection);
    } catch (e) {
      reviewTranslations = null;
    }

    if (typeof renderReviewTab === 'function') renderReviewTab(pdfText, pdfPages, reviewTranslations);
    setStep('review', 'done');

    // ── Merge Agent 2's AI-discovered participants into the actor map ────────
    // Zero extra API calls — participants come from the review JSON already returned.
    // Any actor not already confirmed by the user is appended with the AI-suggested role.
    if (reviewTranslations && Array.isArray(reviewTranslations.participants)) {
      const existingKeys = new Set(
        Object.keys(parseActorRoleMap(activeMappingString)).map(k => normalizeActorKey(k))
      );
      reviewTranslations.participants.forEach(p => {
        if (!p || !p.name) return;
        const cleanName = extractNameFromActorChunk(p.name);
        if (!cleanName || !isStrictHumanActor(cleanName)) return;
        const key = normalizeActorKey(cleanName);
        if (!existingKeys.has(key)) {
          activeMappingString += `- ${cleanName}: ${p.suggested_role || 'Support Team'}\n`;
          existingKeys.add(key);
        }
      });
    }

    // Rebuild mapping injection with the enriched actor list for Agents 3 + 4
    let sentimentRulesEnriched = '';
    if (window.CONFIG && window.CONFIG.role_sentiment_config) {
      const cfg         = window.CONFIG.role_sentiment_config;
      const allowedRoles = Object.keys(cfg).filter(k => cfg[k] === true);
      const deniedRoles  = Object.keys(cfg).filter(k => cfg[k] === false);
      sentimentRulesEnriched = `
[ABSOLUTE STRICT SENTIMENT ENFORCEMENT RULES]
You have been provided a list of humans and their user-validated roles below.
BEFORE setting 'sentiment_flag' on ANY timeline event, you MUST look up the actor's mapped role.
If the actor's role evaluates to ANY of these -> [${deniedRoles.join(', ')}] -> YOU MUST FORCIBLY SET sentiment_flag = null. NO EXCEPTIONS.
Do NOT flag system notifications, automated closure templates, or operational follow-ups as frustration.
Sentiment (frustration, escalation, concern) CAN ONLY BE SET if the actor's role is EXACTLY one of these -> [${allowedRoles.join(', ')}].
Violating this rule breaks the data contract.`;
    }
    const enrichedMappingInjection = `

===========================================
CRITICAL ITSM TICKET ROLE IDENTIFICATION:
Use the following human-verified role mapping to interpret actions correctly.
${sentimentRulesEnriched}
---
${activeMappingString}
===========================================
`;

    // ── Agents 3 + 4: SM + EA in parallel ────────────────────────────────────
    setStep('sm',   'active');
    setStep('arch', 'active');

    const [smResult, eaResult] = await Promise.all([
      runSmAgent(endpointConf, apiKey, reviewTranslations, enrichedMappingInjection),
      runEaAgent(endpointConf, apiKey, reviewTranslations)
    ]);

    smData   = smResult;
    archData = eaResult;

    setStep('sm',   'done');
    setStep('arch', 'done');

    if (typeof renderSMTab   === 'function') renderSMTab(smData);
    if (typeof renderArchTab === 'function') renderArchTab(archData);
    if (typeof renderReviewTab === 'function') renderReviewTab(pdfText, pdfPages, reviewTranslations);

    document.getElementById('progress-panel').style.display = 'none';

    // Trigger mermaid rendering (best-effort)
    setTimeout(async () => {
      if (typeof mermaid !== 'undefined') {
        try { await mermaid.run({ querySelector: '.mermaid' }); } catch (_) {}
      }
    }, 300);

    analysisComplete = true;
    if (typeof updateReanalyzeToolbar === 'function') updateReanalyzeToolbar(modelKey);

  } catch (err) {
    document.getElementById('progress-panel').style.display = 'none';
    showError(err.message);
  }
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.setStep         = setStep;
window.runPipeline     = runPipeline;
window.runFullAnalysis = runFullAnalysis;
window.runAIPipeline   = runAIPipeline;
