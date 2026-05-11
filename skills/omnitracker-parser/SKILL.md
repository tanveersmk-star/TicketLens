---
type: skill
name: "OmniTracker TIMA Document Parser"
description: "Exact structural knowledge of TIMA OmniTracker PDF exports — section layouts, actor patterns, field formats"
category: "Parsing"
applies_to:
  - actor_extraction
  - content_review
  - timeline_extraction
version: "1.0"
domains:
  - "OmniTracker TIMA PDF Structure"
  - "Actor Extraction"
  - "TIMA-specific Field Formats"
---

# OmniTracker TIMA Document Parser Skill

## Document Structure Overview

TIMA OmniTracker PDF exports have **5 distinct sections** in a fixed order:

```
1. Properties / Header      ← Pages 1-2: master data, ticket metadata
2. Communication History    ← COMM-XXXXX and EMAIL-XXXXX blocks
3. Solution / Relations     ← Resolution, linked tickets
4. SLA Time Targets         ← Provider SLA tracking
5. History (Verlauf)        ← Audit trail of all field changes
```

---

## Section 1: Properties / Header

**Format**: `FieldLabel:\n  Value` or `FieldLabel: Value` on same line.

**Actor fields (always extract these):**
```
Responsible Person:    Vasamsetti Chittibabu (DI IT ERP)
Reporting Person:      Wuerch Alexander (DI MC MF GWE LOG 1)
Affected Person:       Wuerch Alexander (DI MC MF GWE LOG 1)
```

**Name format**: `Lastname Firstname (Org-Unit)` — keep as-is from document. Do NOT reorder.

**Other metadata fields (not people):**
```
Responsible Group:     R2P ACN WM / EWM (ACN global)
Affected Service:      SAP ERP R2P
Category:              Problem/Clarification
State:                 Waiting
Created:               21.11.2025 15:06:40
Org.-Unit:             DI MC MF GWE LOG 1
Location:              ERL F80
```

---

## Section 2: Communication History

Two block types appear here: `COMM-XXXXX` (internal work notes) and `EMAIL-XXXXX` (system-generated notifications).

### COMM Block Format

```
COMM-2724479                                         ← block identifier on its own line
Schreiber Pascal (DI IT ERP DE EWM 1)               ← LINE 2: sender name (Lastname Firstname (Org))
24.11.2025  07:59:21             Normal              ← date + priority
To-Recipients:                                       ← often empty for internal notes
Subject:                                             ← often empty
Description:                                         ← content follows
Settting priority to very high as impact is high...
```

**CRITICAL**: The sender is always **line 2 immediately after the COMM-XXXXX identifier**, with NO field label prefix. It is in `Lastname Firstname (Org-Unit)` format. This person took an action on the ticket and must be extracted as an actor.

### EMAIL Block Format

```
EMAIL-2726490                                        ← block identifier
<tima.it@clientgroup.com>                            ← LINE 2: sender (always TIMA system address)
24.11.2025  17:36:52             Normal
To-Recipients:
  <alexander.wuerch@clientgroup.com>
Subject: TIMA / New information / #Ticket C-25076194#...
HTML Text:
  (auto-generated email body)
```

**EMAIL sender is always `tima.it@clientgroup.com`** — a system address, NOT a human actor.

**To-Recipients** of EMAIL blocks are passive notification recipients, NOT active actors. Do NOT extract them as ticket participants.

**Exception**: If an EMAIL block has a sender that is NOT `tima.it` or another system address, the sender is a real person responding by email — extract them.

### Inline Comment Threads Inside EMAIL Bodies

Email bodies contain embedded comment history in this format:
```
[ Mon 11/24/2025 5:36:51 PM PM - Vasamsetti Chittibabu (DI IT ERP) - ]:
comment text here

[ Fri 11/21/2025 3:26:35 PM PM - Khan Mohammad Faraz Firoz (DI IT ERP) - ]:
comment text here
```

Pattern: `[ <day> <date> <time> - <Name (Org)> - ]:` — these are mirrored copies of COMM block entries. Do NOT treat them as additional events; they duplicate COMM entries already captured.

---

## Section 5: History (Verlauf)

**DO NOT extract actors from this section** for role mapping. History actors are always the same people who appear in COMM blocks. The History section is an audit trail of field changes and contains duplicate names.

### History Entry Formats (for reference only)

**Variant A — single line** (name fits on one line with date):
```
24.11.2025  17:36:53   Vasamsetti Chittibabu (DI IT ERP)Waiting   Assigned emails
Action: Field 'Assigned emails': Added 'EMAIL-2726490...'
```
Note: the name runs directly into the state word with no separator.

**Variant B — two lines** (name wraps to next line when too long):
```
24.11.2025  07:59:21   Waiting
Schreiber Pascal (DI IT ERP DE EWM 1)   Assigned emails
Action: Field 'Assigned emails': Added 'COMM-2724479...'
```

---

## Actor Extraction Rules (Summary)

| Source | How to Find the Actor | Extract? |
|--------|----------------------|----------|
| Header: Responsible Person | Field label + value | ✅ Yes |
| Header: Reporting Person | Field label + value | ✅ Yes |
| Header: Affected Person | Field label + value | ✅ Yes |
| Header: Caller / Contact Person | Field label + value | ✅ Yes |
| COMM block sender | **Line 2 after COMM-XXXXX** (no label) | ✅ Yes |
| EMAIL block sender = tima.it | Line 2 after EMAIL-XXXXX | ❌ Skip — system |
| EMAIL block sender ≠ tima.it | Line 2 after EMAIL-XXXXX | ✅ Yes — real reply |
| EMAIL To-Recipients (passive) | `To-Recipients:` field | ❌ Skip — notifications |
| Inline `[ date - Name - ]:` in bodies | Pattern inside email text | ❌ Skip — duplicates COMM |
| History section actors | After date in audit rows | ❌ Skip — duplicates COMM |

---

## Name Formats Seen in TIMA

All names in TIMA use **Lastname Firstname (Org-Unit)** ordering:
- `Schreiber Pascal (DI IT ERP DE EWM 1)`
- `Wuerch Alexander (DI MC MF GWE LOG 1)`
- `Vasamsetti Chittibabu (DI IT ERP)`
- `Khan Mohammad Faraz Firoz (DI IT ERP)`

The org-unit in parentheses `(DI IT ERP)` should be stripped when displaying the display name, but can be used to infer the role:
- `(DI MC ...)` → business unit → likely `Affected Business User` or `Reporting Person`
- `(DI IT ERP ...)` → IT/support unit → likely `Support Team` or resolver role
- `(DI IT ERP DE EWM 1)` → IT ERP sub-team → `Support Team`

---

## Related Skills

- [Content Reviewer](../content-reviewer/SKILL.md) — uses this document structure knowledge for full extraction
- [ITSM Expert](../itsm-expert/SKILL.md) — ITIL process constraints
