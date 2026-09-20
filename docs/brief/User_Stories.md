# User Stories

## Epic 1: Retrospective Survey (built separately — reference only)

**1.1 — Yearly Patient Volume (Primary).** As a researcher, I want yearly totals of new and follow-up patients (2023–present) as the primary data point, so that I have reliable national trend data even if monthly detail isn't available.

**1.2 — Monthly Patient Volume (Optional).** As a researcher, I want monthly new/follow-up numbers where a practitioner has them, so that I can get finer-grained trends without making it a blocker for respondents.

**1.3 — Total Auto-Calculation.** As a researcher, I want totals auto-calculated (New + Follow-up), so that I avoid manual errors and can validate submitted numbers.

**1.4 — Data Source Guidance.** As a respondent, I want guidance on where to find my numbers (invoicing, bookkeeping, appointment records), so that I can complete the survey accurately.

**1.5 — Pre-Survey Preparation Warning.** As a respondent, I want to see upfront what information I'll need to gather before I start the survey, so that I'm not stopped partway through and can prepare in advance.

**1.6 — Consent Capture.** As a researcher, I want to capture practitioner consent for webapp participation within this survey, so that only consenting practitioners can access the October webapp. *(Resolved: consent is self-declared — the practitioner separately signs up with their email in the webapp; no cross-check between the two.)*

**1.7 — Impact & Necessity Data.** As a researcher, I want to know whether patients were referred by a GP, are also seeing a GP concurrently, or would otherwise have sought conventional care, so that I can assess homeopaths' role and impact within the broader medical system.

## Epic 2: Webapp — October Live Data Collection (final, all items resolved)

**2.1 — Practitioner Signup & Persistent Access.** As a respondent, I want to sign up once with my email and then access daily logging without re-entering it every time, so that logging stays fast and frictionless.

- [ ] Email + basic details captured at signup = self-declared consent (no cross-check needed)
- [ ] Session persists on-device after first login — reopening the link goes straight to the log form
- [ ] Daily reminder links are personalized per practitioner (unique ID in URL), so identification still works on a new device or cleared session

**2.2 — Onboarding / What You'll Need.** As a respondent, I want a short onboarding screen the first time I log in, telling me what I'll be tracking daily, so that I'm prepared before October 1st.

**2.3 — Daily Quick Entry (Core).** As a respondent, I want to log my daily patient numbers in under 30 seconds after work, so that nationwide data can be collected even without historical records.

- [ ] Date (auto-filled, editable)
- [ ] # New patients, # Follow-up patients
- [ ] No patient names — POPIA compliant, counts only
- [ ] Works on mobile, one-tap submit with confirmation

**2.4 — Condition Category → Specific Condition Treated.** As a respondent, I want to select one of 5 broad categories and then the specific condition(s) I treated within it, so that I can log my day's work quickly and accurately without free text.

- [ ] 5 top-level categories: Mental Health; Women's Health & Hormones; Communicable (Infectious) Diseases; Non-communicable/Chronic Diseases; Other
- [ ] Each category has a searchable/typeahead sub-list of conditions
- [ ] HIV and TB sit as searchable sub-items within Communicable (Infectious) Diseases — not top-level categories
- [ ] Multi-select — if multiple conditions were treated that day, tick all that apply
- [ ] "Other (free text)" fallback within each category
- [ ] Selection still achievable within the 30-second target

**2.5 — Diagnosis Basis Flag.** As a researcher, I want each logged condition tagged with how the practitioner arrived at it, so that the dataset's clinical basis is clear to anyone reviewing it.

- [ ] Single-select flag per condition line: "My clinical diagnosis" / "Patient-reported prior diagnosis" / "Presenting complaint / symptom picture only"
- [ ] Defaults to the most common option, editable, to avoid slowing entry down

**2.6 — Referral / Co-management Flag.** As a researcher, I want to know whether the patient is also under conventional medical care for the same condition, so that I can assess whether homeopaths operate alongside or instead of the formal health system.

- [ ] Toggle per condition line: "Also seeing a GP/medical doctor for this?" (Yes / No / Unsure)
- [ ] Optional sub-flag: "Referred by a GP?" (Yes / No / N/A)

**2.7 — Daily Reminders.** As a respondent, I want a reminder Mon–Fri (and Sat if I work Saturdays), so that I don't forget to log.

- [ ] Opt-in via WhatsApp/Email, selectable time (default 18:00)
- [ ] Saturday toggle, personalized one-tap link to log page, snooze / mark-done-for-today

**2.8 — Researcher Dashboard.** As a researcher, I want a dashboard of all October submissions, so that I can export and analyze for the HSA report.

- [ ] Export to CSV/Excel
- [ ] Filter by date, new vs. follow-up, category/condition, diagnosis basis, referral status
- [ ] Anonymized practitioner IDs only
- [ ] Basic charts: daily/weekly totals, category breakdown, referral/co-management rate
