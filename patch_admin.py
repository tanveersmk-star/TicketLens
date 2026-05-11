import re
import os
import json

HTML_FILE = 'ITSM_Ticket_Intelligence.html'
EA_SKILL = 'enterprise-architect-analysis/SKILL.md'
ITSM_SKILL = 'itsm-expert/SKILL.md'

with open(EA_SKILL, 'r', encoding='utf-8') as f:
    ea_skill_text = f.read()

with open(ITSM_SKILL, 'r', encoding='utf-8') as f:
    itsm_skill_text = f.read()

with open(HTML_FILE, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update the Admin HTML panel to include Tabs
admin_panel_replacement = """
      <div class="admin-panel-hdr">
        <h2>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Configuration
          <span class="badge-admin">Admin</span>
        </h2>
        <button class="admin-close-btn" onclick="closeAdmin()" title="Close">✕</button>
      </div>

      <div class="admin-panel-toolbar" style="border-bottom: 1px solid var(--border); padding-bottom: 0;">
        <div class="admin-tabs" style="display:flex;gap:20px;">
          <button class="admin-tab-btn active" onclick="switchAdminTab('models', this)" style="background:none;border:none;padding:10px 0;font-weight:600;color:var(--primary);border-bottom:2px solid var(--primary);cursor:pointer;">Models</button>
          <button class="admin-tab-btn" onclick="switchAdminTab('roles', this)" style="background:none;border:none;padding:10px 0;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;cursor:pointer;">Roles Mapping</button>
          <button class="admin-tab-btn" onclick="switchAdminTab('context', this)" style="background:none;border:none;padding:10px 0;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;cursor:pointer;">Context & Skills</button>
        </div>
      </div>

      <div class="admin-panel-body" style="padding-top:16px;">
        <div id="admin-notice" class="admin-notice" style="display:none;"></div>
        
        <div id="admin-tab-models" class="admin-tab-content">
          <div style="margin-bottom:16px; display:flex; gap:10px;">
            <button class="btn-admin-add" onclick="toggleAddForm()">+ Add New Model</button>
            <button class="btn-admin-secondary" onclick="adminResetDefaults()">Reset to config.js Defaults</button>
          </div>
          <div id="admin-model-list"></div>
          <!-- Add New Model Form -->
"""

# Replace the original admin panel header and toolbar up to the model list
html = re.sub(
    r'<div class="admin-panel-hdr">.*?<div id="admin-model-list">.*?</div>.*?<!-- Add New Model Form -->',
    admin_panel_replacement,
    html,
    flags=re.DOTALL
)

# 2. Close the admin-tab-models div and add the new tabs
admin_new_tabs = """
        </div> <!-- end admin-tab-models -->

        <!-- Roles Tab -->
        <div id="admin-tab-roles" class="admin-tab-content" style="display:none;">
          <div class="admin-field full" style="margin-bottom: 16px;">
            <label style="font-weight:600; color:var(--text); margin-bottom:8px; display:block;">Role Sentiment Mapping (JSON)</label>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Map role names to true/false to enable or disable sentiment flags for that role. Changes save automatically.</p>
            <textarea id="admin-roles-json" style="width:100%; height:300px; font-family:monospace; padding:12px; border:1px solid var(--border); border-radius:6px; font-size:0.85rem;" onblur="saveAdminRoles()"></textarea>
            <button class="btn-admin-save" style="margin-top:12px;" onclick="saveAdminRoles()">✓ Save Roles</button>
            <span id="roles-save-msg" style="margin-left:10px; font-size:0.8rem; color:var(--success); display:none;">Saved!</span>
          </div>
        </div>

        <!-- Context & Skills Tab -->
        <div id="admin-tab-context" class="admin-tab-content" style="display:none;">
          <div class="admin-field full" style="margin-bottom: 24px;">
            <label style="font-weight:600; color:var(--text); margin-bottom:8px; display:block;">Service Manager (CSAT) Context & Skills</label>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Update the system prompt and skills for the SM CSAT analysis.</p>
            <textarea id="admin-csat-context" style="width:100%; height:250px; font-family:monospace; padding:12px; border:1px solid var(--border); border-radius:6px; font-size:0.85rem;" onblur="saveAdminContexts()"></textarea>
          </div>
          
          <div class="admin-field full" style="margin-bottom: 16px;">
            <label style="font-weight:600; color:var(--text); margin-bottom:8px; display:block;">Enterprise Architect Context & Skills</label>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Update the system prompt and skills for the EA analysis.</p>
            <textarea id="admin-ea-context" style="width:100%; height:250px; font-family:monospace; padding:12px; border:1px solid var(--border); border-radius:6px; font-size:0.85rem;" onblur="saveAdminContexts()"></textarea>
          </div>
          
          <button class="btn-admin-save" onclick="saveAdminContexts()">✓ Save Contexts</button>
          <span id="contexts-save-msg" style="margin-left:10px; font-size:0.8rem; color:var(--success); display:none;">Saved!</span>
        </div>
"""

# Find where the addform section ends and insert the new tabs
html = re.sub(
    r'(<div class="admin-addform-section" id="admin-addform">.*?</div>\s*</div>)',
    r'\1' + admin_new_tabs,
    html,
    flags=re.DOTALL
)

# 3. Add JS to handle the new tabs, roles, and contexts
js_injection = f"""
    // ─── Dynamic Admin Tabs & Settings ───
    function switchAdminTab(tabId, btn) {{
      document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
      document.getElementById('admin-tab-' + tabId).style.display = 'block';
      document.querySelectorAll('.admin-tab-btn').forEach(b => {{
        b.style.color = 'var(--text-muted)';
        b.style.borderBottomColor = 'transparent';
      }});
      btn.style.color = 'var(--primary)';
      btn.style.borderBottomColor = 'var(--primary)';
    }}

    const LS_ROLES_KEY = 'ITSM_ROLES_CONFIG';
    const LS_CSAT_CTX_KEY = 'ITSM_CSAT_CONTEXT';
    const LS_EA_CTX_KEY = 'ITSM_EA_CONTEXT';

    // Default Skills Content
    const DEFAULT_ITSM_SKILL = `{itsm_skill_text.replace('`', '\\`')}`;
    const DEFAULT_EA_SKILL = `{ea_skill_text.replace('`', '\\`')}`;

    function loadAdminSettings() {{
      // Roles
      let roles = localStorage.getItem(LS_ROLES_KEY);
      if (!roles) {{
        roles = JSON.stringify(window.CONFIG.role_sentiment_config || {{}}, null, 2);
      }}
      document.getElementById('admin-roles-json').value = roles;

      // CSAT Context
      let csatCtx = localStorage.getItem(LS_CSAT_CTX_KEY);
      if (!csatCtx) {{
        csatCtx = SM_SYSTEM_PROMPT_BASE + "\\n\\n--- MERGED SKILL: ITSM Expert ---\\n" + DEFAULT_ITSM_SKILL;
      }}
      document.getElementById('admin-csat-context').value = csatCtx;

      // EA Context
      let eaCtx = localStorage.getItem(LS_EA_CTX_KEY);
      if (!eaCtx) {{
        eaCtx = ARCH_SYSTEM_PROMPT_BASE + "\\n\\n--- MERGED SKILL: ITSM Expert ---\\n" + DEFAULT_ITSM_SKILL + "\\n\\n--- MERGED SKILL: Enterprise Architect ---\\n" + DEFAULT_EA_SKILL;
      }}
      document.getElementById('admin-ea-context').value = eaCtx;
    }}

    function saveAdminRoles() {{
      const val = document.getElementById('admin-roles-json').value;
      try {{
        const parsed = JSON.parse(val);
        localStorage.setItem(LS_ROLES_KEY, JSON.stringify(parsed, null, 2));
        window.CONFIG.role_sentiment_config = parsed; // Update live config
        const msg = document.getElementById('roles-save-msg');
        msg.style.display = 'inline';
        setTimeout(() => msg.style.display = 'none', 2000);
      }} catch (e) {{
        alert("Invalid JSON format for roles!");
      }}
    }}

    function saveAdminContexts() {{
      const csat = document.getElementById('admin-csat-context').value;
      const ea = document.getElementById('admin-ea-context').value;
      localStorage.setItem(LS_CSAT_CTX_KEY, csat);
      localStorage.setItem(LS_EA_CTX_KEY, ea);
      
      // Update the global variables that the fetch call uses
      SM_SYSTEM_PROMPT = csat;
      ARCH_SYSTEM_PROMPT = ea;

      const msg = document.getElementById('contexts-save-msg');
      msg.style.display = 'inline';
      setTimeout(() => msg.style.display = 'none', 2000);
    }}

    // Hook into openAdmin to load settings
    const originalOpenAdmin = openAdmin;
    openAdmin = function() {{
      originalOpenAdmin();
      loadAdminSettings();
    }};
"""

# Insert JS Injection before `const LS_KEY = 'ITSM_MODELS_CONFIG';`
html = html.replace("const LS_KEY = 'ITSM_MODELS_CONFIG';", js_injection + "\n    const LS_KEY = 'ITSM_MODELS_CONFIG';")


# 4. Modify SM_SYSTEM_PROMPT and ARCH_SYSTEM_PROMPT definitions to be lets, and save their base values.
# Wait, let's use regex to find the const definitions and change to `let` and `_BASE`
html = re.sub(
    r'const SM_SYSTEM_PROMPT = (SECURITY_SYSTEM_CONSTRAINT \+ `.*?`);',
    r'const SM_SYSTEM_PROMPT_BASE = \1;\n    let SM_SYSTEM_PROMPT = localStorage.getItem("ITSM_CSAT_CONTEXT") || (SM_SYSTEM_PROMPT_BASE + "\\n\\n--- MERGED SKILL: ITSM Expert ---\\n" + DEFAULT_ITSM_SKILL);',
    html,
    flags=re.DOTALL
)

html = re.sub(
    r'const ARCH_SYSTEM_PROMPT = (SECURITY_SYSTEM_CONSTRAINT \+ `.*?`);',
    r'const ARCH_SYSTEM_PROMPT_BASE = \1;\n    let ARCH_SYSTEM_PROMPT = localStorage.getItem("ITSM_EA_CONTEXT") || (ARCH_SYSTEM_PROMPT_BASE + "\\n\\n--- MERGED SKILL: ITSM Expert ---\\n" + DEFAULT_ITSM_SKILL + "\\n\\n--- MERGED SKILL: Enterprise Architect ---\\n" + DEFAULT_EA_SKILL);',
    html,
    flags=re.DOTALL
)

with open(HTML_FILE, 'w', encoding='utf-8') as f:
    f.write(html)

print("HTML Patched successfully!")
