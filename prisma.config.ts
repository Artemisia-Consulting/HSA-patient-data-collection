import { defineConfig, env } from 'prisma/config'

// Prisma 7 no longer reads .env automatically, and the CLI runs outside
// Next.js (which does its own env loading). Node 20.6+ gives us this for free.
try {
  process.loadEnvFile()
} catch {
  // .env is absent in CI / production, where real env vars are already set.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
