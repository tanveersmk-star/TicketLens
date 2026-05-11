// ═══════════════════════════════════════════════════════════════════════════════
// CORE/LLM-ROUTER.JS — Unified LLM API routing
//
// Supports: Anthropic Messages API + any OpenAI-compatible endpoint
// (OpenAI, GLM-5/ZhipuAI, Qwen/DashScope, local Ollama, etc.)
//
// Auto-detects format from endpoint URL:
//   api.anthropic.com → Anthropic format (system top-level, x-api-key header)
//   all others         → OpenAI format   (system message role, Bearer token)
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Format detection ──────────────────────────────────────────────────────────
function isAnthropicUrl(url) {
  return typeof url === 'string' && url.includes('anthropic.com');
}

// ── Core LLM call ─────────────────────────────────────────────────────────────
// endpointConf: { url, model, registryId }
// text:         the main content to analyze (PDF text or structured JSON)
// systemPrompt: the full system prompt string (skill + security constraint)
// userMsgPrefix: optional prefix for the user message (default: raw PDF framing)
async function callLLM(endpointConf, apiKey, text, systemPrompt, userMsgPrefix) {
  const safeKey   = (apiKey || '').trim();
  const isAnthropic = isAnthropicUrl(endpointConf.url);
  const prefix    = userMsgPrefix || 'Analyze this OmniTracker ITSM ticket export and return strict JSON';
  const userContent = `${prefix}:\n\n${text}`;

  const headers = { 'Content-Type': 'application/json' };
  let bodyObj;

  if (isAnthropic) {
    headers['x-api-key']         = safeKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    bodyObj = {
      model:       endpointConf.model,
      temperature: 0.1,
      max_tokens:  8192,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userContent }]
    };
  } else {
    headers['Authorization'] = `Bearer ${safeKey}`;
    bodyObj = {
      model:       endpointConf.model,
      temperature: 0.1,
      max_tokens:  8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent }
      ]
    };
  }

  let response;
  try {
    response = await fetch(endpointConf.url, { method: 'POST', headers, body: JSON.stringify(bodyObj) });
  } catch (fetchErr) {
    throw new Error(`Network error — could not reach ${endpointConf.url}.\n${fetchErr.message}`);
  }

  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    let errBody = {};
    try { errBody = JSON.parse(rawText); } catch (_) {}
    console.error('[callLLM] API error:', { status: response.status, model: endpointConf.model, body: errBody });

    const apiMsg =
      errBody?.error?.message ||
      errBody?.message ||
      (typeof errBody?.error === 'string' ? errBody.error : null) ||
      rawText.slice(0, 300) ||
      `HTTP ${response.status}`;

    const hint401 = response.status === 401
      ? '\n→ 401: check your API key and confirm it has access to the selected model.'
      : '';

    throw new Error(
      `[HTTP ${response.status}] ${apiMsg}${hint401}\n` +
      `→ Model: "${endpointConf.model}"  Endpoint: ${endpointConf.url}`
    );
  }

  const data = await response.json();

  // ── Record token usage (best-effort, never throws) ───────────────────────
  try {
    const u = data.usage;
    if (u) {
      const inputTok  = u.prompt_tokens  || u.input_tokens  || 0;
      const outputTok = u.completion_tokens || u.output_tokens || 0;
      recordTokenUsage(endpointConf.registryId || endpointConf.model, inputTok, outputTok);
    }
  } catch (_) {}

  // ── Extract text content from response ──────────────────────────────────
  if (isAnthropic) {
    const textBlock = (data.content || []).find(b => b.type === 'text');
    return textBlock?.text || '';
  }
  return data.choices[0].message.content;
}

// ── Key masking (for logs — never log full keys) ──────────────────────────────
function maskKey(key) {
  if (!key || key.length < 8) return '[not provided]';
  return key.slice(0, 7) + '…' + key.slice(-4);
}

function maskUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch (_) {
    return url.slice(0, 50);
  }
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.isAnthropicUrl = isAnthropicUrl;
window.callLLM        = callLLM;
window.maskKey        = maskKey;
window.maskUrl        = maskUrl;
