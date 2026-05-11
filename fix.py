with open('ITSM_Ticket_Intelligence.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the broken assignment with a fixed one using backticks or \\n
broken_block = '''      ARCH_SYSTEM_PROMPT = eaBase + "

--- MERGED SKILL: ITSM Expert ---
" + itsmBase;
      SM_SYSTEM_PROMPT = smBase + "

--- MERGED SKILL: ITSM Expert ---
" + itsmBase;'''

fixed_block = '''      ARCH_SYSTEM_PROMPT = eaBase + "\\n\\n--- MERGED SKILL: ITSM Expert ---\\n" + itsmBase;
      SM_SYSTEM_PROMPT = smBase + "\\n\\n--- MERGED SKILL: ITSM Expert ---\\n" + itsmBase;'''

text = text.replace(broken_block, fixed_block)

with open('ITSM_Ticket_Intelligence.html', 'w', encoding='utf-8') as f:
    f.write(text)
