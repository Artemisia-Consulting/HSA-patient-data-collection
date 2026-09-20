# Requirements

## Functional Requirements (October Webapp)

| # | Requirement | Detail |
| --- | --- | --- |
| FR1 | Signup & persistent access | Practitioner signs up once by email (self-declared consent, no cross-check against the survey). Session persists on-device after first login. Daily reminder links carry a unique per-practitioner ID so identification still works after a cleared session or on a new device. |
| FR2 | Onboarding | First-login screen tells the practitioner what they'll track daily (counts, category + condition) so they're ready before Oct 1. |
| FR3 | Daily quick entry | Date (auto-filled, editable), # new patients, # follow-up patients. No patient names. One-tap submit with confirmation. Target: <30 seconds. |
| FR4 | Diagnosis taxonomy | 5 top-level categories, each with a searchable/typeahead sub-list of conditions treated (not symptoms). Multi-select per entry. "Other (free text)" fallback per category. |
| FR5 | Diagnosis basis flag | Each logged condition tagged: practitioner's own clinical diagnosis / patient-reported prior diagnosis / presenting complaint only. Defaults to the most common option, editable. |
| FR6 | Referral / co-management flag | Per condition: "Also seeing a GP/doctor for this?" (Yes/No/Unsure) and optional "Referred by a GP?" (Yes/No/N/A). |
| FR7 | Daily reminders | Opt-in via WhatsApp/Email, Mon–Fri + optional Sat, selectable time (default 18:00), snooze / mark-done-for-today, personalized one-tap link. |
| FR8 | Researcher dashboard | View all submissions, export CSV/Excel, filter by date / new vs follow-up / category / condition / diagnosis basis / referral status, anonymized practitioner IDs only, basic charts (daily/weekly totals, category breakdown, referral rate). |

## Non-Functional / Technical Requirements

| Area | Requirement |
| --- | --- |
| POPIA compliance | No patient-identifiable info collected — aggregate counts only. Anonymized practitioner IDs. Consent = self-declared at signup. |
| Mobile | Fully responsive, hamburger nav, touch targets >44px, tested on Android/iOS, PWA-installable. |
| Performance | Works on poor data connections, no cold start, Lighthouse Performance/Accessibility/Best Practices >85 target. |
| Reliability | Ping bot keeps the app alive (avoid serverless cold starts), uptime target >99% during October, health-check endpoint. |
| API quality | No redundant endpoints, correct HTTP status codes, clear error messages for bad input. |
| Stack (suggested) | Simple PWA — e.g. Next.js + Supabase/Firebase — open to change. |

## Diagnosis Taxonomy — 5 Categories

HIV and TB are searchable sub-items under Communicable (Infectious) Diseases, not their own top-level category (confirmed by product owner).

| Category | Example sub-conditions (starter list) |
| --- | --- |
| Mental Health | Anxiety, depression, stress-related presentations, sleep disorders, migraine, epilepsy |
| Women's Health & Hormones | Pregnancy-related complaints, hormonal/reproductive health, paediatric illness (non-infectious) |
| Communicable (Infectious) Diseases | Acute respiratory infections, TB, HIV-related/opportunistic infections, STIs, GI infections, vector-borne disease, parasitic infections, vaccine-preventable illness, skin/soft-tissue infections, post-viral syndrome |
| Non-Communicable / Chronic Diseases | Cardiovascular, diabetes/metabolic syndrome, chronic respiratory disease, autoimmune conditions, chronic pain/musculoskeletal, cancer (supportive/palliative) |
| Other | Allergies, digestive (non-infectious, e.g. IBS, reflux), injury/trauma follow-up, preventive care/wellness, other (free text) |

Each category needs a searchable/typeahead sub-list; multi-select for patients with more than one condition treated; "Other (free text)" as fallback within every category.

## Out of Scope

- Patient names, ID numbers, or clinical notes
- Billing or integration with practice-management software
- Free-text-only diagnosis entry (must be tick/select-based for speed, with an "Other" fallback)
- Cross-checking webapp signup against the survey's consent list (self-declared consent is sufficient)
