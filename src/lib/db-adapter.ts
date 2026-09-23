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

export function createDbAdapter() {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db'
  if (url.startsWith('file:') || url === ':memory:') {
    return new PrismaBetterSqlite3({ url })
  }
  return new PrismaPg({ connectionString: url })
}
