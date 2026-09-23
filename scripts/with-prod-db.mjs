/**
 * Runs a command against the production database (Supabase Postgres).
 *
 *   npm run db:push:prod          create/update the production tables
 *   npm run db:seed:prod          seed the condition taxonomy
 *   npm run db:researcher:prod    create the researcher account
 *
 * Order of operations:
 *   1. Read PROD_DATABASE_URL from .env / the environment, and refuse to run
 *      unless it is a postgres:// URL — an accidental push to the local
 *      dev.db must be impossible.
 *   2. Flip the schema provider to "postgresql" and regenerate the Prisma
 *      client (the generated client is provider-flavoured; see
 *      db-provider.mjs).
 *   3. Run the command with DATABASE_URL pointed at the production database.
 *   4. Restore provider "sqlite" and regenerate the local client — even
 *      after a failure — so `npm run dev` and `npm test` keep working.
 *
 * If a run is killed before step 4, repair with:
 *   git restore prisma/schema.prisma ; npx prisma generate
 */
import { spawnSync } from 'node:child_process'

import { isPostgresUrl, loadDotEnv, setSchemaProvider } from './db-provider.mjs'

const args = process.argv.slice(2)
const separator = args.indexOf('--')
const command = (separator === -1 ? [] : args.slice(separator + 1)).join(' ')

loadDotEnv()

const prodUrl = process.env.PROD_DATABASE_URL
if (!prodUrl) {
  console.error('PROD_DATABASE_URL is not set. Add it to .env — the Supabase')
  console.error('"Session pooler" connection string (Project Settings → Database).')
  process.exit(1)
}
if (!isPostgresUrl(prodUrl)) {
  console.error(`PROD_DATABASE_URL is not a postgres:// URL: ${prodUrl.slice(0, 48)}`)
  process.exit(1)
}
if (!command) {
  console.error('Nothing to run. Usage: node scripts/with-prod-db.mjs -- <command>')
  process.exit(1)
}

/** Runs a shell command, returning its exit code (1 on spawn failure). */
function run(commandText, extraEnv = {}) {
  const result = spawnSync(commandText, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  })
  if (result.error) {
    console.error(result.error)
    return 1
  }
  return result.status ?? 1
}

// Registering no-op signal handlers keeps this process alive through Ctrl+C:
// the child dies, spawnSync returns, and the finally block below still
// restores the SQLite schema and client.
process.on('SIGINT', () => {})
process.on('SIGTERM', () => {})

let exitCode = 1
try {
  setSchemaProvider('postgresql')
  console.log('[prod-db] provider → postgresql; regenerating the Prisma client')
  exitCode = run('npx prisma generate')
  if (exitCode === 0) {
    console.log(`[prod-db] running: ${command}`)
    exitCode = run(command, { DATABASE_URL: prodUrl })
  }
} finally {
  try {
    setSchemaProvider('sqlite')
    console.log('[prod-db] provider → sqlite; regenerating the local Prisma client')
    run('npx prisma generate')
  } catch (error) {
    console.error('[prod-db] could not restore the local schema/client:', error)
  }
}

process.exit(exitCode)
