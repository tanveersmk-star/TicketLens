"""
Fix Admin Panel:
1. Replace dark-themed admin-overlay HTML with Siemens light-themed fullscreen panel
2. Remove duplicate closeAdmin/openAdmin and consolidate into one
3. Keep all functional logic (skills, roles, models) intact
"""

HTML_FILE = 'ITSM_Ticket_Intelligence.html'

with open(HTML_FILE, 'r', encoding='utf-8') as f:
    html = f.read()

# ============================================================
# 1) Replace the entire admin-overlay div (dark theme) with
#    a Siemens-branded light theme fullscreen panel
# ============================================================

old_admin_start = '  <!-- ─── Admin Fullscreen Panel ─── -->'
old_admin_end   = '  </div>\r\n\r\n  </div>\r\n\r\n  <script>'
# fallback
if old_admin_end not in html:
    old_admin_end = '  </div>\n\n  </div>\n\n  <script>'

# Find the boundaries
idx_start = html.find(old_admin_start)
idx_end   = html.find('  <script>', idx_start)

if idx_start == -1:
    print("ERROR: Could not find admin overlay start marker!")
    exit(1)

# Also remove the line "<!-- ─── Admin Model Configuration Panel ─── -->" just above
marker_line = '  <!-- ─── Admin Model Configuration Panel ─── -->'
idx_marker = html.find(marker_line)
if idx_marker != -1 and idx_marker < idx_start:
    cut_from = idx_marker
else:
    cut_from = idx_start

new_admin_html = r"""
  <!-- ─── Admin Fullscreen Panel ─── -->
  <div id="admin-overlay" style="display:none; position:fixed; inset:0; background:var(--bg); z-index:9999; overflow-y:auto; font-family:'Inter',sans-serif;">

    <!-- Top Nav Bar -->
    <div style="display:flex; align-items:center; padding:0 24px; height:56px; background:linear-gradient(135deg, var(--header-dark) 0%, var(--header-mid) 100%); border-bottom:3px solid var(--primary); font-size:0.9rem;">
      <div style="background:var(--primary); color:#fff; font-weight:800; border-radius:4px; padding:4px 8px; margin-right:12px; font-size:0.85rem;">TI</div>
      <div style="color:rgba(255,255,255,0.4); margin-right:12px;">/</div>
      <div style="color:#fff; font-weight:600; margin-right:28px;">Admin</div>

      <div style="display:flex; gap:4px;">
        <div class="admin-nav-link" id="nav-btn-models" onclick="switchAdminTabV2('models')">AI Models</div>
        <div class="admin-nav-link" id="nav-btn-skills" onclick="switchAdminTabV2('skills')">SKILL Prompts</div>
        <div class="admin-nav-link" id="nav-btn-roles"  onclick="switchAdminTabV2('roles')">ITSM Roles</div>
      </div>

      <div onclick="closeAdmin()" style="margin-left:auto; color:rgba(255,255,255,0.7); cursor:pointer; font-size:0.85rem; font-weight:600; display:flex; align-items:center; gap:6px; padding:6px 14px; border-radius:var(--radius-sm); border:1px solid rgba(255,255,255,0.2); transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">&larr; Back to Incidents</div>
    </div>

    <!-- Admin Body -->
    <div style="padding:32px 48px; max-width:1400px; margin:0 auto;">

      <!-- ── AI Models Tab ── -->
      <div id="admin-tab-models" class="admin-view" style="display:none;">
        <h2 style="color:var(--text); margin-bottom:6px; font-size:1.25rem;">AI Models</h2>
        <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.88rem;">Configure API endpoints and keys for local or cloud AI models.</p>
        <div style="margin-bottom:16px; display:flex; gap:10px;">
          <button class="btn-admin-add" onclick="toggleAddForm()">+ Add New Model</button>
          <button class="btn-admin-secondary" onclick="adminResetDefaults()">
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Reset to config.js Defaults
          </button>
        </div>
        <div id="admin-model-list"></div>
        <div class="admin-addform-section" id="admin-addform">
          <div class="admin-addform-title">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            Add New Model
          </div>
          <div class="admin-notice">⚠ Saving will reset the current analysis. Make sure the model is OpenAI API-compatible.</div>
          <div class="admin-form-grid">
            <div class="admin-field"><label>Provider Label</label><input type="text" id="new-label" placeholder="e.g. My Model"></div>
            <div class="admin-field"><label>Model ID</label><input type="text" id="new-modelid" placeholder="e.g. gpt-4o"></div>
            <div class="admin-field full"><label>API Endpoint URL</label><input type="text" id="new-url" placeholder="https://api.openai.com/v1/chat/completions"></div>
            <div class="admin-field full"><label>API Key</label><input type="password" id="new-key" placeholder="Paste your API key here"></div>
            <div class="admin-field"><label>Icon Text (2 chars)</label><input type="text" id="new-icon" placeholder="CL" maxlength="3"></div>
            <div class="admin-field"><label>Icon Color (CSS gradient or hex)</label><input type="text" id="new-color" placeholder="#7c3aed" value="#7c3aed"></div>
          </div>
          <div class="admin-form-actions">
            <button class="btn-admin-save" onclick="adminSaveNewModel()">✓ Save & Apply</button>
            <button class="btn-admin-cancel" onclick="toggleAddForm()">Cancel</button>
          </div>
        </div>
      </div>

      <!-- ── SKILL Prompts Tab ── -->
      <div id="admin-tab-skills" class="admin-view" style="display:none;">
        <h2 style="color:var(--text); margin-bottom:6px; font-size:1.25rem;">SKILL Prompts</h2>
        <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.88rem;">Edit the system prompt content injected into AI calls for each view. Changes take effect immediately on the next analysis run.</p>

        <div style="display:grid; grid-template-columns:280px 1fr; gap:28px;">
          <!-- Left Sidebar -->
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div class="skill-card active" id="scard-ea" onclick="selectSkill('ea')">
              <h4 style="margin:0 0 4px; font-size:0.9rem; color:var(--text);">Enterprise Architect Analysis</h4>
              <p style="margin:0; font-size:0.78rem; color:var(--text-muted);">Enterprise Architect view only</p>
              <p style="margin:4px 0 0; font-size:0.72rem; color:var(--text-light);">Updated <span id="ts-ea"></span></p>
            </div>
            <div class="skill-card" id="scard-sm" onclick="selectSkill('sm')">
              <h4 style="margin:0 0 4px; font-size:0.9rem; color:var(--text);">Service Manager (CSAT)</h4>
              <p style="margin:0; font-size:0.78rem; color:var(--text-muted);">Service Manager view only</p>
              <p style="margin:4px 0 0; font-size:0.72rem; color:var(--text-light);">Updated <span id="ts-sm"></span></p>
            </div>
            <div class="skill-card" id="scard-itsm" onclick="selectSkill('itsm')">
              <h4 style="margin:0 0 4px; font-size:0.9rem; color:var(--text);">ITSM Expert (Applied to All Views)</h4>
              <p style="margin:0; font-size:0.78rem; color:var(--text-muted);">All views</p>
              <p style="margin:4px 0 0; font-size:0.72rem; color:var(--text-light);">Updated <span id="ts-itsm"></span></p>
            </div>
          </div>

          <!-- Right Editor -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
              <div>
                <h3 id="editor-title" style="margin:0 0 4px; color:var(--text); font-size:1.05rem;">Enterprise Architect Analysis</h3>
                <p id="editor-sub" style="margin:0; color:var(--text-muted); font-size:0.82rem;">Used in: Enterprise Architect view only</p>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span id="skill-save-msg" style="color:var(--success); font-size:0.82rem; opacity:0; transition:opacity 0.2s;">✓ Saved</span>
                <button class="btn-admin-save" onclick="saveCurrentSkill()">Save Changes</button>
              </div>
            </div>
            <textarea id="skill-editor" style="width:100%; height:550px; background:var(--surface); border:1.5px solid var(--border); border-radius:var(--radius); color:var(--text); font-family:'JetBrains Mono', Consolas, monospace; font-size:0.82rem; padding:16px; resize:vertical; line-height:1.6; outline:none; transition: border-color 0.15s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'"></textarea>
          </div>
        </div>
      </div>

      <!-- ── ITSM Roles Tab ── -->
      <div id="admin-tab-roles" class="admin-view" style="display:none;">
        <h2 style="color:var(--text); margin-bottom:6px; font-size:1.25rem;">ITSM Roles</h2>
        <p style="color:var(--text-muted); margin-bottom:24px; font-size:0.88rem;">Roles presented during the actor-mapping step. <strong>Sentiment</strong> controls whether the AI scores the emotional tone of COMM entries from actors in that role — disable for purely technical groups.</p>

        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden;">
          <table style="width:100%; border-collapse:collapse;" id="roles-table">
            <thead>
              <tr style="background:var(--bg);">
                <th style="text-align:left; padding:12px 16px; color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border);">Role</th>
                <th style="text-align:left; padding:12px 16px; color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border);">Description</th>
                <th style="text-align:left; padding:12px 16px; color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border);">Order</th>
                <th style="text-align:left; padding:12px 16px; color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border);">Active</th>
                <th style="text-align:left; padding:12px 16px; color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--border);">Sentiment</th>
              </tr>
            </thead>
            <tbody id="roles-tbody">
              <!-- Rendered by JS -->
            </tbody>
          </table>
        </div>
      </div>

    </div>
  </div>
"""

html = html[:cut_from] + new_admin_html + '\n' + html[idx_end:]

# ============================================================
# 2) Replace the CSS for admin-overlay and add new CSS for
#    skill-card, nav-link, toggle, role-badge in LIGHT theme
# ============================================================

old_css_block = """    .skill-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; }
    .skill-card:hover { background: #21262d; }
    .skill-card.active { border-color: #58a6ff; box-shadow: 0 0 0 1px #58a6ff; background: #21262d; }
    .admin-nav-link:hover { background: rgba(255,255,255,0.05); color: #c9d1d9; }
    .admin-nav-link.active { color: #ffffff; background: rgba(255,255,255,0.1); font-weight: 600; }
    
    .role-badge { display: inline-flex; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.1); }
    
    .toggle-container { display: flex; align-items: center; gap: 12px; }
    .toggle-switch { position: relative; display: inline-block; width: 40px; height: 22px; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #30363d; transition: .2s; border-radius: 34px; }
    .toggle-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: #8b949e; transition: .2s; border-radius: 50%; }
    .toggle-switch input:checked + .toggle-slider { background-color: #00cccc; }
    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(18px); background-color: #fff; }
    .toggle-label { font-size: 0.85rem; color: #8b949e; min-width: 50px; }
    .toggle-switch input:checked ~ .toggle-label { color: #c9d1d9; }"""

new_css_block = """    /* ── Admin Nav Links ── */
    .admin-nav-link { cursor:pointer; padding:8px 14px; border-radius:var(--radius-sm); font-size:0.82rem; font-weight:600; color:rgba(255,255,255,0.6); transition:all 0.15s; }
    .admin-nav-link:hover { background:rgba(255,255,255,0.08); color:#fff; }
    .admin-nav-link.active { color:#fff; background:rgba(255,255,255,0.15); }

    /* ── Skill Cards ── */
    .skill-card { background:var(--surface); border:1.5px solid var(--border); border-radius:var(--radius); padding:14px 16px; cursor:pointer; transition:all 0.2s; }
    .skill-card:hover { border-color:var(--primary); box-shadow:var(--shadow-sm); }
    .skill-card.active { border-color:var(--primary); box-shadow:0 0 0 2px rgba(0,153,153,0.15); background:var(--primary-light); }

    /* ── Role Badge ── */
    .role-badge { display:inline-flex; padding:4px 10px; border-radius:4px; font-size:0.82rem; font-weight:600; }

    /* ── Toggle Switch ── */
    .toggle-container { display:flex; align-items:center; gap:12px; }
    .toggle-switch { position:relative; display:inline-block; width:40px; height:22px; }
    .toggle-switch input { opacity:0; width:0; height:0; }
    .toggle-slider { position:absolute; cursor:pointer; inset:0; background:var(--border); transition:.2s; border-radius:34px; }
    .toggle-slider:before { position:absolute; content:""; height:16px; width:16px; left:3px; bottom:3px; background:#fff; transition:.2s; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.15); }
    .toggle-switch input:checked + .toggle-slider { background:var(--primary); }
    .toggle-switch input:checked + .toggle-slider:before { transform:translateX(18px); }
    .toggle-label { font-size:0.82rem; color:var(--text-muted); min-width:50px; }"""

html = html.replace(old_css_block, new_css_block)

# ============================================================
# 3) Fix closeAdmin duplication: remove the OLD closeAdmin,
#    openAdmin, adminOverlayClick, toggleAddForm block at
#    lines ~2877-2896, and keep the new ones at ~2491-2507
# ============================================================

# The old block looks like:
old_admin_js_block = """    // ──────────────────────────────────────────────────
    // ─── Admin Panel ───
    // ──────────────────────────────────────────────────
    function openAdmin() {
      renderAdminModelList();
      $('admin-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeAdmin() {
      $('admin-overlay').classList.remove('open');
      document.body.style.overflow = '';
      // Close any open edit forms
      document.querySelectorAll('.model-admin-editform.open').forEach(f => f.classList.remove('open'));
      $('admin-addform').classList.remove('open');
    }
    function adminOverlayClick(e) {
      if (e.target === $('admin-overlay')) closeAdmin();
    }
    function toggleAddForm() {
      $('admin-addform').classList.toggle('open');
    }"""

if old_admin_js_block in html:
    html = html.replace(old_admin_js_block, """    // ─── Admin Panel (handled by new Admin JS above) ───""")
    print("Removed duplicate admin JS block.")
else:
    print("WARNING: Could not find old admin JS block to remove. Trying line-by-line...")
    # Try with \r\n
    old_admin_js_block_rn = old_admin_js_block.replace('\n', '\r\n')
    if old_admin_js_block_rn in html:
        html = html.replace(old_admin_js_block_rn, """    // ─── Admin Panel (handled by new Admin JS above) ───""")
        print("Removed duplicate admin JS block (CRLF).")
    else:
        print("ERROR: Could not match old admin JS block!")

# ============================================================
# 4) Fix the toggleAddForm in the new admin JS — the old one
#    used classList.toggle('open'), new one should use
#    style.display toggle
# ============================================================

# The new admin uses style="display:none" for addform, so toggleAddForm needs updating
# But the old toggleAddForm (if it survived) uses classList. Let's make sure the new JS has a proper one.
# Check if we still have a toggleAddForm - the new code block doesn't define one, 
# so we need to add it to the new admin JS block

# The new admin JS already defines openAdmin/closeAdmin at lines ~2491-2507
# Let's add toggleAddForm right after closeAdmin
old_close_admin = """    function closeAdmin() {
       document.getElementById('admin-overlay').style.display = 'none';
       document.body.style.overflow = '';
    }"""
    
new_close_admin = """    function closeAdmin() {
       document.getElementById('admin-overlay').style.display = 'none';
       document.body.style.overflow = '';
    }
    function toggleAddForm() {
       const el = document.getElementById('admin-addform');
       if (!el) return;
       el.classList.toggle('open');
    }
    function adminOverlayClick(e) {
       if (e.target === document.getElementById('admin-overlay')) closeAdmin();
    }"""

html = html.replace(old_close_admin, new_close_admin)

# ============================================================
# 5) Update renderRolesTable to use light-theme colors
# ============================================================

old_roles_render = """       tbody.innerHTML = adminRolesData.map((r, i) => `
         <tr>
           <td style="padding:16px; border-bottom:1px solid #21262d;">
             <span class="role-badge" style="color:${r.color}; border-color:${r.color}40; background:${r.color}10;">${r.role}</span>
           </td>
           <td style="padding:16px; border-bottom:1px solid #21262d; color:#c9d1d9;">${r.description}</td>
           <td style="padding:16px; border-bottom:1px solid #21262d; color:#8b949e;">${r.order}</td>
           <td style="padding:16px; border-bottom:1px solid #21262d; color:#3fb950; font-weight:600;">Active</td>
           <td style="padding:16px; border-bottom:1px solid #21262d;">"""

new_roles_render = """       tbody.innerHTML = adminRolesData.map((r, i) => `
         <tr>
           <td style="padding:14px 16px; border-bottom:1px solid var(--border-light);">
             <span class="role-badge" style="color:${r.color}; border-color:${r.color}40; background:${r.color}12;">${r.role}</span>
           </td>
           <td style="padding:14px 16px; border-bottom:1px solid var(--border-light); color:var(--text-secondary);">${r.description}</td>
           <td style="padding:14px 16px; border-bottom:1px solid var(--border-light); color:var(--text-muted);">${r.order}</td>
           <td style="padding:14px 16px; border-bottom:1px solid var(--border-light); color:var(--success); font-weight:600;">Active</td>
           <td style="padding:14px 16px; border-bottom:1px solid var(--border-light);">"""

html = html.replace(old_roles_render, new_roles_render)

# ============================================================
# 6) Also remove the stray </div> that was left from old HTML
# ============================================================

# Remove old admin-overlay CSS class rule since we're using inline style now
# Actually let's keep it for backwards compat but override it
# The .admin-overlay.open rule won't hurt since we don't use that class anymore

with open(HTML_FILE, 'w', encoding='utf-8') as f:
    f.write(html)

print("Done! Admin panel converted to Siemens light theme, closeAdmin fixed.")
