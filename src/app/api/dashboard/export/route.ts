/**
 * GET /api/dashboard/export — FR8, RESEARCHER only.
 *
 * The same rows as /api/dashboard/entries and the same filters, as CSV, or as
 * an Excel workbook with `?format=xlsx`. The CSV is for analysis tools; the
 * workbook is for people — a CSV opened in Excel on a South African machine
 * lands in one column, because Excel splits on the regional list separator
 * (a semicolon there), and the workbook has no separator to guess. It also
 * imports straight into Google Sheets. See `src/lib/server/xlsx.ts`.
 *
 * CSV column order is taken straight from `dashboardEntryRowSchema`, so the
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
import {
  getDashboardRows,
  getDashboardSummary,
  parseDashboardFilter,
} from '@/lib/server/dashboard'
import { buildExportWorkbook, describeFilter } from '@/lib/server/exportWorkbook'
import { conditionLabels } from '@/lib/server/taxonomy'
import { toXlsx } from '@/lib/server/xlsx'

export const dynamic = 'force-dynamic'

/** Declaration order from the contract schema — the single source of truth. */
export const EXPORT_COLUMNS = Object.keys(
  dashboardEntryRowSchema.shape,
) as Array<keyof DashboardEntryRow>

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const GET = withRoute(async (request: Request): Promise<NextResponse> => {
  const auth = await requireResearcher(request)
  const url = new URL(request.url)

  // `format` chooses the file, not the rows, so it is taken out before the
  // filter is parsed. Anything unrecognised falls back to CSV, the original
  // behaviour, rather than failing a download.
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
  url.searchParams.delete('format')
  const filter = parseDashboardFilter(url)

  const today = todayInSast()
  const filename = `hsa-export-${today}.${format}`
  const headers = {
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  }

  if (format === 'xlsx') {
    const [rows, summary, labels] = await Promise.all([
      getDashboardRows(filter),
      getDashboardSummary(filter),
      conditionLabels(),
    ])
    const workbook = toXlsx(
      buildExportWorkbook({
        rows,
        summary,
        filterLines: describeFilter(filter, (code) => labels.get(code)),
        exportedOn: today,
      }),
    )
    const response = new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: { ...headers, 'Content-Type': XLSX_TYPE },
    })
    return attachSession(response, auth)
  }

  const rows = await getDashboardRows(filter)
  const csv = toCsv(
    EXPORT_COLUMNS,
    rows.map((row) => EXPORT_COLUMNS.map((column) => row[column])),
  )

  const response = new NextResponse(csv, {
    status: 200,
    headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' },
  })
  return attachSession(response, auth)
})
