/**
 * GET /api/dashboard/summary — FR8, RESEARCHER only.
 *
 * The aggregate numbers behind the charts: daily trend, category breakdown and
 * the co-management/referral counts the HSA impact argument rests on (rubric
 * item 7 tier 3 — that data is queryable in its own right, not merely stored).
 *
 * POPIA: no practitioner identity of any kind appears in this response, not
 * even an id — only counts.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { dashboardSummarySchema } from '@/lib/contract'
import { attachSession, requireResearcher } from '@/lib/server/auth'
import { withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import { getDashboardSummary, parseDashboardFilter } from '@/lib/server/dashboard'

export const dynamic = 'force-dynamic'

export const GET = withRoute(async (request: Request): Promise<NextResponse> => {
  const auth = await requireResearcher(request)
  const filter = parseDashboardFilter(new URL(request.url))

  const response = jsonResponse(
    dashboardSummarySchema,
    await getDashboardSummary(filter),
  )
  return attachSession(response, auth)
})
