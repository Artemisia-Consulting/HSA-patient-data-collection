# HSA Patient Data Collection App – Project Brief

2026-09-20 · @Someone

## Background & Problem

The Homoeopathic Association of South Africa (HSA) has no reliable national data on how many patients homeopathic practitioners see, or what they're treated for. Practitioners may not have 2023–2026 numbers readily available from invoicing or bookkeeping records.

**Fallback plan:** if historical data can't be pulled, run a nationwide live data collection in October, where practitioners log daily numbers in under 30 seconds after work.

Two instruments are needed: a retrospective survey (2023– present) and a live daily-logging webapp (October).

## Objectives

1. Collect retrospective patient-volume data (2023–present) via survey — **yearly totals are the priority metric**; monthly detail is optional/nice-to-have, not a blocker.
2. Where retrospective data is unavailable, collect prospective data via a daily-log webapp in October.
3. Make daily entry fast (<30 sec), mobile-friendly, and POPIA-compliant (no patient-identifiable data).
4. Capture enough context per entry (referral, co-management, diagnosis basis) to speak to the business question below, not just raw volume.

## Users

| Role | Who | Does what |
| --- | --- | --- |
| Respondent | Homeopathic practitioner in South Africa | Completes the yearly survey (with consent) and/or logs daily patient counts in the webapp during October |
| Researcher | HSA research team | Collates survey + webapp data, exports for the HSA report |

## Scope

**Phase 1 — Retrospective Survey (built separately, on Google Forms; reference only)** Captures yearly (priority) and monthly (optional) new/follow-up patient counts for 2023–present, auto-calculated totals, guidance on where to find the numbers, a pre-survey "what you'll need" warning, self-declared consent (email) for webapp participation, and the impact/necessity questions (referral, concurrent GP care). Owned by the product owner; will be built within 2–3 days of this brief.

**Phase 2 — Webapp: October Live Data Collection (this build)** A mobile-first daily-logging tool for October. Practitioner signs up once by email (self-declared consent, no cross-check against the survey), then logs daily new/follow-up counts and the conditions treated that day against a 5-category taxonomy, with a referral/co-management flag and a diagnosis-basis flag per condition. Includes daily reminders and a researcher dashboard.

The two phases are kept as **separate flows under one identity** rather than one combined form — they run on different rhythms (one long-form annual entry vs. a 30-second daily habit) — but should ultimately produce one mergeable dataset per practitioner.

*Out of scope:* patient names/ID numbers/clinical notes, billing integration, free-text-only diagnosis entry. Full requirement detail is in the Requirements tab.

## Business Goal

Beyond raw volume, the underlying question is: **how many people use homeopaths, and what impact do homeopaths make within the broader medical system — are they necessary?**

To speak to this, data collection (mainly the survey, but partly the webapp) captures whether a patient was referred by a GP, whether they're also seeing a GP concurrently for the same condition, and — where practitioners can judge it — whether the patient would otherwise have sought conventional care. This reframes the dataset from "how many patients" to "how homeopathic care sits alongside or instead of the formal health system," which is the more publishable finding for a health authority.

## Deliverables

1. Live URL for the October webapp
2. Source code in GitHub
3. Bug log + "what we are NOT testing" document
4. Methodology report for HSA

## Timeline

| Milestone | Date |
| --- | --- |
| Survey built | ~2–3 days after this brief |
| Webapp build/test | Now – 30 Sept 2026 |
| Go live | 1 Oct 2026 |
| Collection ends | 31 Oct 2026 |

## Open Items

None remaining as of this version — all prior open items (access method, HIV/TB placement, diagnosis basis flag) have been resolved with the product owner. See the User Stories tab for the resolutions.
