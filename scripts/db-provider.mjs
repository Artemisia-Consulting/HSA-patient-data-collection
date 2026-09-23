/**
 * Shared helpers for the production-database scripts (build.mjs,
 * with-prod-db.mjs).
 *
 * The repo keeps prisma/schema.prisma on `provider = "sqlite"` so local dev
 * and the test suite stay zero-setup. The generated Prisma client is
 * provider-flavoured — its WASM query compiler and a constructor-time check
 * both follow the datasource provider at generate time (verified: the client
 * rejects an adapter whose dialect does not match) — so anything that must
 * talk to Postgres flips the provider, regenerates the client, and flips
 * back when done. These helpers do the flipping.
 */
import fs from 'node:fs'

export const SCHEMA_PATH = 'prisma/schema.prisma'

const PROVIDER_RE = /provider\s*=\s*"(sqlite|postgresql)"/

/** Loads .env for local runs; a no-op where real env vars are already set. */
export function loadDotEnv() {
  try {
    process.loadEnvFile()
  } catch {
    // No .env file in CI / production — real env vars are already set.
  }
}

export function isSqliteUrl(url) {
  return url.startsWith('file:') || url === ':memory:'
}

export function isPostgresUrl(url) {
  return /^postgres(ql)?:\/\//.test(url)
}

/**
 * Rewrites the datasource provider line in place. Restoring to "sqlite"
 * explicitly (rather than replaying remembered bytes) also repairs a schema
 * left on "postgresql" by an interrupted earlier run.
 */
export function setSchemaProvider(provider) {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8')
  if (!PROVIDER_RE.test(schema)) {
    throw new Error(`No provider = "sqlite|postgresql" line found in ${SCHEMA_PATH}`)
  }
  fs.writeFileSync(SCHEMA_PATH, schema.replace(PROVIDER_RE, `provider = "${provider}"`))
}
