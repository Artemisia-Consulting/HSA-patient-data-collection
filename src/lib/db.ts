import { PrismaClient } from '@/generated/prisma'

import { createDbAdapter } from '@/lib/db-adapter'

// Prisma 7 connects through a driver adapter rather than a URL in the schema:
// SQLite locally, Postgres in production — see db-adapter.ts. Nothing else in
// the app changes between the two.
function createClient() {
  return new PrismaClient({ adapter: createDbAdapter() })
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
