# Stream 1 — Backend

Every HTTP endpoint in `src/lib/contract/api.ts`, the server helpers behind them,
and the backend test suite. Written against the locked contract; the contract was
not modified.

- Routes: `src/app/api/{auth,logs,taxonomy,dashboard,health}/**/route.ts` (11 handlers)
- Helpers: `src/lib/server/*.ts` (10 modules)
- Tests: `tests/backend/**` — 111 tests, 6 files, all passing (`npm test`)
- Not created: `src/app/api/reminders/**` (Stream 3's)

---

## 1. What was built, mapped to FR numbers

| Endpoint | Method | FR | Notes |
| --- | --- | --- | --- |
| `/api/auth/signup` | POST | FR1, FR2 | Self-declared consent (`consent: true` is the consent record, stored as `consentAt`). Email is trimmed + lowercased before the uniqueness check. Returns 201 + session + `reminderLink`. Duplicate → 409 `EMAIL_ALREADY_REGISTERED` (see §3.1). |
| `/api/auth/resume` | POST | FR1 | Authenticates by `reminderLinkId` alone and issues a fresh session. This is what makes a reminder link work on a new device with no cookie. |
| `/api/auth/me` | GET | FR1, FR2, FR3 | Returns the practitioner, `today` (SAST, server-computed — never the device clock) and `hasLoggedToday`. |
| `/api/auth/onboarded` | POST | FR2 | Idempotent; keeps the first `onboardedAt`. Returns the `me` shape so the client needs no follow-up request. |
| `/api/taxonomy` | GET | FR4 | Served from the `Condition` table, not the TS file. Unauthenticated (the signup screen preloads it). ETag = content hash of every active row; `304` on match; `public, max-age=300, stale-while-revalidate=86400`. Adding a row to the table changes `version` and the ETag with no redeploy. |
| `/api/logs/:date` | GET | FR3 | The caller's own log for that date, or 404. |
| `/api/logs/:date` | PUT | FR3, FR4, FR5, FR6 | Upsert by `(practitionerId, logDate)` in a transaction — one row per practitioner per day, editable all month. Condition codes are validated against the live taxonomy table (exists / still active / category matches). 201 on first write, 200 on edit. |
| `/api/logs` | GET | FR3 | The caller's own days, newest first. |
| `/api/dashboard/summary` | GET | FR8 | Totals, daily series, category breakdown, diagnosis-basis breakdown, GP co-management counts. RESEARCHER only. |
| `/api/dashboard/entries` | GET | FR8 | One row per condition entry, paginated, all filters. RESEARCHER only. |
| `/api/dashboard/export` | GET | FR8 | Same rows as CSV. RESEARCHER only. |
| `/api/health` | GET | NFR (reliability) | Unauthenticated, one trivial query, `no-store`. |

Not backend scope, but relied on by Stream 3: `hasLoggedOn`, `hasLoggedToday`,
`practitionerIdsWithLogOn` in `src/lib/server/logs.ts` (§7).

### Auth resolution order

Implemented in `src/lib/server/auth.ts` (`resolveAuth`), exactly as the contract
specifies:

1. `Authorization: Bearer <token>`, else the `hsa_session` cookie.
2. If that yields nothing — or the token is unknown or expired — `?k=<reminderLinkId>`.
3. A valid `k` with no session **issues a session** and sets the cookie on the way
   out (`attachSession`). Verified live: `GET /api/auth/me?k=…` with no cookie
   returns 200 and a `Set-Cookie`.

Tokens are 32 random bytes, base64url. Only the SHA-256 hash is stored
(`Session.tokenHash`); the plaintext is returned once at issue and then only ever
lives in the client's cookie. `lastSeenAt` is refreshed at most hourly to avoid a
write on every request.

### POPIA

Structural, not procedural:

- Dashboard and export queries never `select` `email`. The Prisma select is
  `practitioner: { select: { id: true, province: true } }`, so the column is not
  in memory on that path, let alone serialised.
- Every outgoing payload is parsed through its contract schema by
  `jsonResponse()`. `z.object` strips unknown keys, so a future careless spread
  cannot leak a field the contract does not name.
- Condition free text is dropped server-side for any code that is not an
  `__OTHER` row (`validateConditionEntries`). Free text is the one place
  patient-identifying data could enter; there is no route by which arbitrary text
  attaches to a normal condition.
- Two tests assert the serialised dashboard JSON and the CSV contain no `@`
  character at all.

### Error handling

One envelope everywhere (`apiErrorSchema` + `API_ERROR_CODES`). `withRoute()`
wraps every handler: `ApiException` → its status; anything else is logged
server-side and returned as a generic 500 `INTERNAL_ERROR` with no internals in
the message. Validation failures return dotted field paths
(`conditions.0.conditionOther`) so the frontend can address the input that failed.

Rate limiting: signup 20/hour and resume 30/15min per client IP
(`src/lib/server/rateLimit.ts`), returning 429 `RATE_LIMITED` with
`retryAfterSeconds`.

---

## 2. Contract compliance

No endpoint, field name, status code or enum value was changed. Request bodies
are parsed with the exported schemas; responses are validated against them before
they are sent, so a drift between this stream and the contract fails loudly
(500 in dev, and a test failure) rather than silently shipping a wrong shape.

---

## 3. Departures and decisions worth flagging

Nothing here contradicts the contract; these are the places it left a choice and
the reasoning is not obvious from the code.

**3.1 Duplicate email returns 409 *and* emails the access link.**
The brief calls for a practitioner who lost access to recover rather than be
stonewalled. Simply logging in whoever types a known address would make the email
address a credential — a colleague's address would be enough to read and write
their data. So: the 409 body tells the user their account exists and an access
link has been sent out of band to the address on file
(`src/lib/server/recovery.ts`). There is one exception — if the caller *already
proves* they are that practitioner (a live session, or the personalised link in
`?k=`), signup is treated as a details update and returns 200 with a session.
Email alone never yields a session.

**3.2 `GET /api/logs` takes no parameters.**
It is scoped to the caller by construction, so there is no version of the request
that returns another practitioner's days. The collection window is 31 days, so it
is unpaginated (a `take: 200` cap exists only to bound pre-launch test rows).

**3.3 `POST /api/auth/onboarded` returns the `me` payload.**
The contract names `meResponseSchema` for it. Deliberate: it saves a round trip
on a phone on a bad connection, and avoids a redundant "onboarding status"
endpoint (rubric item 12).

**3.4 `/api/health` always returns HTTP 200; the state is in the body.**
The endpoint exists to defeat cold starts, and a ping bot that sees a 500 may
back off or alert on the wrong thing. `status` and `database` carry the real
state, so a monitor alerts on the body. If you would rather have a non-200 on DB
failure, that is a one-line change in `src/app/api/health/route.ts`.

**3.5 Dashboard filter semantics**, decided once and applied centrally in
`src/lib/server/dashboard.ts`:

- `patientType=new|followup` filters *rows* (keeps days where that count is > 0)
  and does not zero the other column — the totals stay the real totals for the
  days in scope.
- Entry-level filters (`category`, `conditionCode`, `diagnosisBasis`,
  `alsoSeeingGp`, `referredByGp`) scope both which days are in range and which
  entries are counted: a day is in range if one of its entries matches, and only
  matching entries are counted.
- `totals.practitioners` is deliberately **unfiltered** — it is the participation
  denominator ("12 of 30 practitioners reported"), so it must be everyone.
- `totals.logDays` counts `DailyLog` rows in scope, not distinct calendar dates.
- A day with counts but no itemised conditions still produces one export row,
  with null condition columns. Those days must not vanish from the export.
- `conditionLabel` carries the practitioner's "Other" free text when the code is
  an `__OTHER` row, and the taxonomy label otherwise.

**3.6 Export is unpaginated and streamed as one string.** A researcher exporting
a filtered slice expects the whole slice, not page 1. See §5 for the size caveat.

**3.7 CSV hardening.** RFC 4180 quoting, CRLF, UTF-8 BOM (so Excel opens it as
UTF-8), and formula-injection neutralisation: a value starting `=`, `+`, `-`,
`@`, tab or CR is prefixed with `'`. Free text from the "Other" field is the
untrusted input here.

**3.8 `src/lib/server/recovery.ts` contains a minimal nodemailer sender.**
Stream 3 owns the email channel. I needed one message (the access link) before
that adapter exists, so this is a lazily-imported, 5-second-timeout, best-effort
sender that no-ops (and logs the link in dev only) when SMTP is unconfigured.
**At integration this should be re-pointed at Stream 3's channel adapter and this
file deleted.** It is marked as such in its header comment.

**3.9 Rate limiting is in-process.** A fixed window in a `Map`. It resets on
redeploy and is per-instance, so on multiple instances the effective limit
multiplies. Adequate for a single-instance October deployment; if this is scaled
out, move it to the database or a shared store.

---

## 4. Bug log

| # | Severity | What | Fix |
| --- | --- | --- | --- |
| 1 | Medium | `src/lib/server/taxonomy.ts` contained four **raw NUL bytes** (used as separators in the version-hash template literal). Git classified the file as binary, so diffs and merges of it would have been unreviewable for the integration lead. Found by a `grep` that reported "binary file matches". | Replaced with ` ` escapes. Byte-identical hash input, so the taxonomy `version`/ETag is unchanged; suite still green. |
| 2 | Medium | Every write test 422'd. The real date is 2026-09-20 — *before* the collection window — so `assertWritableDate` correctly refused every fixture. | `vi.useFakeTimers({ toFake: ['Date'] })` + `setSystemTime('2026-10-15T10:00+02:00')` in `logs.test.ts`, keeping real timers so Prisma promises still settle. Worth remembering: **the whole app refuses writes until 1 October.** |
| 3 | Low | BOM assertion failed even though the BOM was present: `Response.text()` strips a leading BOM per the fetch spec. | Assert at byte level via `arrayBuffer()` → `[0xef, 0xbb, 0xbf]`. Comment left in the test so nobody "fixes" it back. |
| 4 | Low | Dashboard filter parsing threw a custom error carrying a raw `Response`, inconsistent with every other route. | Refactored mid-build to throw `ApiException` with `fieldErrorsFromZod`. |
| 5 | Low (tooling) | `prisma migrate diff --to-schema-datamodel` no longer exists in Prisma 7. | Used `--to-schema prisma/schema.prisma` to generate `tests/backend/helpers/schema.sql`. |
| 6 | Low (tooling) | `file::memory:?cache=shared` → `SQLITE_CANTOPEN` with the better-sqlite3 adapter. | Plain `:memory:`, one database per test worker. |
| 7 | Low (tooling) | Vitest would not start: `Cannot find native binding … @rolldown/binding-wasm32-wasi`. The committed lockfile was generated on another platform and npm's optional-dependency resolution skipped the Windows binary. | `npm install --no-save --no-package-lock @rolldown/binding-win32-x64-msvc@1.2.9`. `package.json` and `package-lock.json` are locked and were **not** modified. Any other Windows machine will need the same one-off; on Linux/macOS CI it does not arise. |
| 8 | Cosmetic | `next dev` rewrites `next-env.d.ts` to point at `.next/dev/types` and generates `AGENTS.md` / `CLAUDE.md` at the repo root. | Reverted / deleted before committing — three streams running `next dev` would otherwise each commit a conflicting version. `npm run build` restores the build variant of `next-env.d.ts`. |

No bug was found in the contract itself.

---

## 5. What is NOT tested

Specifically, so nobody reads 111 passing tests as more coverage than it is.

**Runtime and integration**

- Tests import route handlers and call them as plain functions. **Nothing in the
  automated suite goes through the Next.js router.** Route-file conventions,
  the `params: Promise<…>` contract, middleware and real `Set-Cookie` round trips
  are exercised only by the manual smoke test I ran against `npm run dev`
  (health, taxonomy + 304, signup, duplicate signup, `me` by bearer / by `?k=` /
  anonymous, resume valid + invalid, log GET 404, PUT 422 outside window, bad
  date 400, dashboard 403 as practitioner, summary/entries/export as researcher,
  CSV BOM and quoting). That was one pass by hand, not a regression test.
- **No browser, no frontend, no end-to-end test.** The moment Stream 2's client
  calls these endpoints is the first time the pair is exercised together.
- Cookie attributes in production mode (`Secure`) are not asserted; `NODE_ENV` is
  never `production` in the suite.

**Database**

- Everything runs on **SQLite in memory**. There is no Postgres test. No
  SQLite-only feature is used, but collation and ordering, unique-constraint
  error surfaces and transaction isolation will differ. Re-run the suite against
  Postgres before switching the provider.
- **No concurrency testing.** Two simultaneous `PUT /api/logs/:date` for the same
  day, or a signup racing itself on the same email, are untested — the test
  database is a single connection. The upsert is in a transaction and the unique
  constraint is the backstop, but the 409-vs-500 behaviour of a真 race is unverified.
- `tests/backend/helpers/schema.sql` is a **committed snapshot** of the Prisma
  schema. If `prisma/schema.prisma` ever changes, that file must be regenerated
  or the suite silently tests the old shape. That is the one maintenance rule of
  the test setup.

**Auth**

- Session expiry is tested by writing an already-expired row, not by advancing
  120 days. Clock skew and timezone behaviour around the expiry boundary are
  untested.
- The hourly `lastSeenAt` refresh throttle is not directly tested.
- Rate limiting is unit-tested (window, limit, per-key isolation) but **not**
  tested through the routes, and its `x-forwarded-for` key is trivially spoofable
  by a direct caller — it is a courtesy limit, not a security control. The
  5000-entry sweep path is untested.

**Email / recovery**

- `sendAccessLink` is never exercised against a real SMTP server. Tests run with
  `SMTP_HOST` blank, so **only the "not delivered" branch is covered.** The
  nodemailer import, the 5-second timeout and the delivery-failure path have
  never executed. This matters because it is the entire account-recovery story
  (§3.1): if SMTP is misconfigured in production, a locked-out practitioner gets
  the fallback message and nothing else.

**Dashboard / export**

- The export is built as one string in memory and has been tested with a handful
  of rows. 30 practitioners × 31 days × several conditions is small, so this is
  fine in practice — but there is **no test at realistic or adversarial volume**
  and no streaming. If the dataset were an order of magnitude larger than
  planned, this would need `ReadableStream`.
- Chart-shaped output (`byDate`, `byCategory`) is asserted for correctness of
  counts, not for gaps: **dates with no logs at all are absent from `byDate`**
  rather than zero-filled. Stream 2 should not assume a contiguous series.
- Known edge case, deliberately left: a practitioner whose `role` is flipped to
  `RESEARCHER` is counted in `practitionersReporting` (they have logs) but not in
  `practitioners` (which counts `role = PRACTITIONER`), so the denominator can be
  the smaller number for that one account. Real practitioners are unaffected.

**Non-functional**

- No load test, no performance measurement, no Lighthouse run, no uptime
  verification. The health endpoint is tested for shape and cache headers, not
  for behaviour during an actual database outage (`database: 'error'` is
  reachable in code but never asserted).
- No security review beyond the above: no CSRF testing (the session cookie is
  `SameSite=Lax` and all mutating endpoints are JSON `POST`/`PUT`, but nothing
  asserts that), no header/CSP hardening, no dependency audit.

---

## 6. Running it

```
npm install
cp .env.example .env
npx prisma db push
npm run db:seed        # taxonomy only; never touches practitioner or log data
npm run dev
npm test               # 111 backend tests
npm run typecheck
npm run build
```

`npm rebuild better-sqlite3` if Prisma cannot find `better_sqlite3.node`.
On Windows, see bug 7 if Vitest will not start.

`vitest.config.ts` is at the repo root and is **not** owned by one stream — all
three need it. It is deliberately generic (node environment, `tests/**`,
`@` → `src`). A frontend test needing a DOM should add an environment override
rather than replace the file. **Expect a merge conflict here** and resolve it by
union, not by taking one side.

There is no seeded RESEARCHER account. To reach the dashboard locally, flip a
practitioner's `role` to `RESEARCHER` (Prisma Studio, or one `update` call).
Promotion is deliberately not an endpoint — signup ignores a `role` smuggled into
the body, and there is a test for that.

---

## 7. What I need at integration

**From Stream 3 (reminders):**

- Use the exposed helpers rather than querying `prisma.dailyLog` directly, as
  `docs/OWNERSHIP.md` requires:
  - `hasLoggedToday(practitionerId): Promise<boolean>`
  - `hasLoggedOn(practitionerId, logDate): Promise<boolean>`
  - `practitionerIdsWithLogOn(logDate): Promise<Set<string>>` — one query for the
    whole cohort; use this for the nightly sweep, not N calls to `hasLoggedToday`.
- `safeCompare(a, b)` in `src/lib/server/auth.ts` is exported for the
  `CRON_SECRET` check — please use it rather than `===`.
- Reminder links must be `${NEXT_PUBLIC_APP_URL}/log?k=<reminderLinkId>`, which is
  what `buildReminderLink()` in `src/lib/server/serialise.ts` produces and what
  `authSessionResponseSchema.reminderLink` already returns. Do not invent a
  second link format — `?k=` is the only query parameter the auth layer reads.
- Please expose an email-sending function I can call in place of
  `src/lib/server/recovery.ts` (§3.8). It needs: recipient address, recipient
  name, subject, plain-text body. I will delete my copy.

**From Stream 2 (frontend):**

- `?k=` in the URL works on *any* API route, not just `/api/auth/resume`. On a
  cold open of a reminder link, calling `GET /api/auth/me?k=…` is enough to
  establish the session — a separate resume call is optional.
- Store `sessionToken` if you want a bearer header, but the `hsa_session` cookie
  is set automatically and is httpOnly; the cookie alone is sufficient.
- Read `today` from `GET /api/auth/me`, not from the device clock. A phone whose
  date is a day out would otherwise file the entry under the wrong day.
- Field errors come back as `fieldErrors` keyed by dotted path
  (`conditions.0.conditionOther`, `_form` for form-level). They are written to be
  shown to a practitioner verbatim.
- Expect 422 `OUTSIDE_COLLECTION_WINDOW` on every write before 1 October — the
  message names the window and the date that was refused. This is the normal
  state of the app right now, not a bug.
- `GET /api/taxonomy` is unauthenticated and cacheable; send `If-None-Match` with
  the stored ETag and handle 304. The `version` field is what to key a client-side
  cache on.

**From the integration lead:**

- Production checklist: set `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` and SMTP;
  confirm `COLLECTION_START_DATE` / `COLLECTION_END_DATE`; if moving off SQLite,
  swap the provider and adapter and re-run the suite (§5).
- Decide whether `role` promotion needs any UI at all, or stays a manual database
  operation for the two or three HSA researchers. I assumed manual.
