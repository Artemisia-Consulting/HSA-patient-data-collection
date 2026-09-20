'use client'

/**
 * The headline numbers. These are the figures the HSA report opens with, so
 * they are the first thing on the page and are readable without scrolling.
 *
 * `practitionersReporting` sits next to `practitioners` on purpose: "48 of 96
 * registered practitioners reported in this period" is the participation rate,
 * and it is the number that decides whether the dataset means anything.
 *
 * OWNER: Stream 2.
 */
import type { DashboardSummary } from '@/lib/contract/api'
import { PATIENT_TYPE_LABELS } from '@/lib/contract/enums'

const NUMBER = new Intl.NumberFormat('en-ZA')

function Card({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div
      className={[
        'rounded-2xl border p-4 shadow-sm',
        emphasis
          ? 'border-hsa-600/30 bg-hsa-50 dark:border-hsa-500/30 dark:bg-neutral-900'
          : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900',
      ].join(' ')}
    >
      <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{label}</p>
      <p
        className={[
          'mt-1 text-3xl font-bold tabular-nums',
          emphasis
            ? 'text-hsa-700 dark:text-hsa-100'
            : 'text-neutral-900 dark:text-neutral-50',
        ].join(' ')}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      ) : null}
    </div>
  )
}

export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const { totals, byPatientType, patientsWithMultipleConditions } = summary

  const patientsSeen = byPatientType.reduce((sum, row) => sum + row.patients, 0)
  const multiplePercent =
    patientsSeen > 0
      ? Math.round((patientsWithMultipleConditions / patientsSeen) * 100)
      : 0

  const participation =
    totals.practitioners > 0
      ? Math.round((totals.practitionersReporting / totals.practitioners) * 100)
      : 0

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Card
        label="Patients seen"
        value={NUMBER.format(totals.totalPatients)}
        hint={`${NUMBER.format(totals.newPatients)} new · ${NUMBER.format(totals.followUpPatients)} returning`}
        emphasis
      />
      <Card
        label="Conditions recorded"
        value={NUMBER.format(totals.conditionEntries)}
        hint="One row per condition per patient"
      />
      <Card
        label="Practitioners reporting"
        value={`${NUMBER.format(totals.practitionersReporting)} / ${NUMBER.format(totals.practitioners)}`}
        hint={`${participation}% of those registered`}
      />
      <Card
        label="Days logged"
        value={NUMBER.format(totals.logDays)}
        hint="Practitioner-days with an entry"
      />
      <Card
        label="Multiple conditions"
        value={NUMBER.format(patientsWithMultipleConditions)}
        hint={`${multiplePercent}% of patients presented with more than one`}
      />
      <Card
        label="Conditions per patient"
        value={
          patientsSeen > 0
            ? (totals.conditionEntries / patientsSeen).toFixed(2)
            : '—'
        }
        hint={byPatientType
          .map(
            (row) =>
              `${PATIENT_TYPE_LABELS[row.patientType]} ${
                row.patients > 0 ? (row.entries / row.patients).toFixed(2) : '—'
              }`,
          )
          .join(' · ')}
      />
    </div>
  )
}
