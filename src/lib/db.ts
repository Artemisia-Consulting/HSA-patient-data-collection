import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma'

// Prisma 7 connects through a driver adapter rather than a URL in the schema.
// Swapping to Postgres for production means swapping this adapter for
// `PrismaPg` from @prisma/adapter-pg — nothing else in the app changes.
function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  })
  return new PrismaClient({ adapter })
}

// Next.js dev mode re-evaluates modules on every hot reload. Without this
// cache each reload would open another SQLite connection until the app dies.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
