'use client'

/**
 * One selected condition and its three flags (FR5, FR6).
 *
 * The flags are rendered expanded, not behind a disclosure. Hiding them would
 * make the card shorter but would put a tap between the practitioner and
 * changing a value — and the brief's requirement is that the defaults are
 * preselected *and* editable without extra taps. As rendered, the common case
 * costs zero taps (the defaults are already right and visibly so) and the
 * uncommon case costs exactly one.
 *
 * `conditionOther` only exists for the category's "Other" row, and the card
 * marks it required there, because the contract refuses the entry without it.
 *
 * OWNER: Stream 2.
 */
import { ChoiceChips } from '@/components/ui/ChoiceChips'
import type { DraftCondition } from '@/lib/client/entry'
import {
  CONDITION_CATEGORY_LABELS,
  DIAGNOSIS_BASES,
  DIAGNOSIS_BASIS_LABELS,
  GP_CO_MANAGEMENT,
  GP_CO_MANAGEMENT_LABELS,
  REFERRED_BY_GP,
  REFERRED_BY_GP_LABELS,
  type DiagnosisBasis,
  type GpCoManagement,
  type ReferredByGp,
} from '@/lib/contract/enums'
import { isOtherCondition } from '@/lib/contract/taxonomy'

const DIAGNOSIS_OPTIONS = DIAGNOSIS_BASES.map((value) => ({
  value,
  label: DIAGNOSIS_BASIS_LABELS[value],
  shortLabel:
    value === 'CLINICAL_DIAGNOSIS'
      ? 'My diagnosis'
      : value === 'PATIENT_REPORTED_PRIOR'
        ? 'Patient-reported'
        : 'Complaint only',
}))

const GP_OPTIONS = GP_CO_MANAGEMENT.map((value) => ({
  value,
  label: GP_CO_MANAGEMENT_LABELS[value],
}))

const REFERRED_OPTIONS = REFERRED_BY_GP.map((value) => ({
  value,
  label: REFERRED_BY_GP_LABELS[value],
}))

interface SelectedConditionCardProps {
  condition: DraftCondition
  /** Display label from the taxonomy — never the raw code. */
  label: string
  error?: string
  onChange: (patch: Partial<DraftCondition>) => void
  onRemove: () => void
}

export function SelectedConditionCard({
  condition,
  label,
  error,
  onChange,
  onRemove,
}: SelectedConditionCardProps) {
  const needsFreeText = isOtherCondition(condition.conditionCode)
  const textId = `other-${condition.key}`

  return (
    <li
      className={[
        'rounded-2xl bg-white p-3 ring-1 dark:bg-neutral-900',
        error
          ? 'ring-2 ring-red-500'
          : 'ring-neutral-200 dark:ring-neutral-800',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {label}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {CONDITION_CATEGORY_LABELS[condition.category]}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          ✕
        </button>
      </div>

      {needsFreeText ? (
        <div className="mt-2">
          <label
            htmlFor={textId}
            className="mb-1 block text-sm font-medium text-neutral-600 dark:text-neutral-300"
          >
            Describe the condition <span aria-hidden="true">*</span>
          </label>
          <input
            id={textId}
            type="text"
            maxLength={120}
            required
            value={condition.conditionOther}
            onChange={(event) => onChange({ conditionOther: event.target.value })}
            placeholder="e.g. chronic fatigue after surgery"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${textId}-error` : undefined}
            className="min-h-[48px] w-full rounded-xl bg-neutral-50 px-3 text-base text-neutral-900 ring-1 ring-inset ring-neutral-300 focus:ring-2 focus:ring-hsa-600 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-700"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Describe the condition only — never a patient’s name or details.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          id={`${textId}-error`}
          role="alert"
          className="mt-1.5 text-sm font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3 space-y-2.5">
        <ChoiceChips<DiagnosisBasis>
          legend="How did you arrive at this?"
          options={DIAGNOSIS_OPTIONS}
          value={condition.diagnosisBasis}
          onChange={(diagnosisBasis) => onChange({ diagnosisBasis })}
          size="sm"
        />
        <ChoiceChips<GpCoManagement>
          legend="Also seeing a GP for this?"
          options={GP_OPTIONS}
          value={condition.alsoSeeingGp}
          onChange={(alsoSeeingGp) => onChange({ alsoSeeingGp })}
          size="sm"
        />
        <ChoiceChips<ReferredByGp>
          legend="Referred by a GP?"
          options={REFERRED_OPTIONS}
          value={condition.referredByGp}
          onChange={(referredByGp) => onChange({ referredByGp })}
          size="sm"
        />
      </div>
    </li>
  )
}
