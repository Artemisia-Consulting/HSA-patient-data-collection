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
 *  - `patientType` filters *patients*: "new" keeps new patients, "followup"
 *    keeps returning ones, and a day survives when it has at least one.
 *  - `category` / `conditionCode` / `diagnosisBasis` / `alsoSeeingGp` /
 *    `referredByGp` filter *condition entries*, and a patient is kept only when
 *    one of their conditions matches — so "referred by a conventional
 *    practitioner = yes" gives the referral numbers the HSA report is built on
 *    (rubric item 7 tier 3) rather than every entry on a day that happened to
 *    contain one.
 *
 * Patient counts are summed from the patient rows in scope, not from
 * DailyLog.newPatients. With no filters the two are identical — the contract
 * refuses a submission where they disagree — but under a filter only the
 * summed version answers the question actually asked, which is "how many
 * patients matched", not "how many patients were seen on days where one did".
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import {
  CONDITION_CATEGORIES,
  CONDITION_CATEGORY_LABELS,
  DIAGNOSIS_BASES,
  PATIENT_TYPES,
  REMINDER_LINK_QUERY_PARAM,
  dashboardFilterSchema,
  isOtherCondition,
  type ConditionCategory,
  type DashboardEntryRow,
  type DashboardFilter,
  type DashboardSummary,
  type DiagnosisBasis,
  type PatientType,
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

/**
 * Which patients are in scope. Both halves are applied to the *same* patient,
 * which is the whole point of the patient-level model: "new patients referred
 * by a conventional practitioner" is now one condition on one row rather than
 * two independent conditions that a day could satisfy separately.
 */
function patientWhere(filter: DashboardFilter): Prisma.PatientEntryWhereInput {
  return {
    ...(filter.patientType === 'new' ? { patientType: 'NEW' } : {}),
    ...(filter.patientType === 'followup' ? { patientType: 'FOLLOW_UP' } : {}),
    ...(hasEntryFilter(filter) ? { conditions: { some: entryWhere(filter) } } : {}),
  }
}

function hasPatientFilter(filter: DashboardFilter): boolean {
  return Object.keys(patientWhere(filter)).length > 0
}

function logWhere(filter: DashboardFilter): Prisma.DailyLogWhereInput {
  const dateRange: Prisma.StringFilter = {}
  if (filter.from) dateRange.gte = filter.from
  if (filter.to) dateRange.lte = filter.to

  return {
    ...(filter.from || filter.to ? { logDate: dateRange } : {}),
    ...(hasPatientFilter(filter) ? { patients: { some: patientWhere(filter) } } : {}),
  }
}

type ScopedPatient = {
  id: string
  patientType: string
  position: number
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

type ScopedLog = {
  id: string
  logDate: string
  newPatients: number
  followUpPatients: number
  practitioner: { id: string; province: string | null }
  patients: ScopedPatient[]
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
      patients: {
        where: hasPatientFilter(filter) ? patientWhere(filter) : undefined,
        orderBy: [{ patientType: 'desc' }, { position: 'asc' }],
        select: {
          id: true,
          patientType: true,
          position: true,
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

  const byType = new Map<string, { patients: number; entries: number }>()

  let newPatients = 0
  let followUpPatients = 0
  let conditionEntries = 0
  let patientsWithMultipleConditions = 0

  for (const log of logs) {
    reporting.add(log.practitioner.id)

    const day = byDate.get(log.logDate) ?? { newPatients: 0, followUpPatients: 0 }

    for (const patient of log.patients) {
      if (patient.patientType === 'NEW') {
        newPatients += 1
        day.newPatients += 1
      } else {
        followUpPatients += 1
        day.followUpPatients += 1
      }

      const typeTotals = byType.get(patient.patientType) ?? { patients: 0, entries: 0 }
      typeTotals.patients += 1
      typeTotals.entries += patient.conditions.length
      byType.set(patient.patientType, typeTotals)

      if (patient.conditions.length > 1) patientsWithMultipleConditions += 1

      for (const entry of patient.conditions) {
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

    byDate.set(log.logDate, day)
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
    // Both types always present, for the same reason as byCategory: a stable
    // shape means an empty series reads as zero rather than as missing data.
    byPatientType: PATIENT_TYPES.map((patientType: PatientType) => ({
      patientType,
      patients: byType.get(patientType)?.patients ?? 0,
      entries: byType.get(patientType)?.entries ?? 0,
    })),
    patientsWithMultipleConditions,
  }
}

/* ------------------------------------------------------------------ *
 * Flattened rows — shared by the table and the CSV export
 * ------------------------------------------------------------------ */

/**
 * One row per condition entry, carrying the patient it belongs to.
 *
 * A patient logged without any conditions itemised still produces a row, with
 * the condition columns null — they were seen, and dropping them would make
 * the export's patient count disagree with the dashboard's. Likewise a day
 * with no patients at all keeps a row with `patientId` null.
 *
 * `patientId` is what makes the export analysable per patient: two rows sharing
 * one means one person presented with two conditions. It is the random row id,
 * so it groups within a visit and links nothing across days (POPIA).
 */
export async function getDashboardRows(
  filter: DashboardFilter,
): Promise<DashboardEntryRow[]> {
  const [logs, labels] = await Promise.all([fetchScopedLogs(filter), conditionLabels()])

  const emptyConditionColumns = {
    category: null,
    conditionCode: null,
    conditionLabel: null,
    diagnosisBasis: null,
    alsoSeeingGp: null,
    referredByGp: null,
  } as const

  const rows: DashboardEntryRow[] = []
  for (const log of logs) {
    const base = {
      logId: log.id,
      practitionerId: log.practitioner.id,
      province: log.practitioner.province,
      logDate: log.logDate,
      // The day's own recorded counts, unaffected by the filters — context for
      // the row, not a count of what matched. Use the summary for that.
      newPatients: log.newPatients,
      followUpPatients: log.followUpPatients,
    }

    if (log.patients.length === 0) {
      rows.push({ ...base, patientId: null, patientType: null, ...emptyConditionColumns })
      continue
    }

    for (const patient of log.patients) {
      const patientBase = {
        ...base,
        patientId: patient.id,
        patientType: patient.patientType as DashboardEntryRow['patientType'],
      }

      if (patient.conditions.length === 0) {
        rows.push({ ...patientBase, ...emptyConditionColumns })
        continue
      }

      for (const entry of patient.conditions) {
        rows.push({
          ...patientBase,
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
