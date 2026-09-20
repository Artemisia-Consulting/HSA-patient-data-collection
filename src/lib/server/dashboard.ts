/**
 * Researcher dashboard queries (FR8).
 *
 * POPIA: every query here selects `Practitioner.id` and `Practitioner.province`
 * and nothing else. The email column is never loaded into memory on this path,
 * let alone serialised — which is a stronger guarantee than remembering to omit
 * it at the edge.
 *
 * Filter semantics, fixed once here so the summary, the table and the CSV all
 * agree:
 *
 *  - `from`/`to` bound the log date, inclusive.
 *  - `patientType` filters *rows*: "new" keeps days with at least one new
 *    patient, "followup" keeps days with at least one follow-up. It does not
 *    zero the other column — the totals stay the real totals for the days
 *    shown.
 *  - `category` / `conditionCode` / `diagnosisBasis` / `alsoSeeingGp` /
 *    `referredByGp` filter *condition entries*. A day is in scope when at least
 *    one of its entries matches, and only the matching entries are counted —
 *    so "referred by a GP = yes" gives the referral numbers the HSA report is
 *    built on (rubric item 7 tier 3) rather than every entry on a day that
 *    happened to contain one.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import {
  CONDITION_CATEGORIES,
  CONDITION_CATEGORY_LABELS,
  DIAGNOSIS_BASES,
  REMINDER_LINK_QUERY_PARAM,
  dashboardFilterSchema,
  isOtherCondition,
  type ConditionCategory,
  type DashboardEntryRow,
  type DashboardFilter,
  type DashboardSummary,
  type DiagnosisBasis,
} from '@/lib/contract'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma'

import { ApiException, fieldErrorsFromZod } from './errors'
import { conditionLabels } from './taxonomy'

/**
 * Parse query params into a filter. Empty values are dropped first: a form that
 * submits `?category=` means "no category filter", not "the empty category".
 */
export function parseDashboardFilter(url: URL): DashboardFilter {
  const raw: Record<string, string> = {}
  for (const [key, value] of url.searchParams) {
    // `k` is the reminder-link credential, not a filter; it must not make the
    // filter parse fail on an otherwise valid request.
    if (key === REMINDER_LINK_QUERY_PARAM) continue
    if (value.trim().length > 0) raw[key] = value.trim()
  }
  const parsed = dashboardFilterSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiException(
      'VALIDATION_FAILED',
      'One of the filters is not valid',
      fieldErrorsFromZod(parsed.error),
    )
  }
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    throw new ApiException(
      'VALIDATION_FAILED',
      'The "from" date must be on or before the "to" date',
      { from: ['Must be on or before the "to" date'] },
    )
  }
  return parsed.data
}

/* ------------------------------------------------------------------ *
 * Scoping
 * ------------------------------------------------------------------ */

function entryWhere(filter: DashboardFilter): Prisma.ConditionEntryWhereInput {
  return {
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.conditionCode ? { conditionCode: filter.conditionCode } : {}),
    ...(filter.diagnosisBasis ? { diagnosisBasis: filter.diagnosisBasis } : {}),
    ...(filter.alsoSeeingGp ? { alsoSeeingGp: filter.alsoSeeingGp } : {}),
    ...(filter.referredByGp ? { referredByGp: filter.referredByGp } : {}),
  }
}

function hasEntryFilter(filter: DashboardFilter): boolean {
  return Object.keys(entryWhere(filter)).length > 0
}

function logWhere(filter: DashboardFilter): Prisma.DailyLogWhereInput {
  const dateRange: Prisma.StringFilter = {}
  if (filter.from) dateRange.gte = filter.from
  if (filter.to) dateRange.lte = filter.to

  return {
    ...(filter.from || filter.to ? { logDate: dateRange } : {}),
    ...(filter.patientType === 'new' ? { newPatients: { gt: 0 } } : {}),
    ...(filter.patientType === 'followup' ? { followUpPatients: { gt: 0 } } : {}),
    ...(hasEntryFilter(filter) ? { conditions: { some: entryWhere(filter) } } : {}),
  }
}

type ScopedLog = {
  id: string
  logDate: string
  newPatients: number
  followUpPatients: number
  practitioner: { id: string; province: string | null }
  conditions: Array<{
    id: string
    category: string
    conditionCode: string
    conditionOther: string | null
    diagnosisBasis: string
    alsoSeeingGp: string
    referredByGp: string
    createdAt: Date
  }>
}

async function fetchScopedLogs(filter: DashboardFilter): Promise<ScopedLog[]> {
  return prisma.dailyLog.findMany({
    where: logWhere(filter),
    select: {
      id: true,
      logDate: true,
      newPatients: true,
      followUpPatients: true,
      // POPIA: id + province only. The email column is never read here.
      practitioner: { select: { id: true, province: true } },
      conditions: {
        where: hasEntryFilter(filter) ? entryWhere(filter) : undefined,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          category: true,
          conditionCode: true,
          conditionOther: true,
          diagnosisBasis: true,
          alsoSeeingGp: true,
          referredByGp: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ logDate: 'asc' }, { practitionerId: 'asc' }],
  })
}

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

export async function getDashboardSummary(
  filter: DashboardFilter,
): Promise<DashboardSummary> {
  const [logs, practitioners] = await Promise.all([
    fetchScopedLogs(filter),
    // The denominator for participation, deliberately unfiltered: "12 of 30
    // practitioners reported in this window" needs the 30 to be everyone.
    prisma.practitioner.count({ where: { role: 'PRACTITIONER' } }),
  ])

  const reporting = new Set<string>()
  const byDate = new Map<string, { newPatients: number; followUpPatients: number }>()
  const byCategory = new Map<string, number>()
  const byBasis = new Map<string, number>()
  const coManagement = {
    alsoSeeingGpYes: 0,
    alsoSeeingGpNo: 0,
    alsoSeeingGpUnsure: 0,
    referredByGpYes: 0,
    referredByGpNo: 0,
    referredByGpNotApplicable: 0,
  }

  let newPatients = 0
  let followUpPatients = 0
  let conditionEntries = 0

  for (const log of logs) {
    reporting.add(log.practitioner.id)
    newPatients += log.newPatients
    followUpPatients += log.followUpPatients

    const day = byDate.get(log.logDate) ?? { newPatients: 0, followUpPatients: 0 }
    day.newPatients += log.newPatients
    day.followUpPatients += log.followUpPatients
    byDate.set(log.logDate, day)

    for (const entry of log.conditions) {
      conditionEntries += 1
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1)
      byBasis.set(entry.diagnosisBasis, (byBasis.get(entry.diagnosisBasis) ?? 0) + 1)

      if (entry.alsoSeeingGp === 'YES') coManagement.alsoSeeingGpYes += 1
      else if (entry.alsoSeeingGp === 'NO') coManagement.alsoSeeingGpNo += 1
      else coManagement.alsoSeeingGpUnsure += 1

      if (entry.referredByGp === 'YES') coManagement.referredByGpYes += 1
      else if (entry.referredByGp === 'NO') coManagement.referredByGpNo += 1
      else coManagement.referredByGpNotApplicable += 1
    }
  }

  return {
    totals: {
      practitioners,
      practitionersReporting: reporting.size,
      logDays: logs.length,
      newPatients,
      followUpPatients,
      totalPatients: newPatients + followUpPatients,
      conditionEntries,
    },
    byDate: [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([logDate, counts]) => ({ logDate, ...counts })),
    // All five categories are always present so the chart keeps a stable shape
    // and an empty category reads as a real zero rather than a missing bar.
    byCategory: CONDITION_CATEGORIES.map((category: ConditionCategory) => ({
      category,
      label: CONDITION_CATEGORY_LABELS[category],
      entries: byCategory.get(category) ?? 0,
    })),
    coManagement,
    byDiagnosisBasis: DIAGNOSIS_BASES.map((diagnosisBasis: DiagnosisBasis) => ({
      diagnosisBasis,
      entries: byBasis.get(diagnosisBasis) ?? 0,
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Flattened rows — shared by the table and the CSV export
 * ------------------------------------------------------------------ */

/**
 * One row per condition entry. A day logged with no conditions still produces
 * a row, with the condition columns null, so the patient counts for that day
 * are not lost from the export — which is why the contract makes those columns
 * nullable.
 */
export async function getDashboardRows(
  filter: DashboardFilter,
): Promise<DashboardEntryRow[]> {
  const [logs, labels] = await Promise.all([fetchScopedLogs(filter), conditionLabels()])

  const rows: DashboardEntryRow[] = []
  for (const log of logs) {
    const base = {
      logId: log.id,
      practitionerId: log.practitioner.id,
      province: log.practitioner.province,
      logDate: log.logDate,
      newPatients: log.newPatients,
      followUpPatients: log.followUpPatients,
    }

    if (log.conditions.length === 0) {
      rows.push({
        ...base,
        category: null,
        conditionCode: null,
        conditionLabel: null,
        diagnosisBasis: null,
        alsoSeeingGp: null,
        referredByGp: null,
      })
      continue
    }

    for (const entry of log.conditions) {
      rows.push({
        ...base,
        category: entry.category as DashboardEntryRow['category'],
        conditionCode: entry.conditionCode,
        // For an "Other (specify)" row the practitioner's own wording is the
        // only label worth having; the contract has no separate column for it.
        conditionLabel: isOtherCondition(entry.conditionCode)
          ? (entry.conditionOther ?? labels.get(entry.conditionCode) ?? null)
          : (labels.get(entry.conditionCode) ?? null),
        diagnosisBasis: entry.diagnosisBasis as DashboardEntryRow['diagnosisBasis'],
        alsoSeeingGp: entry.alsoSeeingGp as DashboardEntryRow['alsoSeeingGp'],
        referredByGp: entry.referredByGp as DashboardEntryRow['referredByGp'],
      })
    }
  }
  return rows
}

export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { rows: T[]; page: number; pageSize: number; totalRows: number } {
  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    page,
    pageSize,
    totalRows: rows.length,
  }
}
