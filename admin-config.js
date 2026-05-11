// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN-CONFIG.JS — Persistent Configuration Store
// ═══════════════════════════════════════════════════════════════════════════════
//
// This file acts as the physical "database" for the ITSM Ticket Intelligence
// application. It stores all admin-managed configuration:
//
//   • ITSM Roles (with sentiment scoring flags)
//   • SKILL prompts (EA, SM, ITSM Expert)
//   • AI Model configurations
//
// PRIORITY CHAIN (highest wins):
//   1. localStorage  (hot cache — cleared on browser reset)
//   2. This file     (physical — survives browser resets, portable across machines)
//   3. Hardcoded     (embedded defaults inside the HTML)
//
// HOW TO UPDATE:
//   Option A: Edit this file directly in any text editor
//   Option B: Use the Admin UI → Export Configuration → replace this file
//
// ═══════════════════════════════════════════════════════════════════════════════

window.ADMIN_CONFIG = {

  // ── Meta ──────────────────────────────────────────────────────────────────
  _version: "1.0",
  _lastExported: new Date().toISOString(),

  // ── ITSM Roles ───────────────────────────────────────────────────────────
  // Each role controls:
  //   • Which roles appear in the actor-mapping wizard
  //   • Whether sentiment analysis is applied to that role's communications
  //
  // sentiment: true  = AI scores emotional tone (business-side roles)
  // sentiment: false = sentiment stripped (internal/technical roles)
  roles: [
    { role: "Affected Business User",   description: "End user experiencing the issue",                  order: 1,  active: true, sentiment: true,  color: "#0078b4" },
    { role: "Reporting Person",         description: "Person who raised the ticket",                     order: 2,  active: true, sentiment: true,  color: "#5b21b6" },
    { role: "Business Team",            description: "Business stakeholder group",                       order: 3,  active: true, sentiment: true,  color: "#a02818" },
    { role: "Process Owner",            description: "Owns the business process affected",               order: 4,  active: true, sentiment: true,  color: "#e69500" },
    { role: "Service Delivery Manager", description: "Manages service delivery commitments",             order: 5,  active: true, sentiment: true,  color: "#00a86b" },
    { role: "Escalation Owner",         description: "Manages escalation path and stakeholder comms",    order: 6,  active: true, sentiment: true,  color: "#d63d2f" },
    { role: "Leadership / Tower Lead",  description: "Senior leadership with oversight responsibility",  order: 7,  active: true, sentiment: true,  color: "#6f5091" },
    { role: "Major Incident Manager",   description: "Coordinates major incident response",              order: 8,  active: true, sentiment: false, color: "#009999" },
    { role: "Problem Manager",          description: "Root cause analysis and problem records",          order: 9,  active: true, sentiment: false, color: "#e69500" },
    { role: "Service Desk Agent",       description: "First line contact and ticket logging",            order: 10, active: true, sentiment: false, color: "#0078b4" },
    { role: "Support Team",             description: "Technical resolver group handling the incident",   order: 11, active: true, sentiment: false, color: "#00a86b" }
  ],

  // ── SKILL Prompts ────────────────────────────────────────────────────────
  // These are the system prompt contexts injected into AI calls.
  // They are merged at runtime:
  //   SM call  = skills.sm  + skills.itsm
  //   EA call  = skills.ea  + skills.itsm
  //
  // Edit these to tune how the AI reasons about tickets.
  skills: {
    ea:   null,   // null = use hardcoded ARCH_SYSTEM_PROMPT_BASE
    sm:   null,   // null = use hardcoded SM_SYSTEM_PROMPT_BASE
    itsm: null    // null = use hardcoded DEFAULT_ITSM_SKILL
  },

  // ── AI Models ────────────────────────────────────────────────────────────
  // Pre-configured model list shown on first load (no localStorage required).
  // Users add their API key via Admin → AI Models → Edit.
  models: [
    {
      "id": "anthropic_claude",
      "label": "Claude (Anthropic)",
      "modelId": "claude-sonnet-4-6",
      "url": "https://api.anthropic.com/v1/messages",
      "apiKey": "",
      "iconText": "An",
      "iconBg": "linear-gradient(135deg,#d97706,#b45309)",
      "enabled": true,
      "isDefault": true
    },
    {
      "id": "openai",
      "label": "OpenAI",
      "modelId": "gpt-4o-mini",
      "url": "https://api.openai.com/v1/chat/completions",
      "apiKey": "",
      "iconText": "AI",
      "iconBg": "linear-gradient(135deg,#00a67e,#007a5e)",
      "enabled": true,
      "isDefault": false
    }
  ]
};
