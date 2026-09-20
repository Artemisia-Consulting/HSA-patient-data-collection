# HSA Webapp — Assessment Rubric (3 Tiers)

Tier 1 = Basic / Not Yet Competent · Tier 2 = Meets Requirement / Competent · Tier 3 = Exceeds / Excellent

## A. Access & Identity

**1. Signup & Consent**
- T1: No signup flow, or requires info beyond email/basic details.
- T2: Email + basic details captured at signup as self-declared consent. No cross-check against survey needed.
- T3: T2 + clear consent language at signup, duplicate-email handling, graceful re-signup if a practitioner loses access.

**2. Persistent Access**
- T1: Practitioner must re-enter email every time they open the link.
- T2: Session persists on-device after first login; reopening the link goes straight to the log form.
- T3: T2 + personalized per-practitioner reminder links (unique ID in URL) that work even on a new device or cleared session.

## B. Daily Logging

**3. Onboarding**
- T1: No onboarding — practitioner is dropped straight into the log form with no context.
- T2: First-login screen explains what will be tracked daily (counts, category + condition) before Oct 1.
- T3: T2 + a quick preview/practice entry so the practitioner tries the flow once before go-live.

**4. Daily Log Speed & Usability**
- T1: Takes >60 secs, requires free text for core fields, or asks for patient names.
- T2: Takes <30 secs. Fields: date, #new, #follow-up, category/condition selection. Mobile usable.
- T3: T2 + one-tap submit, auto-fills yesterday's date, remembers preferences, offline save, <10 sec for a returning user.

**5. Condition Taxonomy (Category → Condition)**
- T1: Free text only, or a flat unstructured list with no categories.
- T2: 5 top-level categories, each with a searchable sub-list of conditions treated; multi-select; "Other (free text)" fallback; HIV/TB nested correctly under Communicable.
- T3: T2 + typeahead ranks common conditions first, category/condition still selectable within the 30-sec target even with a long sub-list, easy to extend the list later without a redeploy.

**6. Diagnosis Basis Flag**
- T1: No way to indicate how the practitioner arrived at the condition.
- T2: Per-condition flag (clinical diagnosis / patient-reported prior diagnosis / presenting complaint only), defaulting to the most common option.
- T3: T2 + doesn't add measurable time to entry, and the default is smart (e.g. remembers the practitioner's last choice) rather than a fixed placeholder.

**7. Referral / Co-management Flag**
- T1: No referral or concurrent-care field.
- T2: Per-condition toggle for "also seeing a GP/doctor" (Yes/No/Unsure) and optional "referred by a GP" (Yes/No/N/A).
- T3: T2 + this data is queryable/exportable on its own (not just stored), feeding directly into the impact/necessity analysis.

## C. Engagement

**8. Daily Reminders**
- T1: No reminder system.
- T2: Opt-in Mon–Fri (+ Sat toggle) via WhatsApp/Email, selectable time (default 18:00), one-tap personalized link.
- T3: T2 + snooze, "done for today," doesn't re-send if already logged, respects SA time zone.

## D. Technical & Performance

**9. Mobile Friendliness**
- T1: Not responsive, requires zooming, no mobile nav.
- T2: Fully responsive, touch targets >44px, tested on Android/iOS.
- T3: T2 + PWA installable, usable on poor connections, Lighthouse mobile score >90.

**10. Performance**
- T1: Lighthouse <70, load time >4s.
- T2: Lighthouse Performance/Accessibility/Best Practices all >85.
- T3: T2 + all categories >95, load <2s, no layout shift.

**11. Reliability / No Cold Start**
- T1: Site goes down after idle, cold start >5s.
- T2: Ping bot keeps the app alive, no cold start, uptime >99% during October.
- T3: T2 + health-check endpoint, status page, monitored, auto-restart on failure.

**12. API Quality**
- T1: Redundant endpoints, crashes on bad input.
- T2: No redundant endpoints, correct HTTP status codes, clear error messages for invalid input.
- T3: T2 + handles a basic load/stress test without crashing, input validated with tests, documented what is NOT tested.

## E. Compliance & Data

**13. POPIA Compliance & Privacy**
- T1: Collects patient names, IDs, or clinical notes.
- T2: Only aggregate counts and category-level data, no patient-identifiable info, anonymized practitioner IDs.
- T3: T2 + a visible privacy policy, data encrypted at rest, explains POPIA compliance in plain language.

**14. Researcher Dashboard & Export**
- T1: No dashboard — manual counting from raw data.
- T2: Dashboard shows anonymized totals, filters by date / new vs follow-up / category / condition / diagnosis basis / referral status, exports to CSV/Excel.
- T3: T2 + charts (daily/weekly trends, category breakdown, referral/co-management rate), role-based access (researcher-only).

## F. Process

**15. Bug Tracking & Documentation**
- T1: No bug log, no documentation.
- T2: Bug log exists, documents what is NOT tested, code is organized enough for a handoff.
- T3: T2 + short methodology write-up, issues linked back to the specific user story they relate to.

---

## Scoring

15 items × 3 points max = 45 points

- 15–24 = Redo — not ready for October
- 25–35 = Meets HSA standard — ready to launch
- 36–45 = Excellent — ready for HSA publication
