/**
 * proxy.js — Hardened local CORS proxy for Anthropic API
 *
 * WHAT IT DOES:
 *   Browsers cannot call api.anthropic.com directly (CORS policy).
 *   This proxy runs entirely on your own machine (127.0.0.1 only),
 *   receives requests from the ITSM app, validates them, then forwards
 *   them to Anthropic — server-to-server, where CORS does not apply.
 *
 * WHAT IT DOES NOT DO:
 *   • Does not execute any code from the request body
 *   • Does not read, write, or delete any files
 *   • Does not accept connections from other machines (loopback only)
 *   • Does not log your API key (masked in all output)
 *   • Does not modify the request body — forwards it as received
 *   • Does not store or cache anything
 *
 * SECURITY CONTROLS:
 *   • Binds only to 127.0.0.1 (not reachable from network)
 *   • Validates Origin header — only accepts requests from localhost / file://
 *   • Validates path — only /v1/messages is accepted
 *   • Validates Content-Type — must be application/json
 *   • Enforces request body size limit (MAX_BODY_BYTES)
 *   • Validates JSON structure — must have model + messages fields
 *   • Rate-limits per client (MAX_RPM requests per minute)
 *   • Destination is hardcoded — cannot be redirected to another host
 *
 * USAGE:
 *   node proxy.js
 *
 *   In the app → Configure Models → Claude (Local Proxy):
 *     Endpoint  : http://localhost:3001/v1/messages
 *     API Key   : your sk-ant-... Anthropic key
 *     Model ID  : claude-sonnet-4-6
 *
 * Requires: Node.js only — zero npm dependencies.
 */

'use strict';

const http  = require('http');
const https = require('https');

// ── Configuration ──────────────────────────────────────────────────────────
const PORT          = 3001;
const MAX_BODY_BYTES = 2 * 1024 * 1024;   // 2 MB — generous for long ITSM tickets
const MAX_RPM        = 30;                 // max requests per minute per client

// Hardcoded upstream — cannot be changed via the request
const UPSTREAM = {
  hostname: 'api.anthropic.com',
  port:     443,
  path:     '/v1/messages',
};

// Origins that are allowed to call this proxy.
// 'null' is the origin for file:// pages; localhost variants for dev servers.
const ALLOWED_ORIGINS = new Set([
  'null',
  'http://localhost',
  'http://localhost:3001',
  'http://127.0.0.1',
  'http://127.0.0.1:3001',
]);

// ── Rate limiter (simple sliding-window per IP) ────────────────────────────
const rateBuckets = new Map();   // ip → [timestamp, ...]

function isRateLimited(ip) {
  const now   = Date.now();
  const window = 60_000;         // 1 minute
  const times  = (rateBuckets.get(ip) || []).filter(t => now - t < window);
  times.push(now);
  rateBuckets.set(ip, times);
  return times.length > MAX_RPM;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function maskKey(key) {
  if (!key || key.length < 8) return '[not provided]';
  return key.slice(0, 7) + '…' + key.slice(-4);
}

function timestamp() {
  return new Date().toISOString();
}

function sendError(res, status, message) {
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({ error: { message, status } }));
}

function setCORSHeaders(res, origin) {
  // Echo back the specific allowed origin rather than wildcard
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'null';
  res.setHeader('Access-Control-Allow-Origin',  allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-beta');
  res.setHeader('Access-Control-Max-Age',        '3600');
  res.setHeader('Vary', 'Origin');
}

// ── Request handler ────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const origin = req.headers['origin'] || 'null';
  setCORSHeaders(res, origin);

  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Origin check — block requests not from the ITSM app ──
  if (!ALLOWED_ORIGINS.has(origin)) {
    console.warn(`[${timestamp()}] Rejected — disallowed origin: ${origin}`);
    sendError(res, 403, `Origin "${origin}" is not allowed.`);
    return;
  }

  // ── Method check ──
  if (req.method !== 'POST') {
    sendError(res, 405, 'Only POST requests are accepted.');
    return;
  }

  // ── Path check — only /v1/messages ──
  if (req.url !== '/v1/messages') {
    console.warn(`[${timestamp()}] Rejected — invalid path: ${req.url}`);
    sendError(res, 404, `Path "${req.url}" is not supported. Use /v1/messages.`);
    return;
  }

  // ── Content-Type check ──
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('application/json')) {
    sendError(res, 415, 'Content-Type must be application/json.');
    return;
  }

  // ── API key presence check (never log the full key) ──
  const apiKey = (req.headers['x-api-key'] || '').trim();
  if (!apiKey) {
    sendError(res, 401, 'Missing x-api-key header.');
    return;
  }

  // ── Rate limit ──
  const clientIP = req.socket.remoteAddress || '127.0.0.1';
  if (isRateLimited(clientIP)) {
    console.warn(`[${timestamp()}] Rate limited: ${clientIP}`);
    sendError(res, 429, `Too many requests. Limit: ${MAX_RPM} per minute.`);
    return;
  }

  // ── Collect body with size cap ──
  const chunks = [];
  let totalSize = 0;

  req.on('data', chunk => {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY_BYTES) {
      req.destroy();
      sendError(res, 413, `Request body exceeds ${MAX_BODY_BYTES / 1024}KB limit.`);
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    const body = Buffer.concat(chunks);

    // ── JSON structure validation ──
    let parsed;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      sendError(res, 400, 'Request body is not valid JSON.');
      return;
    }

    if (!parsed.model || !Array.isArray(parsed.messages)) {
      sendError(res, 400, 'Request body must include "model" (string) and "messages" (array).');
      return;
    }

    // Audit log — model name only, never the key or full body
    console.log(`[${timestamp()}] → Anthropic  model=${parsed.model}  key=${maskKey(apiKey)}`);

    // ── Forward to Anthropic (hardcoded destination) ──
    const upstreamHeaders = {
      'Content-Type':      'application/json',
      'Content-Length':    body.length,
      'x-api-key':         apiKey,
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
    };
    if (req.headers['anthropic-beta']) {
      upstreamHeaders['anthropic-beta'] = req.headers['anthropic-beta'];
    }

    const proxyReq = https.request(
      { ...UPSTREAM, method: 'POST', headers: upstreamHeaders },
      proxyRes => {
        console.log(`[${timestamp()}] ← Anthropic  status=${proxyRes.statusCode}  model=${parsed.model}`);
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'null',
        });
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', err => {
      console.error(`[${timestamp()}] Upstream error: ${err.message}`);
      sendError(res, 502, 'Could not reach Anthropic API: ' + err.message);
    });

    proxyReq.write(body);
    proxyReq.end();
  });

  req.on('error', err => {
    console.error(`[${timestamp()}] Request error: ${err.message}`);
    sendError(res, 400, err.message);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ✅  Anthropic CORS proxy — RUNNING');
  console.log('');
  console.log('  Listening  : http://127.0.0.1:' + PORT + '  (loopback only — not network-accessible)');
  console.log('  Forwards   : api.anthropic.com/v1/messages  (hardcoded, cannot be changed by requests)');
  console.log('  Max body   : ' + (MAX_BODY_BYTES / 1024) + ' KB');
  console.log('  Rate limit : ' + MAX_RPM + ' requests / minute');
  console.log('');
  console.log('  In the app → Configure Models → Claude (Local Proxy):');
  console.log('    Endpoint  : http://localhost:' + PORT + '/v1/messages');
  console.log('    API Key   : your sk-ant-... Anthropic key');
  console.log('    Model ID  : claude-sonnet-4-6');
  console.log('');
  console.log('  Ctrl+C to stop.');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ❌  Port ${PORT} is already in use.`);
    console.error(`  Kill the other process or edit PORT at the top of proxy.js.\n`);
  } else {
    console.error(`\n  ❌  ${err.message}\n`);
  }
  process.exit(1);
});
