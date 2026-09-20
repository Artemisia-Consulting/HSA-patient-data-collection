# File ownership & merge rules

Three agents build in parallel, each in its own git worktree and branch. They
cannot see each other's work while they run. Everything below exists to make
the eventual merge boring.

## The one rule

**Only touch files your stream owns.** If your slice needs a change to a
shared file, do not make it — write the request into your stream's handoff
note and keep going against the current contract. A schema or contract edit
made in one worktree is invisible to the other two until merge, at which point
it silently breaks them.

## Locked — integration lead only

Nobody else edits these. They were fixed before the fan-out precisely so that
all three streams compile against the same definitions.

| Path | What it is |
| --- | --- |
| `prisma/schema.prisma` | The database schema |
| `prisma/seed.ts` | Taxonomy seeding |
| `prisma.config.ts` | Prisma 7 datasource/adapter config |
| `src/lib/contract/**` | Enums, taxonomy, API request/response schemas |
| `src/lib/dates.ts` | SAST date handling |
| `src/lib/db.ts` | Prisma client singleton |
| `src/app/layout.tsx`, `src/app/globals.css` | Root shell and base styles |
| `package.json`, `package-lock.json` | Dependencies — all pre-installed |
| `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` | Build config |
| `docs/brief/**` | The source brief, requirements, stories, rubric |

**Dependencies are already installed for all three streams** — Next, React,
Prisma, Zod, Tailwind, date-fns + `@date-fns/tz`, nodemailer, node-cron,
recharts, vitest. Do not add packages. If you genuinely need one, note it in
your handoff and work around it for now.

## Stream 1 — Backend & data (Agent 1)

Owns:

- `src/app/api/auth/**`
- `src/app/api/logs/**`
- `src/app/api/taxonomy/**`
- `src/app/api/dashboard/**`
- `src/app/api/health/**`
- `src/lib/server/**` — auth helpers, query helpers, CSV serialisation
- `tests/backend/**`
- `docs/streams/backend.md`

Does **not** own `src/app/api/reminders/**` — that is Stream 3.

## Stream 2 — Practitioner frontend (Agent 2)

Owns:

- `src/app/page.tsx`
- `src/app/(practitioner)/**` — signup, onboarding, daily log
- `src/components/**`
- `src/lib/client/**` — the fetch wrapper and the mock API
- `public/**` — PWA manifest, icons, service worker
- `tests/frontend/**`
- `docs/streams/frontend.md`

## Stream 3 — Reminders & engagement (Agent 3)

Owns:

- `src/app/api/reminders/**`
- `src/app/reminders/**` — the opt-in and preferences screens
- `src/app/reminders/_components/**` — keep components here, **not** in
  `src/components/`, which Stream 2 owns
- `src/lib/reminders/**` — scheduler, channel adapters, suppression logic
- `scripts/reminders/**`
- `tests/reminders/**`
- `docs/streams/reminders.md`

## Cross-stream dependencies

Stream 3 needs to know whether a practitioner has logged today. Do **not**
query `prisma.dailyLog` from the reminder scheduler — go through the helper
Stream 1 exposes, or, while it does not exist yet, through a small local
function that reads the same table and is clearly marked for replacement at
integration. Record which you chose in your handoff note.

Stream 2 builds against a mock of the API in `src/lib/client/`. The mock must
return exactly the shapes in `src/lib/contract/api.ts` — if it does, swapping
the real endpoint in at integration is a one-line change.

## Handoff note

Each stream writes `docs/streams/<name>.md` covering:

1. What was built, mapped to the FR numbers in `docs/brief/Requirements.md`.
2. Any place you departed from the contract, and why.
3. **Bug log** — known-broken things, with severity.
4. **What is NOT tested** — the brief makes this an explicit deliverable
   (rubric item 15), so be honest and specific rather than reassuring.
5. Anything you need from another stream at integration.

## Working agreements

- Commit to your branch as you go; small commits merge better than one large one.
- Run `npm run typecheck` and `npm run build` before you finish. A stream that
  does not compile blocks the merge.
- Never log, return or export `Practitioner.email` from anything a researcher
  can reach. `Practitioner.id` is the anonymised key. This is a POPIA
  requirement, not a style preference.
- No patient names, ID numbers or clinical notes anywhere — not in the schema,
  the UI, the logs or a comment suggesting a future field for them.
