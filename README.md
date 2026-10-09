# HSA Patient Data Collection

A mobile-first daily-logging webapp for the Homoeopathic Association of South
Africa's October 2026 national data collection. Practitioners log their day's
patient counts and the conditions they treated in under 30 seconds; the HSA
research team exports the anonymised dataset afterwards.

Full brief, requirements, user stories and assessment rubric: [`docs/brief/`](docs/brief/).

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19 | One deployable for both the PWA and the API |
| Language | TypeScript, strict | The shared contract is only useful if it is enforced |
| Database | Prisma 7 + SQLite (dev) → Postgres (prod) | Zero-setup locally; no SQLite-only features are used |
| Validation | Zod 4 | The same schemas validate on the server and type the client |
| Styling | Tailwind 4 | |
| Dates | date-fns + `@date-fns/tz` | Everything is reckoned in SAST — see `src/lib/dates.ts` |

Prisma is pinned to **7.10.0**, not the `latest` tag, which currently points at
an 8.0 release candidate. This ships on 1 October; it should not ride an RC.

## Getting started

```bash
npm install
cp .env.example .env
npx prisma db push     # creates dev.db from the schema
npm run db:seed        # loads the 45-condition taxonomy
npm run dev
```

Signing up locally asks for the practitioner passcode: `hsa-dev-practitioner`
unless `PRACTITIONER_CODE` is set in `.env`.

If `npm install` was ever run with `--ignore-scripts`, the native SQLite
binding will be missing and Prisma will fail at connect time with a long list
of paths it could not find `better_sqlite3.node` in. Fix:

```bash
npm rebuild better-sqlite3
```

### Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run db:push` | Sync schema to the database |
| `npm run db:seed` | Seed/refresh the condition taxonomy (idempotent) |
| `npm run db:studio` | Prisma Studio |

## The shared contract

[`src/lib/contract/`](src/lib/contract/) is the agreement between the backend,
the practitioner frontend and the reminder layer. Import from
`@/lib/contract` — never reach into the individual files.

- **`enums.ts`** — every permitted value for the enum-like string columns, plus
  their display labels and the Zod schemas that enforce them.
- **`taxonomy.ts`** — the 5 categories and 45 conditions. Seeded into the
  `Condition` table so the research team can extend the list mid-October
  without a redeploy.
- **`api.ts`** — request and response schemas for every endpoint, the error
  envelope, and the two authentication mechanisms.

## Data model

```
Practitioner ─┬─< Session              on-device persistence (FR1)
              ├─< DailyLog ──< ConditionEntry    the collected data (FR3–FR6)
              ├─< DayOverride          snooze / "done for today" (FR7)
              └─< ReminderDispatch     send audit + double-send guard (FR7)
Condition                              the taxonomy, DB-backed (FR4)
```

Two decisions worth knowing before you read the schema:

**Dates are strings, not timestamps.** `logDate` is `"yyyy-MM-dd"` in SAST. A
`DateTime` would be normalised to UTC, and a practitioner logging at 01:00 SAST
would have their entry filed under the previous day — corrupting daily counts
and causing the reminder system to re-nudge someone who had already logged.

**Enum columns are strings.** SQLite has no native enum type. The permitted
values live in `enums.ts` and are enforced by Zod at every API boundary.

## POPIA

The dataset contains no patient-identifiable information by construction. A
`ConditionEntry` records *what was treated on a given day*, never *who*. There
is no patient table, no name column, no free-text clinical note — the only
free text is the per-category "Other (specify)" field, capped at 120
characters.

`Practitioner.email` (and `fullName`) must never appear in a dashboard or
export response; `Practitioner.id` is the anonymised key, and `province` —
required at signup since September 2026 — is the only practitioner attribute
that deliberately reaches the dataset alongside it. The contract enforces this
structurally: `anonymisedPractitionerSchema` has no email field, so adding one
would mean changing the contract.

Consent is self-declared at signup — ticking the box *is* the consent record.
There is no cross-check against the retrospective survey, by decision of the
product owner (user story 1.6).

## Who may sign up: the practitioner passcode

Since October 2026 a *new* practitioner also needs the passcode the HSA gives
to participating practitioners (`PRACTITIONER_CODE`). The sign-up form sends
the details first; an email that is already registered gets the usual
already-registered answer and is never asked, and a new one gets
`403 PRACTITIONER_CODE_REQUIRED`, which the form answers with a passcode step.
Only a correct passcode creates the `Practitioner` row — so "registered
practitioner" and "has a row" stay the same fact, with no new column and no
migration, and everyone who signed up before the passcode existed is
registered by definition. Someone without it is pointed at guest mode.

The passcode is compared in constant time, ignores case, is rate limited
(10 attempts / 15 min per IP), and — like `RESEARCHER_CODE` — closes new
sign-ups in production when unset rather than leaving them open. See
`src/lib/server/practitionerCode.ts`.

## Guest mode

`/guest` is for people who are neither practitioners nor researchers — HSA
members who are curious, colleagues being shown the project. It is not an
account: there is no guest row, no session, and no request to any
authenticated route, so a guest can neither add to the dataset nor see any of
it.

- **`/guest/log`** runs the real `DailyLogForm` in practice mode. Nothing is
  sent, no draft is written, and the remembered answer defaults are left alone
  (a guest on a practitioner's phone must not change their next real entry).
- **`/guest/dashboard`** is the research dashboard drawn from made-up sample
  data generated in the browser (`src/lib/client/demo/sample-dashboard.ts`):
  twelve imaginary practitioners labelled `SAMPLE-01`…`SAMPLE-12`, a
  "made-up sample data" banner, and no Excel/CSV download. It uses the same
  filter rules as the real dashboard but a separate screen component, so it
  cannot weaken the real one's access checks.

It is linked from the foot of `/signup`, `/signin` and `/researcher-signin`.

## Parallel build

Work was split across three streams building simultaneously in separate
worktrees, then merged into main. Before touching anything, read [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md)
— it says which files each stream owns and which are locked.

Stream handoff notes (what was built, bug logs, what is NOT tested, integration asks):
- [`docs/streams/backend.md`](docs/streams/backend.md) — Stream 1: API, schema, auth, dashboard
- [`docs/streams/frontend.md`](docs/streams/frontend.md) — Stream 2: practitioner PWA
- [`docs/streams/reminders.md`](docs/streams/reminders.md) — Stream 3: reminder/engagement layer

## Verification status

As of the merge (2026-09-20):
- **Typecheck:** clean (`npm run typecheck`)
- **Tests:** 234 passing across 14 files (`node node_modules/vitest/vitest.mjs run`)
- **Build:** clean (`npm run build`)
- **Smoke:** health, taxonomy, auth/me (401), signup all verified on dev server

Note: on Windows, `npm test` may fail with "Vitest failed to find the runner" — use the direct invocation above. See bug logs in each stream's handoff note.

## Known issues

`npm audit` reports 4 high-severity advisories, all reached through the
`prisma` CLI (a devDependency): `deepmerge-ts` via `@prisma/config`, and
`mysql2`. Neither is in the runtime path — `@prisma/client` does not depend on
them, and this project does not use MySQL. Resolving them upstream means
moving to the Prisma 8 RC, which is the worse trade before a fixed launch
date. Revisit once Prisma 8 is stable.
