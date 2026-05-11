// Quick test: simulate the new COMM/EMAIL scanning against the actual PDF text
const { execSync } = require('child_process');
const { execFileSync } = require('child_process');

// Extract PDF text via pdfminer
const pdfText = execSync('python -c "from pdfminer.high_level import extract_text; print(extract_text(\'I-25024791_anonymized.pdf\'))"', {encoding:'utf8'});

const lines = pdfText.split('\n');

// Simulate the new scanning logic
const commScanLines = [];
let prevWasCommId  = false;
let prevWasEmailId = false;

lines.forEach(line => {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (/^COMM-\d+$/.test(trimmed)) {
    prevWasCommId = true; prevWasEmailId = false; return;
  }
  if (/^EMAIL-\d+$/.test(trimmed)) {
    prevWasEmailId = true; prevWasCommId = false; return;
  }

  if (prevWasCommId) {
    prevWasCommId = false;
    commScanLines.push('comment by: ' + trimmed);
    return;
  }

  if (prevWasEmailId) {
    prevWasEmailId = false;
    if (!/(tima\.it@|noreply|no-reply|automated|ticketmanagement|@tima\.)/.test(trimmed)) {
      commScanLines.push('from: ' + trimmed);
    }
    return;
  }
});

console.log('=== COMM/EMAIL sender lines extracted ===');
commScanLines.forEach(l => console.log(' ', l));

// Simulate header extraction
const headerLines = lines.slice(0, 200);
const headerActors = [];
const actorTaggedLine = /\b(changed by|updated by|comment by|kommentar von|author|autor|bearbeiter|assigned to|owner|responsible person|verantwortlich(?:e person)?|resolved by|closed by|worked by|processed by|escalated by|approved by|reporting person|reported by|meldende person|affected person|betroffene person|caller|contact person|kontaktperson|requested by|submitted by|opened by|created by)\b\s*[:\-]\s*(.+)$/i;

[...headerLines, ...commScanLines].forEach(line => {
  const m = line.match(actorTaggedLine);
  if (m && m[2]) {
    // Strip org unit (...)
    const raw = m[2].replace(/\([^)]*\)/g, '').replace(/\s+/g,' ').trim();
    if (raw) headerActors.push(raw + '  [from field: ' + m[1] + ']');
  }
});

console.log('\n=== Actors identified by tagged-line pattern ===');
const seen = new Set();
headerActors.forEach(a => { if (!seen.has(a.split('[')[0].trim())) { seen.add(a.split('[')[0].trim()); console.log(' ', a); } });
