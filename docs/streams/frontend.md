# Stream 2 — Practitioner frontend

The October logging app as the practitioner sees it: signup, onboarding, the
daily entry form, and the PWA shell. Built against the locked contract in
`src/lib/contract/**` — labels, enums and defaults are imported from it, never
hard-coded per screen.

- Screens: `src/app/(practitioner)/**` — signup, welcome, log, privacy
- Components: `src/components/**` — signup, onboarding, log, shell, ui
- Client layer: `src/lib/client/**` — transport, http, api, session, entry,
  outbox, draft, storage, preferences, taxonomy cache, condition search, mock
- PWA: `public/**` — manifest, icons, service worker, offline page
- Tests: `tests/frontend/**` — 4 files, 61 tests

---

## 1. What was built, mapped to FR numbers

| Screen / flow | FR | Notes |
| --- | --- | --- |
| Signup `/signup` | FR1 | Email + name + optional practice/province + consent checkbox — the tick **is** the consent record. No password, no verification. A 409 duplicate goes to a recovery screen where the practitioner can paste their logging link. |
| Session & routing | FR1 | `EntryRouter` resolves `GET /api/auth/me`: anonymous → signup, not onboarded → welcome, else → log. Token kept in localStorage (bearer) *and* cookie; `?k=` reminder links identify a practitioner on a fresh device with nothing stored. |
| Onboarding `/welcome` | FR2 | Three cards on what is tracked daily, then a **practice entry** (the real form in practice mode, no API calls) or straight to logging. Skippable, shown once via `onboardedAt`. |
| Daily entry `/log` | FR3–FR6 | Date auto-filled from the server's SAST `today` (0 taps; today/yesterday/another-day buttons to change). Counts as a 0–9 tap grid plus ±/typed input. Category → condition typeahead (rank-ordered, synonym search, multi-select, per-category "Other (specify)" free text). Per condition: diagnosis basis (defaults to `CLINICAL_DIAGNOSIS`, remembers the practitioner's modal choice via `deriveDefaults`), "Also seeing a GP?" and "Referred by GP?" pre-answered from remembered values. One sticky submit. |
| Submit outcomes | FR3 | Explicit confirmation states: saved (new vs updated), queued offline, practised. |
| Offline & durability | NFR | Outbox queues a submit that cannot reach the server and replays on reconnect; per-date draft autosaved so a killed PWA does not lose the entry; a late "nothing logged" reply can no longer overwrite taps made while loading (`shouldReplaceForm`). |
| Privacy `/privacy` | POPIA | Plain-language privacy page; no patient-identifiable field exists anywhere in the UI, payloads, drafts or the outbox. |
| PWA | NFR | `manifest.webmanifest` (standalone, portrait, 192/512 icons, "Log today" shortcut), service worker with cache-first static / network-first navigation and `offline.html` fallback, never caching `/api/*`. Registrar unregisters in dev and registers only in production. |

### The 30-second walkthrough (tap count)

A returning practitioner, two conditions, on the grid: date 0 taps, new
patients 1, follow-up 1, two conditions at category+condition each = 4,
submit 1 — **7 taps, no typing**. The stopwatch variant of this on a physical
device is in §5, not measured here.

---

## 2. Contract compliance

`src/lib/client/mock/**` returns real `Response` objects and every success
body in it is parsed with the contract's own Zod schemas by
`tests/frontend/mock-contract.test.ts` — the mock cannot drift from the
contract without failing the suite. The status codes the UI branches on
(201/200 on log upsert, 409 duplicate email, 404 unlogged date, 401 no
credentials) are pinned in the same test.

**Integration change (done, not a deviation):** `transport.ts` now points at
the real API by default. The mock is opt-in with
`NEXT_PUBLIC_USE_MOCK_API=true`; the two suites that test the mock set that
at the top of the file. A mock that is on by default is one forgotten env var
away from collecting October into localStorage, which is why the default
flipped at merge rather than at deploy.

The mock was **kept rather than deleted** (its header originally said delete
at integration): it is the fixture the contract tests parse and the offline
dev mode for working without a database. Its headers now say so.

---

## 3. Departures and decisions worth flagging

- **Practice mode in onboarding** (rubric item 3, tier 3): the "preview
  entry" is the real `DailyLogForm` with `practice` set, so what is practised
  is exactly what will be used — no separate fake form to drift.
- **Diagnosis default is the practitioner's modal value, not a fixed
  constant** (rubric item 6, tier 3): `deriveDefaults` re-derives after each
  submit; a tie keeps the earliest value so it cannot flap.
- **Draft autosave keyed by date** rather than one scratch draft: yesterday's
  half-entry cannot leak into today's.
- **`shouldReplaceForm` semantics**: a non-empty server reply always wins
  (it is the real record for that date); an *empty* reply never displaces
  taps already made. The reverse — loading empty over fresh taps — is the
  worst failure this form has, because it is invisible and corrupts data.
- **CountPicker 16px input font** is load-bearing: below 16px iOS Safari zooms
  the viewport on focus.

---

## 4. Bug log

| # | Severity | What | Fix |
| --- | --- | --- | --- |
| 1 | High (caught before merge) | The form-hardening change was committed mid-flight **without its import**: `DailyLogForm.tsx` used `shouldReplaceForm` but never imported it, so `tsc` failed. Found by the integration typecheck on first run. | Import added; typecheck and suite green after. |
| 2 | High | A late "nothing is logged for today" reply could silently overwrite a count tapped while the day was still loading — the practitioner submits a zero they never entered. Invisible and it corrupts the dataset. | Fixed on this branch: `dirty`/`loadSeq` refs, all edits through `editForm`, loads gated by `shouldReplaceForm`. Tests added for both helpers (`entry.test.ts`). |
| 3 | Low (tooling) | `<npm|npx> --prefix <dir> test` cannot run this suite on Windows in some shells — vitest workers fail with "Vitest failed to find the runner". `node node_modules/vitest/vitest.mjs run` from inside the project directory works. | Documented in §6; CI should use the working invocation. Not a code defect. |
| 4 | Low | This branch had no `vitest.config.ts` (Stream 1 added one). | At integration the identical generic config was added here so the file merges clean and every worktree runs its suite the same way. |

---

## 5. What is NOT tested

So nobody reads "61 passing tests" as more than it is.

- **No DOM / component tests.** There is no testing-library in the locked
  dependencies, so nothing asserts that a screen *renders*, that touch targets
  measure 44px in a real layout, or that focus/labels behave. The suite covers
  form state, payload shaping, search ranking, outbox and mock contract —
  logic, not layout.
- **No real-API round trip in this suite.** Until the integration smoke, the
  frontend has never talked to Stream 1's routes; the mock is contract-shaped,
  not the server.
- **No Lighthouse run and no physical-device test.** Responsive behaviour is
  by construction (Tailwind breakpoints), not measured. Android/iOS testing
  from the rubric has not happened yet.
- **The service worker has never run in a built app** on this branch (it
  registers only in production). The integration build is its first
  exercise; caching strategy is review-only so far.
- **Offline is simulated** (mock latency, forced-offline flag), not real
  network shaping; there is no test of outbox retry timing or of a draft
  fighting a slow reply on a real connection.
- **The 30-second claim is a tap count, not a measurement.** 7 taps for a
  two-condition day, no typing; a stopwatch walkthrough on a phone is still
  owed before go-live.
- **Accessibility beyond touch sizes is unverified** — labels exist, but no
  screen-reader pass, no contrast audit.

---

## 6. Running it

From inside this directory (the working invocation on Windows):

```
node node_modules/vitest/vitest.mjs run     # 61 frontend tests
npm run typecheck
npm run dev                                  # real API needs Stream 1 routes + a seeded DB
```

To develop the frontend alone without a database:
`NEXT_PUBLIC_USE_MOCK_API=true npm run dev` (mock mode; sessions and logs live
in localStorage under `hsa.mock.db.v1`).

---

## 7. What I need at integration

- Stream 1's routes on the same origin (done at merge); the client assumes
  the `hsa_session` cookie is set httpOnly by the server and that `?k=` works
  on every route, both of which the backend contract provides.
- `today` always comes from `GET /api/auth/me`, never the device clock.
- The taxonomy endpoint must stay unauthenticated and ETag-able; the client
  caches on `version` and revalidates with `If-None-Match`.
- If render-level tests are wanted before October, that needs a
  `package.json` change (jsdom + testing-library) — deliberately not done
  here because dependencies were locked.
