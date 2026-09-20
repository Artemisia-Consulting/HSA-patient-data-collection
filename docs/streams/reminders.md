# Stream 3 — Reminders / engagement layer

The nudge layer that gets practitioners to open the app and log. It knows
*who* the practitioner is and *whether* they have logged today — nothing
about what they logged. No patient data, no condition data, no counts, at
any point in this stream.

- Scheduler: `scripts/reminders/run-scheduler.ts`
- Dispatch engine: `src/lib/reminders/dispatch.ts` + `schedule.ts`
- Channels: `src/lib/reminders/channels/{email,whatsapp,index}.ts`
- Message bodies + personalised links: `src/lib/reminders/message.ts`
- Opt-in UI: `src/app/reminders/page.tsx` + `_components/**`
- HTTP surface: `src/app/api/reminders/{dispatch,preferences,snooze,done}/route.ts`
- Tests: `tests/reminders/**` — 4 files, 62 tests

---

## 1. What was built, mapped to FR numbers

| Flow | FR | Notes |
| --- | --- | --- |
| Opt-in UI `/reminders?k=...` | FR7 | Server component reads the `?k=` link key from the URL, resolves the practitioner, and hands the form a pre-filled `ReminderPreferences`. Channel picker (Email / WhatsApp / Off), time picker (default `18:00`), Saturday toggle (default off = Mon–Fri only). One save. |
| Preferences persistence | FR7 | `PUT /api/reminders/preferences` — validates channel + time + Saturday flag + optional WhatsApp MSISDN. Authenticated by `?k=` only (no session cookie required). |
| Scheduler | FR7 | `scripts/reminders/run-scheduler.ts` — per-minute `node-cron` tick. Default mode POSTs `/api/reminders/dispatch` with `Authorization: Bearer <CRON_SECRET>`, so the same path a platform cron or external ping service would hit. `--in-process` runs `runDispatch()` directly for a single-process deploy. `--cron="*/5 * * * *"` overrides the cadence. |
| Dispatch decision | FR7 | For each opted-in practitioner, `decideDispatch()` returns `SEND`, `SKIP` (with a `SKIP_REASONS` code), or `DEFER` (not yet due). Suppression reasons: `ALREADY_LOGGED`, `MARKED_DONE`, `SNOOZED`, `NOT_OPTED_IN`, `NON_WORKING_DAY`. |
| "Already logged" check | FR7 | `daily-log-gateway.ts` — currently queries `prisma.dailyLog` directly. **Marked TO INTEGRATE**: at merge, swap for the backend's `hasLoggedOn(practitionerId, logDate)` / `practitionerIdsWithLogOn(logDate)` helpers from `src/lib/server/logs.ts` (see §7). |
| Multi-instance safety | FR7 | Every send is claimed against `@@unique([practitionerId, logDate, channel])` before it goes out, so two schedulers running at once cannot double-send. A second instance loses the race rather than firing twice. |
| Snooze / "Done for today" | FR7 | `POST /api/reminders/snooze` and `POST /api/reminders/done` — both authenticated by `?k=`. Persist a `DayOverride` row for today, which `decideDispatch()` reads on the next tick. Snooze adds a configurable defer; "done" suppresses for the rest of the day without requiring a log entry. |
| Personalised link | FR7, user story 2.1 | `buildLogLink(appUrl, reminderLinkId)` → `${APP_URL}/log?k=<reminderLinkId>`. Same `?k=` auth the frontend already accepts on every route, so a practitioner on a fresh device with no session taps the link and lands straight on the form. |
| Manage link | FR7 | `buildManageLink(appUrl, reminderLinkId)` → `${APP_URL}/reminders?k=<reminderLinkId>`. Same auth, lands on the opt-in / snooze / done panel. |
| Channels | FR7 | `channels/index.ts` is a registry keyed by channel; `channels/email.ts` uses `nodemailer` with `SMTP_*` env vars; `channels/whatsapp.ts` uses the Meta Cloud API (Graph v21.0) with `WHATSAPP_*` env vars, supporting both template and plain-text modes. Unknown/unsupported channels fall back to email. |
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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | `channels/email.ts` | Real delivery; untested in this branch (see §5). |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` | `channels/whatsapp.ts` | Meta Cloud API. Live send path is untested (see §5). |
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
- **Channel fallback to email.** If a practitioner's chosen channel is
  unknown or the registry does not have a handler, the dispatch falls back
  to email rather than silently dropping.
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
- **No live WhatsApp / Meta API test.** `channels/whatsapp.ts` hits the
  Graph v21.0 endpoint; nothing in the suite exercises a real send. Template
  rendering and plain-text fallback are unit-tested for shape, not for
  delivery.
- **No end-to-end scheduler run against a real clock.** `schedule.ts` is
  tested with injected `now` values; the actual `node-cron` tick in
  `run-scheduler.ts` has never been run in this branch against a live
  database with the clock crossing a due time.
- **No test of the `/api/reminders/*` HTTP routes.** The dispatch engine,
  preferences store, snooze and done handlers are unit-tested; the Next.js
  route handlers that wire them to HTTP are not.
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
node node_modules/vitest/vitest.mjs run     # 62 reminder tests
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
