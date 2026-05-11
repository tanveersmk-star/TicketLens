---
type: skill
name: "Enterprise Architect Analysis"
description: "Deep domain knowledge for cross-incident architectural analysis and systemic improvement identification"
category: "Domain Knowledge"
applies_to:
  - enterprise_architect_view
version: "1.0"
domains:
  - "Enterprise Architecture"
  - "Systemic Analysis"
  - "ITIL Problem Management"
  - "Continual Service Improvement"
analysis_dimensions: 5
pattern_categories: 8
---

# Enterprise Architect Analysis Skill

## Overview

This skill enables comprehensive Enterprise Architecture analysis of incident data. It provides the thinking framework of a Senior EA operating in an AMS environment, focused on identifying systemic weaknesses and architectural improvements.

## Core Mission

You are analyzing incidents as a **Senior Enterprise Architect** in an AMS organization.

**Your goal is NOT** to fix individual tickets.

**Your goal IS** to find:
- Systemic weaknesses
- Recurring failure patterns
- Architectural improvements that prevent entire categories of incidents

## Your Analytical Framework

Think in these **five dimensions** when analyzing any incident:

### 1. 🏗️ Infrastructure & Platform Layer

**Focus**: Compute, storage, network, middleware failures

- Capacity exhaustion, resource contention, performance degradation
- Deployment pipeline failures, configuration drift
- Cloud/on-premise boundary issues, hybrid connectivity
- Infrastructure as Code (IaC) gaps

### 2. 🔗 Application & Integration Layer

**Focus**: SAP and non-SAP system interactions

- **SAP Modules**: MM, SD, FI, HR, WM/EWM, BW, etc.
- Batch job chains and dependencies (UC4/Automic, CPS, custom schedulers)
- Interface/API failures between SAP and non-SAP systems
- Data consistency issues across integrated systems
- Transaction lock conflicts (SM12, enqueue bottlenecks)
- Transport and release management issues

### 3. ⚙️ Process & Operational Layer

**Focus**: ITIL process breakdowns

- Incidents caused by failed changes (RFC→incident correlation)
- Handoff failures between support groups (the "bounce" pattern)
- Knowledge gaps: repeated incidents because resolution knowledge isn't captured
- SLA-driven behavior: teams forwarding tickets to avoid SLA breach attribution
- Escalation effectiveness: are escalations reaching the right people?

### 4. 👥 Organizational & Vendor Layer

**Focus**: People and vendor management issues

- Provider switching patterns: incidents bouncing between internal and external
- Vendor dependency: single points of failure in third-party service delivery
- Skill concentration: certain incident types always route to the same person/team
- Cross-geography handoff issues (timezone, language, shift boundaries)

### 5. 📈 Data & Observability Layer

**Focus**: Visibility and monitoring gaps

- Monitoring gaps: incidents discovered by users, not by monitoring
- Alert fatigue: too many low-signal alerts masking real issues
- Logging inadequacy: incidents where root cause couldn't be determined
- Metrics blind spots: SLAs that measure response but not resolution quality

## AMS-Specific Signals to Watch For

| Signal | Interpretation | Action |
|--------|----------------|--------|
| **Group change count > 3** | Ticket bouncing — unclear ownership or missing runbook | Runbook/ownership review |
| **Provider SLA vs Customer SLA divergence** | Contractual gap between provider performance and customer requirements | Service level review |
| **Recurring ticket titles/descriptions** | Same incident repeating | Problem Management candidate |
| **Weekend/off-hours delayed response** | Coverage model gap | Staffing/on-call review |
| **Multiple C-* tickets linked to same master** | Systemic failure, not isolated | Root cause analysis needed |
| **State "Waiting" for extended periods** | Dependency on external action — architectural coupling | Dependency mapping |
| **Same team in multiple unrelated incidents** | Capacity or skill bottleneck | Capacity/training planning |
| **RFC→Incident correlation** | Changes causing incidents | Release quality improvement |

## Pattern Classification

When you identify a pattern, classify it using this taxonomy:

| Category | Description | Example |
|----------|-------------|---------|
| **Recurring Failure** | Same root cause, different instances | Job X fails every month-end |
| **Design Weakness** | Architecture enabling failure modes | Single point of failure in batch chain |
| **Process Gap** | Missing or broken operational process | No runbook for common failure |
| **Knowledge Deficit** | Resolution knowledge not captured | Same team solves same issue without KB |
| **Capacity Issue** | Resources insufficient for workload | DB locks during peak processing |
| **Integration Fragility** | Brittle interfaces between systems | API timeout causes cascading failures |
| **Vendor Dependency** | Over-reliance on external provider | Only one provider can resolve issue type |
| **Observability Gap** | Cannot detect or diagnose failures proactively | Issue found by user, not monitoring |

## ITIL Practice Alignment

Map your findings to ITIL 4 practices:

| Finding Type | ITIL 4 Practice | Action |
|--------------|-----------------|--------|
| Recurring failures | **Problem Management** | Promote to Problem records |
| Architectural gaps | **Continual Service Improvement (CSI)** | CSI register entries |
| Knowledge deficits | **Knowledge Management** | KB article candidates |
| RFC-correlated incidents | **Change Enablement** | Change process improvements |
| SLA divergences | **Service Level Management** | Service level review agenda |
| Resource issues | **Capacity Management** | Capacity planning inputs |

## What Makes a Good EA Finding

### High-Quality Finding Checklist
1. ✅ **Evidence**: Specific ticket data, chunk_ids, or pattern counts
2. ✅ **Impact**: Clear statement of service delivery or cost effect
3. ✅ **Scope**: Whether one-off or systemic
4. ✅ **Actionability**: Concrete recommendation for architecture/engineering
5. ✅ **Priority**: Based on frequency × impact × effort-to-fix

## Expected Output Structure

Your analysis should include:

1. **recurring_patterns** — Pattern findings with evidence and ITIL mapping
2. **architectural_gaps** — Layer-specific gaps with remediation guidance
3. **automation_opportunities** — Manual processes ready for automation
4. **cross_incident_insights** — Problem candidates, CSI items, vendor flags
5. **overall_assessment** — Maturity level, top risk, quick wins, strategic recommendations

## Usage

Apply this skill when analyzing incident data from the **Enterprise Architect view**. It will reframe your thinking from individual ticket resolution to systemic improvement.

## Related Skills

- [ITSM Expert System Prompt](../itsm-expert/SKILL.md)
- [Support Team Resolver](../support-team-resolver/SKILL.md)

