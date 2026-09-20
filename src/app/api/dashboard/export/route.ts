/**
 * GET /api/dashboard/export — FR8, RESEARCHER only.
 *
 * The same rows as /api/dashboard/entries and the same filters, as CSV. The
 * column order is taken straight from `dashboardEntryRowSchema`, so the file
 * and the JSON cannot drift apart: adding a field to the contract adds a
 * column, and renaming one is a compile error here.
 *
 * Opens cleanly in Excel (UTF-8 BOM, CRLF) and is safe to open: see
 * `src/lib/server/csv.ts` for the formula-injection handling.
 *
 * POPIA: anonymised practitioner ids only. Pagination does not apply — an
 * export is the whole filtered set.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { NextResponse } from 'next/server'

import { dashboardEntryRowSchema, type DashboardEntryRow } from '@/lib/contract'
import { todayInSast } from '@/lib/dates'
import { attachSession, requireResearcher } from '@/lib/server/auth'
import { withRoute } from '@/lib/server/errors'
import { toCsv } from '@/lib/server/csv'
import { getDashboardRows, parseDashboardFilter } from '@/lib/server/dashboard'

export const dynamic = 'force-dynamic'

/** Declaration order from the contract schema — the single source of truth. */
export const EXPORT_COLUMNS = Object.keys(
  dashboardEntryRowSchema.shape,
) as Array<keyof DashboardEntryRow>

export const GET = withRoute(async (request: Request): Promise<NextResponse> => {
  const auth = await requireResearcher(request)
  const filter = parseDashboardFilter(new URL(request.url))

  const rows = await getDashboardRows(filter)
  const csv = toCsv(
    EXPORT_COLUMNS,
    rows.map((row) => EXPORT_COLUMNS.map((column) => row[column])),
  )

  const filename = `hsa-export-${todayInSast()}.csv`
  const response = new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
  return attachSession(response, auth)
})
