'use client'

/**
 * The patient-count control, and the single biggest lever on the 30-second
 * target (FR3).
 *
 * Three input paths, in the order a tired practitioner will reach for them:
 *
 *  1. The 0–9 grid — one tap sets the value outright. Most South African
 *     homeopaths see single digits of new patients in a day, so the common
 *     case is one tap per counter, not eight taps on a "+".
 *  2. − / + for nudging, and for anything past 9.
 *  3. The value itself is a real numeric input, so 23 can just be typed.
 *
 * The 16px font size on that input is load-bearing: below it, iOS Safari zooms
 * the viewport on focus and the practitioner has to pinch back out.
 *
 * OWNER: Stream 2.
 */
import { useId } from 'react'

const QUICK_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

interface CountPickerProps {
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
  max?: number
}

export function CountPicker({
  label,
  hint,
  value,
  onChange,
  max = 200,
}: CountPickerProps) {
  const inputId = useId()

  const clamp = (next: number) => Math.min(max, Math.max(0, next))

  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <label
            htmlFor={inputId}
            className="block text-base font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {label}
          </label>
          {hint ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(clamp(value - 1))}
            disabled={value <= 0}
            aria-label={`One fewer ${label}`}
            className="h-11 w-11 rounded-full bg-neutral-100 text-2xl leading-none font-semibold text-neutral-700 disabled:opacity-40 dark:bg-neutral-800 dark:text-neutral-200"
          >
            −
          </button>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={max}
            value={value}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10)
              onChange(Number.isNaN(next) ? 0 : clamp(next))
            }}
            className="h-11 w-16 rounded-xl bg-neutral-50 text-center text-[19px] font-bold tabular-nums text-neutral-900 ring-1 ring-inset ring-neutral-300 focus:ring-2 focus:ring-hsa-600 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-700"
          />
          <button
            type="button"
            onClick={() => onChange(clamp(value + 1))}
            disabled={value >= max}
            aria-label={`One more ${label}`}
            className="h-11 w-11 rounded-full bg-neutral-100 text-2xl leading-none font-semibold text-neutral-700 disabled:opacity-40 dark:bg-neutral-800 dark:text-neutral-200"
          >
            +
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label={`Quick set ${label}`}
        className="mt-2.5 grid grid-cols-5 gap-1.5"
      >
        {QUICK_VALUES.map((quick) => {
          const selected = quick === value
          return (
            <button
              key={quick}
              type="button"
              aria-pressed={selected}
              aria-label={`Set ${label} to ${quick}`}
              onClick={() => onChange(quick)}
              className={[
                'min-h-[44px] rounded-lg text-base font-semibold tabular-nums transition-colors',
                selected
                  ? 'bg-hsa-600 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
              ].join(' ')}
            >
              {quick}
            </button>
          )
        })}
      </div>
    </div>
  )
}
