// ═══════════════════════════════════════════════════════════════════════════════
// CORE/PDF-PROCESSOR.JS — PDF Text Extraction & Preprocessing
//
// Handles: PDF.js text extraction, whitespace preprocessing, actor-extraction
// truncation, and the DataSource abstraction for local/URL/cloud PDFs.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ── Extract text from a single PDF page's items ───────────────────────────────
// Reconstructs reading order using x/y coordinates from PDF.js text items.
function extractPageText(items) {
  const rows = [];
  items
    .filter(item => item.str && item.str.trim())
    .map(item => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
    .sort((a, b) => Math.abs(b.y - a.y) > 5 ? b.y - a.y : a.x - b.x)
    .forEach(item => {
      let row = rows.find(r => Math.abs(r.y - item.y) <= 5);
      if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
      row.items.push(item);
    });

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(i => i.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// ── Preprocess PDF text to reduce token count ─────────────────────────────────
// Collapses whitespace, strips repeated OmniTracker page headers/footers.
// Typical savings: 5–15% of raw PDF token count.
function preprocessPdfText(rawText) {
  let t = rawText;
  t = t.replace(/(\r?\n\s*){3,}/g, '\n\n');
  t = t.replace(/^\s*Seite \d+ von \d+\s*$/gm, '');
  t = t.replace(/^\s*Page \d+ of \d+\s*$/gm, '');
  t = t.replace(/^\s*Gedruckt am:\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s*$/gm, '');
  t = t.replace(/^\s*Printed on:\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s*$/gm, '');
  t = t.replace(/ {2,}/g, ' ');
  t = t.split('\n').map(l => l.trim()).join('\n');
  t = t.replace(/(\r?\n\s*){3,}/g, '\n\n');
  // Fix PDF.js text fragmentation: "COMM- 2622044" → "COMM-2622044"
  // PDF.js sometimes splits the hyphen-number pair into separate text items;
  // rejoining them ensures the LLM recognises the block as a COMM/EMAIL entry.
  t = t.replace(/\bCOMM-\s+(\d+)\b/gi, 'COMM-$1');
  t = t.replace(/\bEMAIL-\s+(\d+)\b/gi, 'EMAIL-$1');
  return t.trim();
}

// ── Truncate PDF for actor extraction ────────────────────────────────────────
// Actors appear in: header/properties + COMM blocks.
// Skips the history/audit section but keeps everything once the COMM section starts.
// (Client-side regex is used instead of LLM in the current pipeline.)
function truncateForActorExtraction(fullText) {
  const lines = fullText.split('\n');
  const keepLines = [];
  let inHistory = false;
  const historyStart = /^\s*(Historie|History|Verlauf|Audit|Aktivitäten|Activities)\b/i;
  const commStart    = /^\s*(COMM-|Communication|Kommunikation)\b/i;

  for (const line of lines) {
    if (historyStart.test(line)) {
      inHistory = true;
      continue;
    }
    if (commStart.test(line)) {
      inHistory = false;
    }
    if (!inHistory) {
      keepLines.push(line);
    }
  }
  return keepLines.join('\n');
}

// ── DataSource: load PDF from a File object (local upload) ───────────────────
async function loadPdfFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(new Uint8Array(e.target.result));
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsArrayBuffer(file);
  });
}

// ── DataSource: load PDF from a URL (cloud / web server) ─────────────────────
async function loadPdfFromUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch PDF: HTTP ${resp.status} — ${url}`);
  const buffer = await resp.arrayBuffer();
  return new Uint8Array(buffer);
}

// ── Main extraction entrypoint ────────────────────────────────────────────────
// Accepts File object or URL string. Returns { text, pages }.
async function extractPdfText(source) {
  let pdfData;
  if (typeof source === 'string') {
    pdfData = await loadPdfFromUrl(source);
  } else if (source instanceof File || source instanceof Blob) {
    pdfData = await loadPdfFromFile(source);
  } else if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
    pdfData = source instanceof ArrayBuffer ? new Uint8Array(source) : source;
  } else {
    throw new Error('extractPdfText: unsupported source type');
  }

  const pdfDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const pages   = [];
  const allText = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page    = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const text    = extractPageText(content.items);
    pages.push({ page: i, text });
    allText.push(text);
  }

  const raw  = allText.join('\n\n--- PAGE BREAK ---\n\n');
  const text = preprocessPdfText(raw);
  return { text, pages };
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.extractPageText            = extractPageText;
window.preprocessPdfText          = preprocessPdfText;
window.truncateForActorExtraction = truncateForActorExtraction;
window.loadPdfFromFile            = loadPdfFromFile;
window.loadPdfFromUrl             = loadPdfFromUrl;
window.extractPdfText             = extractPdfText;
