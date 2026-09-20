/**
 * Test environment. MUST be evaluated before anything imports `@/lib/db` or
 * `@/lib/dates`, both of which read `process.env` at module load. Importing
 * `helpers/db` first in every test file is what guarantees that: ES modules
 * are evaluated in import order, and `helpers/db` imports this file first.
 *
 * `:memory:` gives each Vitest worker its own throwaway SQLite database, so
 * the suite never touches dev.db and files can run in parallel.
 */
process.env.DATABASE_URL = ':memory:'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.COLLECTION_START_DATE = '2026-10-01'
process.env.COLLECTION_END_DATE = '2026-10-31'
// Never let a test accidentally open an SMTP connection.
process.env.SMTP_HOST = ''

export const TEST_APP_URL = 'http://localhost:3000'
