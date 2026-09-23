/**
 * The `npm run build` entry point — one command that works locally and on
 * Vercel.
 *
 * Vercel sets DATABASE_URL (the Supabase Postgres pooler URL) before the
 * build runs, so when it is a postgres:// URL the Prisma client must be
 * generated with provider "postgresql": the generated client is
 * provider-flavoured (see db-provider.mjs) and its flavour is baked into the
 * compiled server bundle. The schema file is restored to "sqlite" afterwards
 * — on Vercel the build tree is discarded anyway, locally the restore keeps
 * dev tooling consistent.
 *
 * With a SQLite DATABASE_URL (the local default) this is exactly the old
 * `prisma generate && next build`.
 */
import { spawnSync } from 'node:child_process'

import { isPostgresUrl, loadDotEnv, setSchemaProvider } from './db-provider.mjs'

loadDotEnv()

/** Runs a shell command, returning its exit code (1 on spawn failure). */
function run(commandText) {
  const result = spawnSync(commandText, { stdio: 'inherit', shell: true })
  if (result.error) {
    console.error(result.error)
    return 1
  }
  return result.status ?? 1
}

const url = process.env.DATABASE_URL ?? 'file:./dev.db'
let exitCode = 0

if (isPostgresUrl(url)) {
  console.log('[build] DATABASE_URL is Postgres — generating a postgres-flavoured Prisma client')
  setSchemaProvider('postgresql')
  try {
    exitCode = run('npx prisma generate')
    if (exitCode === 0) exitCode = run('npx next build')
  } finally {
    try {
      setSchemaProvider('sqlite')
    } catch (error) {
      console.error('[build] could not restore the schema provider:', error)
    }
  }
} else {
  exitCode = run('npx prisma generate')
  if (exitCode === 0) exitCode = run('npx next build')
}

process.exit(exitCode)
