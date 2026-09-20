/**
 * GET /api/dashboard/entries — FR8, RESEARCHER only.
 *
 * The flattened table behind the dashboard, one row per condition entry, paged.
 * The row shape is the same one the CSV export writes column-for-column, so
 * what a researcher sees on screen is exactly what they get in the file.
 *
 * POPIA: rows carry `practitionerId` and `province`. Never an email — the query
 * in `src/lib/server/dashboard.ts` does not even select that column.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { dashboardEntriesResponseSchema } from '@/lib/contract'
import { attachSession, requireResearcher } from '@/lib/server/auth'
import { withRoute } from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import {
  getDashboardRows,
  paginate,
  parseDashboardFilter,
} from '@/lib/server/dashboard'

export const dynamic = 'force-dynamic'

export const GET = withRoute(async (request: Request): Promise<NextResponse> => {
  const auth = await requireResearcher(request)
  const filter = parseDashboardFilter(new URL(request.url))

  const rows = await getDashboardRows(filter)
  const response = jsonResponse(
    dashboardEntriesResponseSchema,
    paginate(rows, filter.page, filter.pageSize),
  )
  return attachSession(response, auth)
})
