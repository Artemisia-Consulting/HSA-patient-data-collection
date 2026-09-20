/**
 * GET /api/health — rubric item 11.
 *
 * Hit every few minutes by the external ping bot to keep the instance warm, so
 * it has to stay cheap: no auth, no caching, exactly one trivial query. The
 * query matters — a health check that only proves Node is running would report
 * "ok" while every practitioner got a 500 from a dead database connection.
 *
 * Always answers 200, per the contract, including when the database is down:
 * the ping bot's job is to keep the process alive, and a non-200 would make
 * some hosts treat the instance as failed and stop routing to it. The state is
 * in the body — a monitor should alert on `status` / `database`, not just the
 * status code. That trade-off is recorded in docs/streams/backend.md.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { healthResponseSchema } from '@/lib/contract'
import { prisma } from '@/lib/db'
import { withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

const APP_VERSION =
  process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0'

export const GET = withRoute(async (): Promise<NextResponse> => {
  let database: 'ok' | 'error' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    database = 'error'
    console.error('[health] database check failed', error)
  }

  return jsonResponse(healthResponseSchema, {
    status: database === 'ok' ? 'ok' : 'degraded',
    uptimeSeconds: Math.round(process.uptime()),
    database,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  })
})
