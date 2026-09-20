/**
 * Test environment. MUST be evaluated before anything imports `@/lib/db` or
 * `@/lib/dates`, both of which read `process.env` at module load. Importing
 * `helpers/db` first in every test file is what guarantees that: ES modules
 * are evaluated in import order, and `helpers/db` imports this file first.
 *
 * `:memory:` gives each Vitest worker its own throwaway SQLite database, so
 * the suite never touches dev.db and files can run in parallel.
 */
/** Shared by env setup and the Google sign-in tests that sign cookies with it. */
export const TEST_BETTER_AUTH_SECRET = 'test-better-auth-secret-at-least-32-chars'

process.env.DATABASE_URL = ':memory:'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.COLLECTION_START_DATE = '2026-10-01'
process.env.COLLECTION_END_DATE = '2026-10-31'
// Never let a test accidentally open an SMTP connection.
process.env.SMTP_HOST = ''

/**
 * Fake Google credentials. These only flip `googleSignInConfigured` to true so
 * the sign-in routes can be exercised; nothing in the suite contacts Google,
 * and the secret below is what the tests use to forge Better Auth's signed
 * session cookie, so it must match what the auth module is constructed with.
 */
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.BETTER_AUTH_SECRET = TEST_BETTER_AUTH_SECRET

export const TEST_APP_URL = 'http://localhost:3000'
