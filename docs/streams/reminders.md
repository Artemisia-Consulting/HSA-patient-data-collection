# Stream 3 — Reminders / engagement layer

The nudge layer that gets practitioners to open the app and log. It knows
*who* the practitioner is and *whether* they have logged today — nothing
about what they logged. No patient data, no condition data, no counts, at
any point in this stream.

- Scheduler: `scripts/reminders/run-scheduler.ts`
- Dispatch engine: `src/lib/reminders/dispatch.ts` + `schedule.ts`
- Channels: `src/lib/reminders/channels/{email,index}.ts` (email only — WhatsApp was removed before launch; it was never configured)
- Message bodies + personalised links: `src/lib/reminders/message.ts`
- Opt-in UI: `src/app/reminders/page.tsx` + `_components/**`
- HTTP surface: `src/app/api/reminders/{dispatch,preferences,snooze,done-today}/route.ts`
- Tests: `tests/reminders/**` plus `tests/backend/reminders-preferences.test.ts`

---

## 1. What was built, mapped to FR numbers

| Flow | FR | Notes |
| --- | --- | --- |
| Opt-in UI `/reminders?k=...` | FR7 | The page reads the `?k=` link key from the URL and threads it into every API call. Channel picker (Email / Off), time picker (default `18:00`), Saturday toggle (default off = Mon–Fri only). One save. Reached from the app menu and framed in `AppShell`. |
| One-off compulsory choice | FR7 | `/reminders?setup=1` — shown between the walkthrough and the log until `Practitioner.reminderChoiceAt` is set, never after. "No reminders" counts as an answer; "Decide later" leaves it unset and the question returns on the next fresh entry. The entry router, the walkthrough's finish and the Google sign-in handoff all funnel through this gate. |
| Preferences persistence | FR7 | `PUT /api/reminders/preferences` — validates channel + time + Saturday flag. Authenticated by session or `?k=`. The first deliberate save stamps `reminderChoiceAt`, whichever way it goes; later saves never move it. |
| Scheduler | FR7 | `scripts/reminders/run-scheduler.ts` — per-minute `node-cron` tick. Default mode POSTs `/api/reminders/dispatch` with `Authorization: Bearer <CRON_SECRET>`, so the same path a platform cron or external ping service would hit. `--in-process` runs `runDispatch()` directly for a single-process deploy. `--cron="*/5 * * * *"` overrides the cadence. |
| Dispatch decision | FR7 | For each opted-in practitioner, `decideDispatch()` returns `SEND`, `SKIP` (with a `SKIP_REASONS` code), or `DEFER` (not yet due). Suppression reasons: `ALREADY_LOGGED`, `MARKED_DONE`, `SNOOZED`, `NOT_OPTED_IN`, `NON_WORKING_DAY`. |
| "Already logged" check | FR7 | `daily-log-gateway.ts` — currently queries `prisma.dailyLog` directly. **Marked TO INTEGRATE**: at merge, swap for the backend's `hasLoggedOn(practitionerId, logDate)` / `practitionerIdsWithLogOn(logDate)` helpers from `src/lib/server/logs.ts` (see §7). |
| Multi-instance safety | FR7 | Every send is claimed against `@@unique([practitionerId, logDate, channel])` before it goes out, so two schedulers running at once cannot double-send. A second instance loses the race rather than firing twice. |
| Snooze / "Done for today" | FR7 | `POST /api/reminders/snooze` and `POST /api/reminders/done-today` — both authenticated by `?k=`. Persist a `DayOverride` row for today, which `decideDispatch()` reads on the next tick. Snooze adds a configurable defer; "done" suppresses for the rest of the day without requiring a log entry. |
| Personalised link | FR7, user story 2.1 | `buildLogLink(appUrl, reminderLinkId)` → `${APP_URL}/log?k=<reminderLinkId>`. Same `?k=` auth the frontend already accepts on every route, so a practitioner on a fresh device with no session taps the link and lands straight on the form. |
| Manage link | FR7 | `buildManageLink(appUrl, reminderLinkId)` → `${APP_URL}/reminders?k=<reminderLinkId>`. Same auth, lands on the opt-in / snooze / done panel. |
| Channels | FR7 | `channels/index.ts` is a registry; `channels/email.ts` (nodemailer, `SMTP_*` env vars) is the only adapter. An opted-in practitioner whose email cannot be resolved gets a recorded `FAILED` with the reason — there is no fallback channel to try. |
| POPIA in message bodies | FR7, POPIA | `message.ts` is compile-time safe: its inputs are `greetingName`, `logDate`, `link`, `manageLink` — nothing about a patient, condition or count can reach a message body because none of it is an input. `maskRecipient()` hides most of an email/phone before it reaches a log line. |

---

## 2. Suppression semantics, precisely

A dispatch tick considers every practitioner whose reminder preferences are
opted in. For each:

1. **Not a working day?** (Saturday but `includeSaturday === false`, or Sunday) → `SKIP / NON_WORKING_DAY`.
2. **Already logged today?** (per `daily-log-gateway`) → `SKIP / ALREADY_LOGGED`.
3. **Marked done for today?** (DayOverride `DONE` row for today) → `SKIP / MARKED_DONE`.
4. **Snoozed and snooze not yet expired?** (DayOverride `SNOOZED` row with `until > now`) → `SKIP / SNOOZED`.
5. **Due time not yet reached (SAST)?** → `DEFER` (reconsider on the next tick).
6. Otherwise → `SEND`, claim the unique row, dispatch through the chosen channel.

A `DEFER` is not a skip — it is silent and the next tick will re-evaluate.
A `SKIP` is terminal for the day unless the practitioner unsnoozes or the
override row is cleared.

---

## 3. Environment variables

| Var | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `message.ts`, `run-scheduler.ts` | Base for personalised links. |
| `CRON_SECRET` | `/api/reminders/dispatch`, `run-scheduler.ts` | Bearer token for the dispatch endpoint; constant-time compared via backend's `safeCompare` at integration (see §7). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | `channels/email.ts` | Real delivery; untested in this branch (see §5). |
| `DATABASE_URL` | all | SQLite in dev, Postgres in prod. |

---

## 4. Departures and decisions worth flagging

- **Per-minute tick rather than one cron entry per practitioner.** Reminder
  times are per-person and editable at any moment; snoozes create new due
  times mid-day. A minute tick that asks "who is due now?" has no schedule
  to keep in sync with the database, and a missed tick costs one minute of
  lateness rather than a whole day's reminders.
- **`?k=` auth on every reminders route**, not just the log form. The
  practitioner who gets a reminder on a new phone must be able to snooze or
  mark done without first signing up again.
- **Email is the only channel.** WhatsApp was built but never configured
  (no `WHATSAPP_*` env vars existed in any deployment), and the app told
  practitioners it could send WhatsApp — a promise it could not keep. It was
  removed rather than shipped: one channel that works beats two where one
  always fails. An opted-in practitioner who cannot be reached by email gets a
  recorded `FAILED` row with the reason instead of a silent fallback.
- **`reminderChoiceAt` answers "have we asked?"** `reminderChannel` defaults
  to `NONE`, so on its own it cannot tell "chose no reminders" from "never
  asked". A separate nullable timestamp stamps the first deliberate answer and
  is what the compulsory-choice gate keys on.
- **`maskRecipient` in log output.** `practitioner.email` is the only
  personal datum in the system and must not appear in scheduler stdout.

---

## 5. Bug log

| # | Severity | What | Fix |
| --- | --- | --- | --- |
| 1 | Low (tooling) | Same vitest Windows quirk as Streams 1 and 2 — `<npm\|npx> --prefix <dir> test` can fail with "Vitest failed to find the runner". | Use `node node_modules/vitest/vitest.mjs run` from inside the directory. Not a code defect. |
| 2 | Low | `next-env.d.ts` was dirty from a `next build` artefact. | `git restore next-env.d.ts` before commit; added to the commit script. |

---

## 6. What is NOT tested

- **No live email delivery test.** `channels/email.ts` constructs a
  `nodemailer` transporter and calls `sendMail`, but no test asserts that an
  email actually lands. The SMTP path is wired, not verified.
- **No end-to-end scheduler run against a real clock.** `schedule.ts` is
  tested with injected `now` values; the actual `node-cron` tick in
  `run-scheduler.ts` has never been run in this branch against a live
  database with the clock crossing a due time.
- **The snooze / done-today / dispatch HTTP routes are untested.** The
  engine is fully unit-tested and the preferences route has contract-level
  tests (`tests/backend/reminders-preferences.test.ts`), but the remaining
  three Next.js route handlers are not exercised.
- **The `daily-log-gateway.ts` direct-Prisma path is the current
  implementation, but it is the piece most likely to drift at merge** — see
  §7. Its tests use an in-memory SQLite schema that matches the locked
  Prisma schema, not the backend's helper signatures.

---

## 7. What I need at integration

These are the seams the backend handoff note (§7 of `docs/streams/backend.md`)
asks this stream to close:

1. **Replace `daily-log-gateway.ts`** with imports from
   `src/lib/server/logs.ts`:
   - `hasLoggedOn(practitionerId, logDate): Promise<boolean>`
   - `practitionerIdsWithLogOn(logDate): Promise<Set<string>>`
   The current direct-Prisma query works but duplicates logic that now
   lives in Stream 1's module. Use the helper; do not query
   `prisma.dailyLog` from this stream.
2. **Replace the local `resolvePractitioner` in `src/lib/reminders/auth.ts`**
   with the backend's `resolveAuth` from `src/lib/server/auth.ts`, which
   handles both session-cookie and `?k=` authentication uniformly.
3. **Replace any local secret comparison with `safeCompare(a, b)`** from
   `src/lib/server/auth.ts` for the `CRON_SECRET` check on
   `/api/reminders/dispatch`. Constant-time, no home-grown string equals.
4. **Re-point `src/lib/server/recovery.ts` (Stream 1) at this stream's
   email adapter**, then delete Stream 1's temporary nodemailer sender.
   Stream 1 kept a minimal sender only so signup recovery links would work
   in isolation; at merge the real adapter lives here.
5. **Personalised link format must match** the backend's
   `buildReminderLink()` in `src/lib/server/serialise.ts`:
   `${NEXT_PUBLIC_APP_URL}/log?k=<reminderLinkId>`. The `buildLogLink()`
   in `src/lib/reminders/message.ts` already produces this shape using the
   contract's `REMINDER_LINK_QUERY_PARAM`; at merge, confirm both sides
   still agree rather than letting them drift.

---

## 8. Running it

From inside this directory (the working invocation on Windows):

```
node node_modules/vitest/vitest.mjs run     # reminder engine tests
npm run typecheck
```

To run the scheduler once, dry-run style:

```
npx tsx scripts/reminders/dispatch-once.ts   # one tick, prints what would fire
```

To run the scheduler as a long-running process:

```
npx tsx scripts/reminders/run-scheduler.ts             # POST /api/reminders/dispatch every minute
npx tsx scripts/reminders/run-scheduler.ts --in-process # call runDispatch() directly
npx tsx scripts/reminders/run-scheduler.ts --cron="*/5 * * * *"
```

For the dispatch endpoint to accept the scheduler's bearer token, set
`CRON_SECRET` in `.env` to the same value the scheduler reads.
