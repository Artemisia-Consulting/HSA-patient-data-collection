'use client'

/**
 * The flat entry table — the same rows, in the same order, as the CSV export,
 * so what a researcher checks on screen is what they get in the download.
 *
 * A row is one condition for one patient on one day. A day where patients were
 * seen but nothing was itemised still appears, with empty condition columns:
 * "twelve patients, none itemised" is a real observation and dropping it would
 * quietly bias the totals.
 *
 * `patientId` is shown truncated, as a grouping key: two rows sharing it are
 * two conditions for the same visit. It is random per visit and never reused,
 * so it cannot follow a person from one day to the next.
 *
 * OWNER: Stream 2.
 */
import type { DashboardEntriesResponse, DashboardEntryRow } from '@/lib/contract/api'
import {
  CONDITION_CATEGORY_LABELS,
  DIAGNOSIS_BASIS_LABELS,
  GP_CO_MANAGEMENT_LABELS,
  PATIENT_TYPE_LABELS,
  REFERRED_BY_GP_LABELS,
} from '@/lib/contract/enums'
import { NUMBER, fullLogDate } from './format'

const TH =
  'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400'
const TD = 'whitespace-nowrap px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200'

/** Enough of an id to group rows by eye, without pretending to be readable. */
function shortId(id: string | null): string {
  return id ? id.slice(-6) : '—'
}

function ConditionCell({ row }: { row: DashboardEntryRow }) {
  if (!row.conditionCode) {
    return (
      <span className="text-neutral-400 dark:text-neutral-500">Not itemised</span>
    )
  }
  return <span>{row.conditionLabel ?? row.conditionCode}</span>
}

interface EntriesTableProps {
  entries: DashboardEntriesResponse
  onPageChange: (page: number) => void
  busy: boolean
}

export function EntriesTable({ entries, onPageChange, busy }: EntriesTableProps) {
  const { rows, page, pageSize, totalRows } = entries
  const lastPage = Math.max(1, Math.ceil(totalRows / pageSize))
  const first = totalRows === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, totalRows)

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Entries
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {totalRows === 0
            ? 'No rows match these filters'
            : `Showing ${NUMBER.format(first)}–${NUMBER.format(last)} of ${NUMBER.format(totalRows)}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-neutral-50 dark:bg-neutral-950/40">
            <tr>
              <th scope="col" className={TH}>
                Date
              </th>
              <th scope="col" className={TH}>
                Province
              </th>
              <th scope="col" className={TH}>
                Practitioner
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Day total
              </th>
              <th scope="col" className={TH}>
                Patient
              </th>
              <th scope="col" className={TH}>
                Category
              </th>
              <th scope="col" className={TH}>
                Condition
              </th>
              <th scope="col" className={TH}>
                Diagnosis basis
              </th>
              <th scope="col" className={TH}>
                Also seeing
              </th>
              <th scope="col" className={TH}>
                Referred
              </th>
            </tr>
          </thead>
          <tbody className={busy ? 'opacity-50' : undefined}>
            {rows.map((row, index) => (
              <tr
                key={`${row.logId}-${row.patientId ?? 'none'}-${index}`}
                className="border-t border-neutral-100 dark:border-neutral-800"
              >
                <td className={TD}>{fullLogDate(row.logDate)}</td>
                <td className={TD}>{row.province ?? '—'}</td>
                <td className={`${TD} font-mono text-xs`}>{shortId(row.practitionerId)}</td>
                <td className={`${TD} text-right tabular-nums`}>
                  {row.newPatients + row.followUpPatients}
                </td>
                <td className={TD}>
                  {row.patientType ? (
                    <span>
                      {PATIENT_TYPE_LABELS[row.patientType]}
                      <span className="ml-1.5 font-mono text-xs text-neutral-400 dark:text-neutral-500">
                        {shortId(row.patientId)}
                      </span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={TD}>
                  {row.category ? CONDITION_CATEGORY_LABELS[row.category] : '—'}
                </td>
                <td className={TD}>
                  <ConditionCell row={row} />
                </td>
                <td className={TD}>
                  {row.diagnosisBasis ? DIAGNOSIS_BASIS_LABELS[row.diagnosisBasis] : '—'}
                </td>
                <td className={TD}>
                  {row.alsoSeeingGp ? GP_CO_MANAGEMENT_LABELS[row.alsoSeeingGp] : '—'}
                </td>
                <td className={TD}>
                  {row.referredByGp ? REFERRED_BY_GP_LABELS[row.referredByGp] : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalRows > pageSize ? (
        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <button
            type="button"
            disabled={page <= 1 || busy}
            onClick={() => onPageChange(page - 1)}
            className="min-h-[44px] rounded-xl px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            ← Previous
          </button>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Page {NUMBER.format(page)} of {NUMBER.format(lastPage)}
          </span>
          <button
            type="button"
            disabled={page >= lastPage || busy}
            onClick={() => onPageChange(page + 1)}
            className="min-h-[44px] rounded-xl px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Next →
          </button>
        </div>
      ) : null}
    </section>
  )
}
