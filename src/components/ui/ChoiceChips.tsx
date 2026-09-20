'use client'

/**
 * A single-select row of chips — the pattern used for every per-condition flag
 * (FR5, FR6).
 *
 * A native `<select>` would be one tap plus a system picker plus a second tap.
 * Chips are one tap, and the *current* value is readable without opening
 * anything, which is what lets the contract defaults genuinely cost zero time:
 * the practitioner can see "My clinical diagnosis" is already chosen and move
 * on, or change it in a single tap.
 *
 * Implemented as a radiogroup so a screen reader announces it as one control
 * with a current value, not as four unrelated buttons.
 *
 * OWNER: Stream 2.
 */
import { useId } from 'react'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** Optional shorter label for narrow chips. */
  shortLabel?: string
}

interface ChoiceChipsProps<T extends string> {
  legend: string
  /** Hide the legend visually but keep it for assistive tech. */
  hideLegend?: boolean
  options: readonly ChoiceOption<T>[]
  value: T
  onChange: (value: T) => void
  /** `auto` wraps; `equal` gives every chip the same width. */
  layout?: 'auto' | 'equal'
  size?: 'sm' | 'md'
}

export function ChoiceChips<T extends string>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  layout = 'auto',
  size = 'md',
}: ChoiceChipsProps<T>) {
  const groupId = useId()

  return (
    <div role="radiogroup" aria-labelledby={`${groupId}-legend`}>
      <span
        id={`${groupId}-legend`}
        className={
          hideLegend
            ? 'sr-only'
            : 'mb-1.5 block text-sm font-medium text-neutral-600 dark:text-neutral-300'
        }
      >
        {legend}
      </span>
      <div className={layout === 'equal' ? 'grid grid-flow-col gap-2' : 'flex flex-wrap gap-2'}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={[
                'rounded-full font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hsa-600',
                size === 'sm'
                  ? 'min-h-[44px] px-3.5 text-sm'
                  : 'min-h-[48px] px-4 text-base',
                selected
                  ? 'bg-hsa-600 text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700 dark:hover:bg-neutral-700',
              ].join(' ')}
            >
              {option.shortLabel ?? option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
