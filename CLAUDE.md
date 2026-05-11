# ITSM Ticket Intelligence Hub — CLAUDE.md

> Developer reference for Claude Code and contributors.

---

## Project Purpose

A **self-contained web application** that ingests OmniTracker ITSM ticket PDF exports and runs a multi-agent AI analysis pipeline producing three specialist views:

| View | Audience | Output |
|------|----------|--------|
| IT Service Manager | Service/Operations managers | Sentiment analysis, customer experience gaps, improvement recommendations |
| Extracted Content Review | Reviewers / Auditors | Structured timeline, communications, work notes, raw pages |
| Enterprise Architect / SME | Technical staff | Root cause, affected systems, tech stack, architectural observations |

---

## Architecture: Multi-Agent, Multi-Skills Pipeline

```
PDF Input (local file / URL / cloud storage)
        │
        ▼
┌─────────────────────────────────────────┐
│  core/pdf-processor.js                  │
│  • PDF.js text extraction               │
│  • Whitespace/boilerplate preprocessing  │
└─────────────────┬───────────────────────┘
                  │ pdfText (~50K tokens after preprocessing)
                  ▼
┌─────────────────────────────────────────┐
│  AGENT 1 — Actor Extractor              │
│  agents/actor-agent.js                  │
│  • Client-side regex (zero LLM tokens)  │
│  • Scans header + COMM blocks only      │
│  • Suggests roles via context heuristics│
└─────────────────┬───────────────────────┘
                  │ Human-in-the-Loop: user confirms role map
                  ▼
┌─────────────────────────────────────────┐
│  AGENT 2 — Content Reviewer             │
│  agents/review-agent.js                 │
│  SKILL: skills/content-reviewer/        │
│  SKILL: skills/itsm-expert/             │
│  • Full PDF → structured JSON           │
│  • Timeline, communications, metadata   │
│  • Front-end sentiment enforcement      │
└─────────────────┬───────────────────────┘
                  │ reviewData JSON (~5K tokens)
          ┌───────┴───────┐
          ▼               ▼
┌──────────────┐   ┌──────────────────┐
│  AGENT 3     │   │  AGENT 4         │
│  SM Analyst  │   │  EA Analyst      │
│  agents/sm-  │   │  agents/ea-      │
│  agent.js    │   │  agent.js        │
│  SKILL:      │   │  SKILL:          │
│  service-    │   │  enterprise-     │
│  manager/    │   │  architect/      │
│  itsm-expert/│   │  itsm-expert/    │
└──────┬───────┘   └────────┬─────────┘
       │ parallel Promise.all│
       └─────────┬───────────┘
                 ▼
        3-tab results rendered
```

### Token Budget (per analysis)

| Step | Input | Optimization |
|------|-------|-------------|
| Actor extraction | ~0 (regex only) | No LLM call |
| Content review (Agent 2) | ~50K (preprocessed PDF) | Whitespace stripped |
| SM analysis (Agent 3) | ~5–6K (review JSON) | Fed from Agent 2 output |
| EA analysis (Agent 4) | ~5–6K (review JSON) | Fed from Agent 2 output |
| **Total** | **~60–62K** | **~73% vs naive 232K** |

Agents 3 and 4 run in **parallel** (`Promise.all`) — wall-clock time = max(SM, EA).

---

## Directory Structure

```
CSATNextV3/
├── index.html                    ← App shell (HTML + inline CSS + <script> loaders)
├── CLAUDE.md                     ← This file
│
├── core/                         ← Framework modules (no domain logic)
│   ├── security.js               ← ClickFix/prompt-injection guard
│   ├── utils.js                  ← safeParseJSON, isMissing, esc, gv
│   ├── token-tracker.js          ← Per-model token usage tracking
│   ├── config-manager.js         ← 3-tier config (localStorage > file > hardcoded)
│   ├── pdf-processor.js          ← PDF.js extraction + preprocessing + truncation
│   └── llm-router.js             ← Unified LLM API (Anthropic + OpenAI-compat)
│
├── agents/                       ← AI pipeline agents
│   ├── orchestrator.js           ← Pipeline coordination (runPipeline, runAIPipeline)
│   ├── actor-agent.js            ← Agent 1: client-side actor/role extraction
│   ├── review-agent.js           ← Agent 2: Content review & structured extraction
│   ├── sm-agent.js               ← Agent 3: Service Manager analysis
│   └── ea-agent.js               ← Agent 4: Enterprise Architect analysis
│
├── skills/                       ← Skill prompt library (physical .md files)
│   ├── skill-registry.js         ← Loads SKILL.md files + manages overrides
│   ├── itsm-expert/
│   │   └── SKILL.md              ← Foundation: ITIL, constraints, PII rules (all agents)
│   ├── content-reviewer/
│   │   └── SKILL.md              ← OmniTracker extraction schema + parsing rules
│   ├── service-manager/
│   │   └── SKILL.md              ← SM analysis: sentiment rules, output schema
│   └── enterprise-architect/
│       └── SKILL.md              ← EA framework: 5 dimensions, pattern taxonomy
│
├── ui/                           ← Rendering modules (DOM → HTML string builders)
│   ├── render-helpers.js         ← makeCard, esc, isMissing, renderBullets, etc.
│   ├── render-review.js          ← Extracted Content Review tab
│   ├── render-sm.js              ← IT Service Manager tab
│   ├── render-ea.js              ← Enterprise Architect tab
│   └── admin-panel.js            ← Admin overlay: models, roles, skills
│
├── config/
│   ├── config.js                 ← API keys + model endpoints (edit this locally)
│   ├── admin-config.js           ← Persisted roles, skill overrides, model overrides
│   └── models/
│       └── defaults.json         ← Default model definitions (no API keys)
│
├── assets/
│   └── css/
│       └── main.css              ← All application styles
│
├── proxy/
│   └── proxy.js                  ← Local CORS proxy for Anthropic API (Node.js, zero deps)
│
└── data/                         ← Sample data (git-ignored for PII, kept for dev)
    └── samples/
        └── .gitkeep
```

---

## Skills System

Skills are **physical Markdown files** (`SKILL.md`) that define the AI persona, constraints, and domain knowledge injected into each agent's system prompt.

### Loading Priority (3-tier)

```
1. localStorage (SKILL_ea / SKILL_sm / SKILL_itsm)   ← Admin panel override (hot)
2. skills/*/SKILL.md via fetch()                      ← Physical file (portable)
3. Hardcoded JS constant (DEFAULT_*_SKILL)            ← Fallback (always available)
```

The `skills/skill-registry.js` module manages this loading at startup:
```js
SkillRegistry.load('ea')     // → loads skills/enterprise-architect/SKILL.md
SkillRegistry.load('sm')     // → loads skills/service-manager/SKILL.md
SkillRegistry.load('itsm')   // → loads skills/itsm-expert/SKILL.md
SkillRegistry.load('review') // → loads skills/content-reviewer/SKILL.md
```

### Skill Composition (merged at runtime)

```
Agent 2 prompt = content-reviewer/SKILL.md  + SECURITY_CONSTRAINT
Agent 3 prompt = service-manager/SKILL.md   + itsm-expert/SKILL.md + SECURITY_CONSTRAINT
Agent 4 prompt = enterprise-architect/SKILL.md + itsm-expert/SKILL.md + SECURITY_CONSTRAINT
```

**To update a skill**: edit the appropriate `SKILL.md` file (no code changes needed).
**To override for one session**: use Admin → SKILL Prompts tab (stored in localStorage).
**To permanently override**: export from Admin → replace `admin-config.js`.

---

## Data Sources

The application is built to work across three deployment modes with physical files as the source of truth:

### Local Machine
- **PDFs**: Drag-and-drop or file picker (`<input type="file">`)
- **Config**: `config/config.js` loaded as `<script src>` tag
- **Skills**: `fetch('./skills/*/SKILL.md')` — works with a local web server (`npx serve .`)
- **State**: `localStorage` for model config + admin overrides

### Hosted Web Server / Cloud CDN
- **PDFs**: Upload via file picker; optionally load by URL (fetch)
- **Config**: `config.js` served as static asset; or environment injection
- **Skills**: `fetch()` against CDN path — no change needed
- **State**: Same localStorage model

### Notes on `file://` protocol
When opening `index.html` directly from the filesystem (no web server), `fetch()` calls to local `.md` files will fail due to browser security policies. The skill registry falls back to the hardcoded JS constants automatically. **Recommended**: run `npx serve .` or `python -m http.server 8080` for local development.

---

## Configuration System (3-Tier)

```
Priority 1 (highest): localStorage
  Keys: ITSM_MODELS_CONFIG, ITSM_ROLES_CONFIG_V2, SKILL_ea, SKILL_sm, SKILL_itsm
  Source: Admin panel changes, saved at runtime

Priority 2: Physical config files
  config/config.js        → window.CONFIG   (API keys, endpoints)
  config/admin-config.js  → window.ADMIN_CONFIG (roles, model list, skill overrides)
  Loaded as <script> tags — survive browser resets, portable across machines

Priority 3: Hardcoded JS defaults
  DEFAULT_ITSM_SKILL, DEFAULT_EA_SKILL, DEFAULT_SM_SKILL, etc.
  Always available as last resort
```

**To reset to config file values**: Admin → Reset to config.js Defaults  
**To export current state to file**: Admin → Export Config → replace `config/admin-config.js`

---

## Security Architecture

### Client-Side Guards
- **ClickFix / Prompt Injection Guard** (`core/security.js`): `SEC_PATTERNS` array + `secDeepScan()` scans every AI output for shell execution patterns before rendering
- **Clipboard protection**: `doCopy()` runs the security scanner before writing to clipboard
- **HTML escaping**: All AI-generated content passes through `esc()` before DOM insertion (no `innerHTML` with raw AI text)

### Proxy Hardening (`proxy/proxy.js`)
- Binds to `127.0.0.1` only — not network-accessible
- Destination hardcoded to `api.anthropic.com/v1/messages`
- Validates Origin header (localhost/file:// only)
- Rate-limits to 30 req/min
- Request body size cap (2MB)
- API key masked in all log output

### Content Security Policy
```
default-src 'none'
script-src: self + cdnjs + jsdelivr + 'unsafe-inline'
connect-src: https: (all HTTPS endpoints allowed for multi-model support)
```

---

## LLM Routing (`core/llm-router.js`)

`callLLM(endpointConf, apiKey, text, systemPrompt, userMsgPrefix)` auto-detects format:

| Condition | Format Used |
|-----------|-------------|
| URL contains `anthropic.com` | Anthropic Messages API (`system` + `messages`) |
| All other URLs | OpenAI-compatible (`messages` array with system role) |

Supports: OpenAI, Anthropic (via proxy or direct), GLM-5 (ZhipuAI), Qwen (DashScope), any OpenAI-compatible endpoint.

---

## Sentiment Enforcement

Sentiment flags (`escalation` | `frustration` | `concern`) are **business-side only**.

**Enforcement is dual-layer:**
1. **Prompt-level**: Role mapping injected into every LLM call with explicit ALLOW/DENY lists
2. **Client-side filter**: Post-processing strip in `runAIPipeline()` removes any hallucinated sentiment from resolver-side roles

**Role configuration**: Admin → ITSM Roles tab. `sentiment: true` = business-side (flags allowed). `sentiment: false` = resolver-side (flags always stripped).

---

## Development Guide

### Prerequisites
- Browser: Chrome 90+ / Edge 90+ / Firefox 88+
- Node.js: only needed for `proxy/proxy.js` (zero npm deps)
- Local server recommended: `npx serve .` from project root

### Running Locally
```bash
# Option A: Python (no install)
python -m http.server 8080
# then open http://localhost:8080

# Option B: Node serve (no install beyond Node)
npx serve .

# For Anthropic API (needs proxy):
node proxy/proxy.js
# configure model endpoint: http://localhost:3001/v1/messages
```

### Adding a New AI Model
1. Admin → AI Models → + Add New Model
2. Fill in: Label, Model ID, Endpoint URL, API Key
3. Set as Default if desired
4. Or: edit `config/config.js` → `ENDPOINTS` object

### Adding a New SKILL
1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter
2. Register in `skills/skill-registry.js`: add path + fallback constant
3. Wire into an agent's `buildPrompt()` method

### Modifying Analysis Logic
- **Actor extraction heuristics**: `agents/actor-agent.js` → `suggestRoleFromContext()`
- **Review/Timeline extraction**: `skills/content-reviewer/SKILL.md` (prompt) + `agents/review-agent.js`
- **SM analysis**: `skills/service-manager/SKILL.md` (prompt) + `agents/sm-agent.js`
- **EA analysis**: `skills/enterprise-architect/SKILL.md` (prompt) + `agents/ea-agent.js`
- **Rendering**: `ui/render-*.js` files

---

## File Loading Order (index.html script tags)

```html
<!-- External deps (CDN) -->
<script src="pdf.js"></script>
<script src="mermaid.js"></script>

<!-- App config (physical files) -->
<script src="config/config.js"></script>
<script src="config/admin-config.js"></script>

<!-- Core framework -->
<script src="core/security.js"></script>
<script src="core/utils.js"></script>
<script src="core/token-tracker.js"></script>
<script src="core/config-manager.js"></script>
<script src="core/pdf-processor.js"></script>
<script src="core/llm-router.js"></script>

<!-- Skills (fetched async at startup) -->
<script src="skills/skill-registry.js"></script>

<!-- Agents -->
<script src="agents/actor-agent.js"></script>
<script src="agents/review-agent.js"></script>
<script src="agents/sm-agent.js"></script>
<script src="agents/ea-agent.js"></script>
<script src="agents/orchestrator.js"></script>

<!-- UI Renderers -->
<script src="ui/render-helpers.js"></script>
<script src="ui/render-review.js"></script>
<script src="ui/render-sm.js"></script>
<script src="ui/render-ea.js"></script>
<script src="ui/admin-panel.js"></script>

<!-- Bootstrap (last — references all above) -->
<script src="core/app.js"></script>
```

---

## Known Limitations & Future Improvements

| Item | Status | Notes |
|------|--------|-------|
| Mermaid.js loaded but unused | Low priority | Card-based timeline replaced it |
| `file://` protocol: SKILL.md fetch fails | By design | Falls back to JS constants |
| Single-ticket analysis only | Planned | Batch mode for multiple PDFs |
| No PDF text search | Planned | Full-text search in extracted content |
| German-language detection only | Works | Other languages possible via SKILL update |
| Proxy required for Anthropic (browser CORS) | Structural | Cloud deploy: use API gateway with CORS headers |

---

## Token Optimization History

| Version | Input Tokens | Savings |
|---------|-------------|---------|
| V1 — naive (4× raw PDF) | ~232K | baseline |
| V2 — JSON-fed SM+EA | ~128K | 45% |
| V3 — client-side actor extraction + JSON pipeline | ~60–62K | ~73% |

Current: all 4 optimizations implemented. No further low-hanging fruit without reducing Call 2 (full PDF is required for accurate extraction).
