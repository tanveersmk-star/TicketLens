# ITSM Ticket Intelligence Hub — Summary

A self-contained single-page HTML application for analyzing OmniTracker ITSM ticket exports using AI.

---

## Core Workflow

1. User uploads an OmniTracker **PDF export** (drag & drop or file picker)
2. **pdf.js** extracts text client-side — nothing is stored or sent to a server
3. AI does a **pre-analysis** to identify human actors and suggest their roles listed in as per config.cs
4. A **human-in-the-loop** step lets the user confirm/correct role assignments (to prevent sentiment hallucinations)
5. Full AI analysis runs: structured extraction + two specialist views
6. Results appear in three tabs

---

## Three Output Tabs

| Tab | Audience | What the AI produces |
|-----|----------|-----------------------|
| **IT Service Manager** | Service/operations managers | Sentiment analysis, customer experience gaps, improvement recommendations, timeliness assessment, timeline summary |
| **Extracted Content Review** | Reviewers | Structured incident metadata, event-card timeline with sentiment flags, communications, work notes, raw page text |
| **Enterprise Architect / SME** | Technical staff | Affected systems, root cause, technology stack, architectural observations, monitoring gaps |

---

## Key Technical Details

- **Pure client-side** — one HTML file + a `config.js` for model keys
- **Multi-model support**: OpenAI, GLM, Qwen, plus any OpenAI API-compatible endpoint; models are configured via an in-app Admin panel and persisted in `localStorage`
- **Three LLM prompts** (hardcoded in JS): user extraction, full review/translation (structured JSON), Service Manager analysis, and Architecture analysis
- **Sentiment enforcement**: role-based rules prevent flagging service team comments as customer frustration — enforced both in the prompt and in a front-end filter
- **Timeline rendering**: groups events by date, fills in "no action" gap days, color-codes by event type (created, sentiment, priority change, resolved)
- **Re-analyze toolbar**: after a run completes, lets user switch to a different configured model and re-run without re-uploading
- **Languages**: handles German-language OmniTracker exports (translates to English inline)
- **Mermaid.js** is loaded but the current code uses card-based timeline rendering instead

---

## Architecture

```
ITSM_Ticket_Intelligence.html  ← entire app (HTML + CSS + JS)
config.js                      ← API keys and model endpoints (external)
```

**Dependencies (CDN):**
- [pdf.js](https://mozilla.github.io/pdf.js/) — client-side PDF text extraction
- [Mermaid.js](https://mermaid.js.org/) — loaded but not actively used in rendering
- Google Fonts — Inter (UI) + JetBrains Mono (code/timestamps)

**State persistence:** model configuration stored in `localStorage` under key `ITSM_MODELS_CONFIG`

---

## AI Analysis Pipeline

```
PDF Upload
    │
    ▼
Text Extraction (pdf.js, client-side)
    │
    ▼
Pre-Analysis: User/Role Extraction (LLM call 1)
    │
    ▼
Human-in-the-Loop: Role Mapping Review
    │
    ▼
┌───────────────────────────────────┐
│  Review/Translation (LLM call 2) │  → Extracted Content Review tab
│  SM Analysis       (LLM call 3) │  → IT Service Manager tab
│  Arch Analysis     (LLM call 4) │  → Enterprise Architect tab
└───────────────────────────────────┘
```

---

## Sentiment Analysis Rules

Sentiment (`escalation` | `frustration` | `concern`) is **only applied to business-side actors**:

- Affected Business User
- Reporting Person
- Business Team / Leadership / Tower Lead
- Service Delivery Manager / Escalation Owner

The following roles are **explicitly excluded** from sentiment flagging:

- Service Desk Agent
- Support Team
- Problem Manager
- Major Incident Manager

Enforcement is applied both in the LLM system prompt and in a post-processing front-end filter.

---

## Model Configuration

Models are managed via the in-app **Admin Panel** (gear icon in the header). Each model entry requires:

| Field | Description |
|-------|-------------|
| Provider Label | Display name (e.g. OpenAI) |
| Model ID | API model identifier (e.g. `gpt-4o-mini`) |
| Endpoint URL | OpenAI-compatible `/v1/chat/completions` URL |
| API Key | Bearer token for the endpoint |
| Icon | 2–3 character label + color for the UI pill |

One model is designated as **Default** and used for all analysis runs. Models can be tested directly from the Admin Panel.
