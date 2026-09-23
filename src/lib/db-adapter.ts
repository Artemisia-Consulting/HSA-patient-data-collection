/**
 * Chooses the Prisma 7 driver adapter from DATABASE_URL.
 *
 * Local dev and the test suite point at SQLite (`file:…` or `:memory:`);
 * the production deployment (Vercel + Supabase) points at Postgres. The
 * generated client is provider-flavoured at generate time — scripts/build.mjs
 * and scripts/with-prod-db.mjs regenerate it for "postgresql" when a Postgres
 * build or command needs one — but every runtime picks its adapter here, so
 * the code above this module never knows which database is behind it.
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * pg 8.x treats sslmode=require/prefer/verify-ca as aliases for verify-full,
 * and then rejects Supabase's pooler certificate ("self-signed certificate in
 * certificate chain") — the opposite of libpq, where require means "encrypt,
 * don't verify". Every Supabase connection guide tells users to append
 * ?sslmode=require, so rewrite those modes to no-verify (TLS without
 * certificate verification) before pg ever sees the URL.
 */
function rewriteSslMode(url: string): string {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/gi, '$1sslmode=no-verify')
}

export function createDbAdapter() {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db'
  if (url.startsWith('file:') || url === ':memory:') {
    return new PrismaBetterSqlite3({ url })
  }
  return new PrismaPg({ connectionString: rewriteSslMode(url) })
}
