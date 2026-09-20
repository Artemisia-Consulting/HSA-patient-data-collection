/**
 * GET /api/logs — the calling practitioner's own logs, newest first.
 *
 * Scoped to the caller by construction: there is no practitioner parameter, so
 * there is no version of this request that returns somebody else's days. The
 * collection window is 31 days, so this is deliberately unpaginated.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { dailyLogListResponseSchema } from '@/lib/contract'
import { attachSession, requireAuth } from '@/lib/server/auth'
import { withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import { listLogs } from '@/lib/server/logs'
import { toDailyLogResponse } from '@/lib/server/serialise'

export const dynamic = 'force-dynamic'

export const GET = withRoute(async (request: Request): Promise<NextResponse> => {
  const auth = await requireAuth(request)
  const logs = await listLogs(auth.practitioner.id)

  const response = jsonResponse(dailyLogListResponseSchema, {
    logs: logs.map(toDailyLogResponse),
  })
  return attachSession(response, auth)
})
