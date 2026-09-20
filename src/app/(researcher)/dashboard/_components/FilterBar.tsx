'use client'

/**
 * The dashboard filter. Every control maps one-to-one onto a field of
 * `dashboardFilterSchema`, so what the screen can ask and what the API can
 * answer are the same set by construction.
 *
 * Changes apply immediately rather than behind an "Apply" button: each one is
 * a single discrete choice, and the researcher is on a laptop rather than
 * South African mobile data.
 *
 * OWNER: Stream 2.
 */
import type { TaxonomyResponse } from '@/lib/contract/api'
import {
  CONDITION_CATEGORIES,
  CONDITION_CATEGORY_LABELS,
  DIAGNOSIS_BASES,
  DIAGNOSIS_BASIS_LABELS,
  GP_CO_MANAGEMENT,
  GP_CO_MANAGEMENT_LABELS,
  REFERRED_BY_GP,
  REFERRED_BY_GP_LABELS,
} from '@/lib/contract/enums'
import type { DashboardQuery } from '@/lib/client'

const FIELD =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 ' +
  'focus:border-hsa-600 focus:outline-2 focus:outline-offset-1 focus:outline-hsa-600 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100'

const LABEL = 'mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-400'

interface FilterBarProps {
  value: DashboardQuery
  /** Patch semantics: only the keys given change. */
  onChange: (patch: DashboardQuery) => void
  onReset: () => void
  /** Drives the condition list. Null until the taxonomy has loaded. */
  taxonomy: TaxonomyResponse | null
  exportUrl: string
  busy: boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  )
}

export function FilterBar({
  value,
  onChange,
  onReset,
  taxonomy,
  exportUrl,
  busy,
}: FilterBarProps) {
  const text = (key: keyof DashboardQuery) => String(value[key] ?? '')

  /**
   * Conditions narrow to the chosen category, because a flat list of ~45 codes
   * with no grouping is unusable. With no category chosen they are grouped by
   * one, which is the same information without the pre-filter.
   */
  const categories = taxonomy?.categories ?? []
  const shown = value.category
    ? categories.filter((group) => group.code === value.category)
    : categories

  return (
    <section
      aria-label="Filters"
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Field label="From">
          <input
            type="date"
            className={FIELD}
            value={text('from')}
            onChange={(event) => onChange({ from: event.target.value })}
          />
        </Field>

        <Field label="To">
          <input
            type="date"
            className={FIELD}
            value={text('to')}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </Field>

        <Field label="Patient type">
          <select
            className={FIELD}
            value={text('patientType')}
            onChange={(event) => onChange({ patientType: event.target.value })}
          >
            <option value="">All patients</option>
            <option value="new">New only</option>
            <option value="followup">Returning only</option>
          </select>
        </Field>

        <Field label="Category">
          <select
            className={FIELD}
            value={text('category')}
            onChange={(event) =>
              // A condition code from the old category would contradict the new
              // one and return nothing, so it goes when the category changes.
              onChange({ category: event.target.value, conditionCode: '' })
            }
          >
            <option value="">All categories</option>
            {CONDITION_CATEGORIES.map((code) => (
              <option key={code} value={code}>
                {CONDITION_CATEGORY_LABELS[code]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Condition">
          <select
            className={FIELD}
            value={text('conditionCode')}
            disabled={!taxonomy}
            onChange={(event) => onChange({ conditionCode: event.target.value })}
          >
            <option value="">All conditions</option>
            {shown.map((group) => (
              <optgroup key={group.code} label={group.label}>
                {group.conditions.map((condition) => (
                  <option key={condition.code} value={condition.code}>
                    {condition.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field label="Diagnosis basis">
          <select
            className={FIELD}
            value={text('diagnosisBasis')}
            onChange={(event) => onChange({ diagnosisBasis: event.target.value })}
          >
            <option value="">Any basis</option>
            {DIAGNOSIS_BASES.map((code) => (
              <option key={code} value={code}>
                {DIAGNOSIS_BASIS_LABELS[code]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3 xl:col-span-1 xl:grid-cols-1">
          <Field label="Also seeing a conventional practitioner">
            <select
              className={FIELD}
              value={text('alsoSeeingGp')}
              onChange={(event) => onChange({ alsoSeeingGp: event.target.value })}
            >
              <option value="">Any answer</option>
              {GP_CO_MANAGEMENT.map((code) => (
                <option key={code} value={code}>
                  {GP_CO_MANAGEMENT_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Referred by a conventional practitioner">
            <select
              className={FIELD}
              value={text('referredByGp')}
              onChange={(event) => onChange({ referredByGp: event.target.value })}
            >
              <option value="">Any answer</option>
              {REFERRED_BY_GP.map((code) => (
                <option key={code} value={code}>
                  {REFERRED_BY_GP_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <a
          href={exportUrl}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-hsa-600 px-4 text-sm font-semibold text-white hover:bg-hsa-700"
        >
          Download CSV
        </a>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Clear filters
        </button>
        <span
          aria-live="polite"
          className="text-xs text-neutral-500 dark:text-neutral-400"
        >
          {busy ? 'Updating…' : 'The CSV export uses exactly these filters.'}
        </span>
      </div>
    </section>
  )
}
