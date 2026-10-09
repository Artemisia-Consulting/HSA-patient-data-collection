/**
 * Made-up research data for the guest dashboard (`/guest/dashboard`).
 *
 * Guest mode lets someone who is neither a practitioner nor a researcher see
 * what the research team sees, without ever seeing what the research team
 * sees. So nothing here comes from the API: the dataset is generated in the
 * browser from a fixed seed, and the guest screen never makes a dashboard
 * request at all. There is no code path by which a real row could reach it.
 *
 * Everything is labelled as sample data rather than dressed up as real:
 * practitioner ids read `SAMPLE-01`, every other id starts `sample-`, and the
 * screen around it says so in a banner. A screenshot of it should never be
 * mistakable for the October results.
 *
 * The filter rules are copied from src/lib/server/dashboard.ts — date range on
 * the day, patient type and the condition filters on the *same* patient — so
 * the sample behaves exactly like the real thing when a guest plays with the
 * filters. tests/frontend/sample-dashboard.test.ts parses every output with
 * the contract's own schemas.
 *
 * OWNER: Stream 2.
 */
import {
  dashboardFilterSchema,
  type DashboardEntriesResponse,
  type DashboardEntryRow,
  type DashboardFilter,
  type DashboardSummary,
  type TaxonomyResponse,
} from '../../contract/api'
import {
  CONDITION_CATEGORIES,
  CONDITION_CATEGORY_LABELS,
  DIAGNOSIS_BASES,
  PATIENT_TYPES,
  type ConditionCategory,
  type DiagnosisBasis,
  type GpCoManagement,
  type PatientType,
  type Province,
  type ReferredByGp,
} from '../../contract/enums'
import { CONDITION_TAXONOMY, isOtherCondition } from '../../contract/taxonomy'
import { addDaysToLogDate, dayOfWeek } from '../../dates'
import type { DashboardQuery } from '../api'

/* ------------------------------------------------------------------ *
 * The dataset
 * ------------------------------------------------------------------ */

interface SampleCondition {
  category: ConditionCategory
  conditionCode: string
  diagnosisBasis: DiagnosisBasis
  alsoSeeingGp: GpCoManagement
  referredByGp: ReferredByGp
}

interface SamplePatient {
  id: string
  patientType: PatientType
  conditions: SampleCondition[]
}

interface SampleLog {
  id: string
  logDate: string
  practitionerId: string
  province: Province
  newPatients: number
  followUpPatients: number
  patients: SamplePatient[]
}

/**
 * Twelve made-up practitioners. The last two never log, so the participation
 * card shows a realistic "10 of 12" rather than a perfect score.
 */
const SAMPLE_PRACTITIONERS: { province: Province; logs: boolean }[] = [
  { province: 'Gauteng', logs: true },
  { province: 'Western Cape', logs: true },
  { province: 'KwaZulu-Natal', logs: true },
  { province: 'Gauteng', logs: true },
  { province: 'Eastern Cape', logs: true },
  { province: 'Free State', logs: true },
  { province: 'Western Cape', logs: true },
  { province: 'Limpopo', logs: true },
  { province: 'Mpumalanga', logs: true },
  { province: 'North West', logs: true },
  { province: 'Northern Cape', logs: false },
  { province: 'Gauteng', logs: false },
]

/** A whole illustrative October, so the trend chart has a full month to draw. */
const SAMPLE_START_DATE = '2026-10-01'
const SAMPLE_DAYS = 31

/** Mulberry32 — small, seeded, and identical on every device. */
function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weighted<T>(random: () => number, pairs: readonly (readonly [T, number])[]): T {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of pairs) {
    roll -= weight
    if (roll <= 0) return value
  }
  return pairs[pairs.length - 1][0]
}

function between(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** Mental health and chronic disease lead, as in the brief's expectations. */
const CATEGORY_WEIGHTS = [
  ['MENTAL_HEALTH', 30],
  ['NON_COMMUNICABLE_CHRONIC', 25],
  ['WOMENS_HEALTH_HORMONES', 20],
  ['COMMUNICABLE', 15],
  ['OTHER', 10],
] as const

function sampleCondition(random: () => number): SampleCondition {
  const category = weighted(random, CATEGORY_WEIGHTS)
  // "Other (specify)" rows carry free text, and free text is the one thing a
  // sample has no honest way to invent, so they are left out.
  const inCategory = CONDITION_TAXONOMY.filter(
    (entry) => entry.category === category && !isOtherCondition(entry.code),
  )
  const chosen = inCategory[Math.floor(random() * inCategory.length)]
  return {
    category: chosen.category,
    conditionCode: chosen.code,
    diagnosisBasis: weighted(random, [
      ['CLINICAL_DIAGNOSIS', 60],
      ['PATIENT_REPORTED_PRIOR', 28],
      ['PRESENTING_COMPLAINT_ONLY', 12],
    ] as const),
    alsoSeeingGp: weighted(random, [
      ['YES', 45],
      ['NO', 40],
      ['UNSURE', 15],
    ] as const),
    referredByGp: weighted(random, [
      ['YES', 18],
      ['NO', 52],
      ['NOT_APPLICABLE', 30],
    ] as const),
  }
}

function generate(): SampleLog[] {
  const random = rng(20261001)
  const logs: SampleLog[] = []
  let patientSeq = 0

  for (let offset = 0; offset < SAMPLE_DAYS; offset += 1) {
    const logDate = addDaysToLogDate(SAMPLE_START_DATE, offset)
    // Sundays are not working days.
    if (dayOfWeek(logDate) === 0) continue

    SAMPLE_PRACTITIONERS.forEach((practitioner, index) => {
      // Not everyone logs every day, even among those who log at all.
      if (!practitioner.logs || random() < 0.25) return

      const newPatients = between(random, 0, 6)
      const followUpPatients = between(random, 1, 9)
      const types: PatientType[] = [
        ...Array.from({ length: newPatients }, () => 'NEW' as const),
        ...Array.from({ length: followUpPatients }, () => 'FOLLOW_UP' as const),
      ]

      logs.push({
        id: `sample-log-${pad(logs.length + 1, 4)}`,
        logDate,
        practitionerId: `SAMPLE-${pad(index + 1, 2)}`,
        province: practitioner.province,
        newPatients,
        followUpPatients,
        patients: types.map((patientType) => {
          patientSeq += 1
          // Most patients carry one condition, some two, and some are counted
          // without being itemised — the same mix a real October would have.
          const howMany = weighted(random, [
            [1, 62],
            [2, 22],
            [0, 16],
          ] as const)
          return {
            id: `sample-pt-${pad(patientSeq, 6)}`,
            patientType,
            conditions: Array.from({ length: howMany }, () => sampleCondition(random)),
          }
        }),
      })
    })
  }
  return logs
}

let cached: SampleLog[] | null = null

function dataset(): SampleLog[] {
  cached ??= generate()
  return cached
}

const LABELS = new Map(CONDITION_TAXONOMY.map((entry) => [entry.code, entry.label]))

/* ------------------------------------------------------------------ *
 * Taxonomy — static, so the guest dashboard needs no request at all
 * ------------------------------------------------------------------ */

export function sampleTaxonomy(): TaxonomyResponse {
  return {
    categories: CONDITION_CATEGORIES.map((category) => ({
      code: category,
      label: CONDITION_CATEGORY_LABELS[category],
      conditions: CONDITION_TAXONOMY.filter((entry) => entry.category === category)
        .slice()
        .sort((a, b) => (a.rank ?? 100) - (b.rank ?? 100))
        .map((entry) => ({
          code: entry.code,
          label: entry.label,
          synonyms: entry.synonyms ?? [],
          rank: entry.rank ?? 100,
          isOther: isOtherCondition(entry.code),
        })),
    })),
    version: 'sample',
  }
}

/* ------------------------------------------------------------------ *
 * Filtering — the same rules as src/lib/server/dashboard.ts
 * ------------------------------------------------------------------ */

export type SampleFilterResult =
  | { ok: true; filter: DashboardFilter }
  | { ok: false; message: string }

/**
 * The UI's string-valued query → a contract filter, with the same two
 * refusals the server makes: a value outside the enums, and from > to.
 */
export function parseSampleFilter(query: DashboardQuery): SampleFilterResult {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text.length > 0) raw[key] = text
  }
  const parsed = dashboardFilterSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: 'One of the filters is not valid' }
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    return { ok: false, message: 'The "from" date must be on or before the "to" date' }
  }
  return { ok: true, filter: parsed.data }
}

function hasEntryFilter(filter: DashboardFilter): boolean {
  return Boolean(
    filter.category ||
      filter.conditionCode ||
      filter.diagnosisBasis ||
      filter.alsoSeeingGp ||
      filter.referredByGp,
  )
}

function entryMatches(filter: DashboardFilter, entry: SampleCondition): boolean {
  return (
    (!filter.category || entry.category === filter.category) &&
    (!filter.conditionCode || entry.conditionCode === filter.conditionCode) &&
    (!filter.diagnosisBasis || entry.diagnosisBasis === filter.diagnosisBasis) &&
    (!filter.alsoSeeingGp || entry.alsoSeeingGp === filter.alsoSeeingGp) &&
    (!filter.referredByGp || entry.referredByGp === filter.referredByGp)
  )
}

function patientMatches(filter: DashboardFilter, patient: SamplePatient): boolean {
  if (filter.patientType === 'new' && patient.patientType !== 'NEW') return false
  if (filter.patientType === 'followup' && patient.patientType !== 'FOLLOW_UP') return false
  if (hasEntryFilter(filter)) {
    return patient.conditions.some((entry) => entryMatches(filter, entry))
  }
  return true
}

/** The days, patients and conditions in scope — what both views are built from. */
function scopedLogs(filter: DashboardFilter): SampleLog[] {
  const patientFilter = Boolean(filter.patientType) || hasEntryFilter(filter)
  const out: SampleLog[] = []

  for (const log of dataset()) {
    if (filter.from && log.logDate < filter.from) continue
    if (filter.to && log.logDate > filter.to) continue

    const patients = patientFilter
      ? log.patients.filter((patient) => patientMatches(filter, patient))
      : log.patients
    if (patientFilter && patients.length === 0) continue

    out.push({
      ...log,
      // New before returning, as the server orders them.
      patients: [...patients]
        .sort((a, b) =>
          a.patientType === b.patientType ? 0 : a.patientType === 'NEW' ? -1 : 1,
        )
        .map((patient) => ({
          ...patient,
          conditions: hasEntryFilter(filter)
            ? patient.conditions.filter((entry) => entryMatches(filter, entry))
            : patient.conditions,
        })),
    })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * The two views
 * ------------------------------------------------------------------ */

export function sampleSummary(filter: DashboardFilter): DashboardSummary {
  const logs = scopedLogs(filter)

  const reporting = new Set<string>()
  const byDate = new Map<string, { newPatients: number; followUpPatients: number }>()
  const byCategory = new Map<string, number>()
  const byBasis = new Map<string, number>()
  const byType = new Map<string, { patients: number; entries: number }>()
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
  let patientsWithMultipleConditions = 0

  for (const log of logs) {
    reporting.add(log.practitionerId)
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
      practitioners: SAMPLE_PRACTITIONERS.length,
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
    byCategory: CONDITION_CATEGORIES.map((category) => ({
      category,
      label: CONDITION_CATEGORY_LABELS[category],
      entries: byCategory.get(category) ?? 0,
    })),
    coManagement,
    byDiagnosisBasis: DIAGNOSIS_BASES.map((diagnosisBasis) => ({
      diagnosisBasis,
      entries: byBasis.get(diagnosisBasis) ?? 0,
    })),
    byPatientType: PATIENT_TYPES.map((patientType) => ({
      patientType,
      patients: byType.get(patientType)?.patients ?? 0,
      entries: byType.get(patientType)?.entries ?? 0,
    })),
    patientsWithMultipleConditions,
  }
}

/** One row per condition, as the real table and export flatten them. */
function sampleRows(filter: DashboardFilter): DashboardEntryRow[] {
  const empty = {
    category: null,
    conditionCode: null,
    conditionLabel: null,
    diagnosisBasis: null,
    alsoSeeingGp: null,
    referredByGp: null,
  } as const

  const rows: DashboardEntryRow[] = []
  for (const log of scopedLogs(filter)) {
    const base = {
      logId: log.id,
      practitionerId: log.practitionerId,
      province: log.province,
      logDate: log.logDate,
      newPatients: log.newPatients,
      followUpPatients: log.followUpPatients,
    }
    for (const patient of log.patients) {
      const patientBase = { ...base, patientId: patient.id, patientType: patient.patientType }
      if (patient.conditions.length === 0) {
        rows.push({ ...patientBase, ...empty })
        continue
      }
      for (const entry of patient.conditions) {
        rows.push({
          ...patientBase,
          category: entry.category,
          conditionCode: entry.conditionCode,
          conditionLabel: LABELS.get(entry.conditionCode) ?? null,
          diagnosisBasis: entry.diagnosisBasis,
          alsoSeeingGp: entry.alsoSeeingGp,
          referredByGp: entry.referredByGp,
        })
      }
    }
  }
  return rows
}

export function sampleEntries(filter: DashboardFilter): DashboardEntriesResponse {
  const rows = sampleRows(filter)
  const start = (filter.page - 1) * filter.pageSize
  return {
    rows: rows.slice(start, start + filter.pageSize),
    page: filter.page,
    pageSize: filter.pageSize,
    totalRows: rows.length,
  }
}
