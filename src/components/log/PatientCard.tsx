'use client'

/**
 * One patient on the day, and the conditions treated for them (FR3–FR6).
 *
 * This is the card the per-patient model exists for. The day's counts decide
 * how many of these appear; the practitioner then fills in as much or as
 * little of each as they want to. A card left untouched is still a real
 * record — "a returning patient was seen and their conditions were not
 * itemised" — so nothing here is required and the card never blocks a submit.
 *
 * Only one card is open at a time (the parent owns `open`). With twelve
 * patients on a busy day, twelve expanded cards is several thousand pixels of
 * condition detail between the practitioner and the submit button, and no way
 * to tell at a glance which patient you are actually working on. Collapsed, a
 * card is two lines: who they are, and what is already on them.
 *
 * Because the parent now knows which patient is being worked on, the condition
 * picker can open by itself for a card that has nothing on it yet — opening a
 * card whose only content is an "Add a condition" button would otherwise cost
 * a tap that the old always-expanded layout did not.
 *
 * OWNER: Stream 2.
 */
import { useEffect, useId, useRef, useState } from 'react'

import { ConditionPicker } from '@/components/log/ConditionPicker'
import { SelectedConditionCard } from '@/components/log/SelectedConditionCard'
import type { DraftCondition, DraftPatient } from '@/lib/client/entry'
import type { TaxonomyResponse } from '@/lib/contract/api'
import type { ConditionCategory } from '@/lib/contract/enums'

type TaxonomyCategory = TaxonomyResponse['categories'][number]

interface PatientCardProps {
  patient: DraftPatient
  /** "New patient 2" — the position within its own type, 1-based. */
  title: string
  /** Only one patient is expanded at a time; the parent decides which. */
  open: boolean
  onToggle: () => void
  categories: TaxonomyCategory[]
  labelForCode: Map<string, string>
  conditionErrors: Record<string, string>
  onToggleCondition: (category: ConditionCategory, code: string) => void
  onPatchCondition: (key: string, patch: Partial<DraftCondition>) => void
  onRemoveCondition: (key: string) => void
}

export function PatientCard({
  patient,
  title,
  open,
  onToggle,
  categories,
  labelForCode,
  conditionErrors,
  onToggleCondition,
  onPatchCondition,
  onRemoveCondition,
}: PatientCardProps) {
  const bodyId = useId()

  /**
   * `null` means "however this card would open by itself"; a boolean is the
   * practitioner having said otherwise. Derived rather than stored so that a
   * card which opens with nothing on it lands straight on the picker, without
   * an effect that would fight the practitioner closing it.
   */
  const [pickingOverride, setPickingOverride] = useState<boolean | null>(null)
  const picking = pickingOverride ?? patient.conditions.length === 0

  const selectedCodes = new Set(patient.conditions.map((c) => c.conditionCode))
  const hasError = patient.conditions.some((c) => Boolean(conditionErrors[c.key]))

  /**
   * Opening a card lower down collapses the ones above it, which pulls this
   * card up the page — often clean out of the viewport, so the tap appears to
   * have done nothing. Scroll it back to where the finger is. `nearest` keeps
   * an already-visible card still.
   */
  const cardRef = useRef<HTMLLIElement | null>(null)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    wasOpen.current = open
  }, [open])

  /** What a collapsed card says it holds, so the list is scannable. */
  const summary = patient.conditions
    .map(
      (condition) =>
        condition.conditionOther.trim() ||
        labelForCode.get(condition.conditionCode) ||
        condition.conditionCode,
    )
    .join(' · ')

  return (
    <li
      ref={cardRef}
      className={[
        'scroll-mt-3 rounded-2xl bg-white p-3 ring-1 dark:bg-neutral-900',
        hasError ? 'ring-2 ring-red-500' : 'ring-neutral-200 dark:ring-neutral-800',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-[44px] w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
          </span>
          <span
            className={[
              'block truncate text-xs',
              hasError
                ? 'font-medium text-red-600 dark:text-red-400'
                : 'text-neutral-500 dark:text-neutral-400',
            ].join(' ')}
          >
            {hasError
              ? 'Needs attention'
              : patient.conditions.length === 0
                ? 'No conditions yet'
                : open
                  ? `${patient.conditions.length} condition${patient.conditions.length === 1 ? '' : 's'}`
                  : summary}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={[
            'shrink-0 text-neutral-400 transition-transform duration-150 dark:text-neutral-500',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div id={bodyId}>
          {patient.conditions.length > 0 ? (
            <ul className="mt-2.5 space-y-2.5">
              {patient.conditions.map((condition) => (
                <SelectedConditionCard
                  key={condition.key}
                  condition={condition}
                  label={labelForCode.get(condition.conditionCode) ?? condition.conditionCode}
                  error={conditionErrors[condition.key]}
                  onChange={(patch) => onPatchCondition(condition.key, patch)}
                  onRemove={() => onRemoveCondition(condition.key)}
                />
              ))}
            </ul>
          ) : null}

          {picking && categories.length > 0 ? (
            <div className="mt-3 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
              <ConditionPicker
                frameless
                categories={categories}
                selectedCodes={selectedCodes}
                onToggle={onToggleCondition}
                title={`Conditions for ${title.toLowerCase()}`}
                hint="Tap a category, then tap every condition you treated."
              />
              <button
                type="button"
                onClick={() => setPickingOverride(false)}
                className="mt-2 min-h-[44px] w-full rounded-xl bg-neutral-200 text-sm font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100"
              >
                Done adding conditions
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingOverride(true)}
              disabled={categories.length === 0}
              className="mt-2.5 min-h-[44px] w-full rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-700 disabled:opacity-40 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              {patient.conditions.length === 0 ? '+ Add a condition' : '+ Add another'}
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}
