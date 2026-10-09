/**
 * The Excel export (FR8): the same rows as the CSV, laid out for a person
 * rather than a statistics package.
 *
 *  - "Entries" — one row per condition, with readable headers and answers
 *    ("Returning", "Yes", "My diagnosis") instead of stored codes, dates as
 *    real dates, a frozen header and filter dropdowns.
 *  - "Summary" — the dashboard's figures for the same filters, so the numbers
 *    in a report can be traced to a file someone can keep.
 *
 * The column list is keyed by the contract row type, so adding a field to
 * `dashboardEntryRowSchema` is a compile error here until it is given a
 * column — the workbook cannot silently fall behind the CSV.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import {
  CONDITION_CATEGORY_LABELS,
  DIAGNOSIS_BASIS_LABELS,
  GP_CO_MANAGEMENT_LABELS,
  PATIENT_TYPE_LABELS,
  REFERRED_BY_GP_LABELS,
  type DashboardEntryRow,
  type DashboardFilter,
  type DashboardSummary,
} from '@/lib/contract'

import type { XlsxCell, XlsxSheet } from './xlsx'

interface Column {
  header: string
  width: number
  value: (row: DashboardEntryRow) => XlsxCell
}

/** Display order is the declaration order of this object. */
const ENTRY_COLUMNS = {
  logDate: { header: 'Date seen', width: 12, value: (r) => ({ date: r.logDate }) },
  province: { header: 'Province', width: 16, value: (r) => r.province },
  practitionerId: { header: 'Practitioner ID', width: 28, value: (r) => r.practitionerId },
  patientId: { header: 'Patient ID', width: 28, value: (r) => r.patientId },
  patientType: {
    header: 'Patient type',
    width: 13,
    value: (r) => (r.patientType ? PATIENT_TYPE_LABELS[r.patientType] : null),
  },
  category: {
    header: 'Category',
    width: 34,
    value: (r) => (r.category ? CONDITION_CATEGORY_LABELS[r.category] : null),
  },
  conditionLabel: { header: 'Condition', width: 36, value: (r) => r.conditionLabel },
  conditionCode: { header: 'Condition code', width: 20, value: (r) => r.conditionCode },
  diagnosisBasis: {
    header: 'How the diagnosis was arrived at',
    width: 20,
    value: (r) => (r.diagnosisBasis ? DIAGNOSIS_BASIS_LABELS[r.diagnosisBasis] : null),
  },
  alsoSeeingGp: {
    header: 'Also seeing a conventional practitioner?',
    width: 18,
    value: (r) => (r.alsoSeeingGp ? GP_CO_MANAGEMENT_LABELS[r.alsoSeeingGp] : null),
  },
  referredByGp: {
    header: 'Referred by a conventional practitioner?',
    width: 18,
    value: (r) => (r.referredByGp ? REFERRED_BY_GP_LABELS[r.referredByGp] : null),
  },
  newPatients: { header: 'New patients that day', width: 12, value: (r) => r.newPatients },
  followUpPatients: {
    header: 'Returning patients that day',
    width: 12,
    value: (r) => r.followUpPatients,
  },
  logId: { header: 'Log ID', width: 28, value: (r) => r.logId },
} satisfies Record<keyof DashboardEntryRow, Column>

export const WORKBOOK_ENTRY_COLUMNS: Column[] = Object.values(ENTRY_COLUMNS)

function entriesSheet(rows: DashboardEntryRow[]): XlsxSheet {
  return {
    name: 'Entries',
    header: true,
    widths: WORKBOOK_ENTRY_COLUMNS.map((column) => column.width),
    rows: [
      WORKBOOK_ENTRY_COLUMNS.map((column) => column.header),
      ...rows.map((row) => WORKBOOK_ENTRY_COLUMNS.map((column) => column.value(row))),
    ],
  }
}

/* ------------------------------------------------------------------ *
 * Summary sheet
 * ------------------------------------------------------------------ */

/** "33%" — rounded, and blank rather than "NaN%" when there is nothing. */
function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : ''
}

/** The filters in words, so a file opened next month still says what it holds. */
export function describeFilter(
  filter: DashboardFilter,
  conditionLabel: (code: string) => string | undefined,
): string[] {
  const lines: string[] = []
  if (filter.from && filter.to) lines.push(`Dates: ${filter.from} to ${filter.to}`)
  else if (filter.from) lines.push(`Dates: from ${filter.from}`)
  else if (filter.to) lines.push(`Dates: up to ${filter.to}`)
  if (filter.patientType) {
    lines.push(`Patients: ${filter.patientType === 'new' ? 'New only' : 'Returning only'}`)
  }
  if (filter.category) lines.push(`Category: ${CONDITION_CATEGORY_LABELS[filter.category]}`)
  if (filter.conditionCode) {
    lines.push(`Condition: ${conditionLabel(filter.conditionCode) ?? filter.conditionCode}`)
  }
  if (filter.diagnosisBasis) {
    lines.push(`Diagnosis basis: ${DIAGNOSIS_BASIS_LABELS[filter.diagnosisBasis]}`)
  }
  if (filter.alsoSeeingGp) {
    lines.push(
      `Also seeing a conventional practitioner: ${GP_CO_MANAGEMENT_LABELS[filter.alsoSeeingGp]}`,
    )
  }
  if (filter.referredByGp) {
    lines.push(
      `Referred by a conventional practitioner: ${REFERRED_BY_GP_LABELS[filter.referredByGp]}`,
    )
  }
  return lines.length > 0 ? lines : ['None — every entry']
}

function summarySheet(
  summary: DashboardSummary,
  filterLines: string[],
  exportedOn: string,
): XlsxSheet {
  const rows: XlsxCell[][] = []
  const bold: number[] = []
  const heading = (...cells: XlsxCell[]) => {
    bold.push(rows.length)
    rows.push(cells)
  }
  const gap = () => rows.push([])

  const { totals, coManagement } = summary
  const conditions = totals.conditionEntries

  heading('HSA patient data — summary')
  rows.push(['Exported', { date: exportedOn }])
  filterLines.forEach((line, i) => rows.push([i === 0 ? 'Filters' : '', line]))
  gap()

  heading('Totals', 'Count')
  rows.push(['Patients seen', totals.totalPatients])
  rows.push(['  New', totals.newPatients])
  rows.push(['  Returning', totals.followUpPatients])
  rows.push(['Conditions recorded', conditions])
  rows.push(['Patients with more than one condition', summary.patientsWithMultipleConditions])
  rows.push(['Practitioners reporting', totals.practitionersReporting])
  rows.push(['Practitioners registered', totals.practitioners])
  rows.push(['Days logged (practitioner-days)', totals.logDays])
  gap()

  heading('Conditions by category', 'Conditions', '% of conditions')
  for (const row of summary.byCategory) {
    rows.push([row.label, row.entries, percent(row.entries, conditions)])
  }
  gap()

  heading('How the diagnosis was arrived at', 'Conditions', '% of conditions')
  for (const row of summary.byDiagnosisBasis) {
    rows.push([
      DIAGNOSIS_BASIS_LABELS[row.diagnosisBasis],
      row.entries,
      percent(row.entries, conditions),
    ])
  }
  gap()

  heading('Conventional medical care', 'Yes', 'No', 'Unsure / N/A', '% Yes')
  rows.push([
    'Also seeing a conventional practitioner?',
    coManagement.alsoSeeingGpYes,
    coManagement.alsoSeeingGpNo,
    coManagement.alsoSeeingGpUnsure,
    percent(coManagement.alsoSeeingGpYes, conditions),
  ])
  rows.push([
    'Referred by a conventional practitioner?',
    coManagement.referredByGpYes,
    coManagement.referredByGpNo,
    coManagement.referredByGpNotApplicable,
    percent(coManagement.referredByGpYes, conditions),
  ])
  rows.push(['(Counted per condition recorded, not per patient.)'])
  gap()

  heading('Patients per day', 'New', 'Returning', 'Total')
  for (const day of summary.byDate) {
    rows.push([
      { date: day.logDate },
      day.newPatients,
      day.followUpPatients,
      day.newPatients + day.followUpPatients,
    ])
  }

  return { name: 'Summary', rows, boldRows: bold, widths: [42, 14, 14, 16, 10] }
}

export function buildExportWorkbook(input: {
  rows: DashboardEntryRow[]
  summary: DashboardSummary
  filterLines: string[]
  exportedOn: string
}): XlsxSheet[] {
  return [
    entriesSheet(input.rows),
    summarySheet(input.summary, input.filterLines, input.exportedOn),
  ]
}
