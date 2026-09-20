'use client'

/**
 * The log date (FR3: auto-filled, editable).
 *
 * "Today" comes from the server's SAST reckoning, not the phone's clock — a
 * practitioner whose device is on the wrong timezone, or who is logging at
 * 00:20 after a late call-out, must still file the entry under the right SAST
 * day. `todayInSast` is used only as a fallback if the session has not landed.
 *
 * Yesterday gets its own chip because the realistic failure mode is forgetting
 * and catching up the next morning, and that should not cost a date picker.
 *
 * OWNER: Stream 2.
 */
import { useId, useState } from 'react'

import {
  COLLECTION_END_DATE,
  COLLECTION_START_DATE,
  EARLY_ENTRY_FROM_DATE,
  addDaysToLogDate,
  formatLogDateLong,
} from '@/lib/dates'

interface DateFieldProps {
  value: string
  today: string
  onChange: (logDate: string) => void
}

export function DateField({ value, today, onChange }: DateFieldProps) {
  const inputId = useId()
  const [showPicker, setShowPicker] = useState(false)

  const yesterday = addDaysToLogDate(today, -1)
  const isToday = value === today
  const isYesterday = value === yesterday
  const isCustom = !isToday && !isYesterday
  // Two different notes, because the two sides of the window mean opposite
  // things: a day before the study opens is saved but not counted, a day
  // after it closes cannot be saved at all.
  const beforeStudy = value < COLLECTION_START_DATE
  const afterStudy = value > COLLECTION_END_DATE

  const chip = (selected: boolean) =>
    [
      'min-h-[44px] rounded-full px-4 text-sm font-semibold transition-colors',
      selected
        ? 'bg-hsa-600 text-white'
        : 'bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700',
    ].join(' ')

  return (
    <section
      aria-labelledby={`${inputId}-label`}
      className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          id={`${inputId}-label`}
          className="text-base font-semibold text-neutral-900 dark:text-neutral-100"
        >
          Date
        </h2>
        <p className="text-sm text-neutral-600 tabular-nums dark:text-neutral-300">
          {formatLogDateLong(value)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={chip(isToday)} onClick={() => onChange(today)}>
          Today
        </button>
        <button
          type="button"
          className={chip(isYesterday)}
          onClick={() => onChange(yesterday)}
        >
          Yesterday
        </button>
        <button
          type="button"
          className={chip(isCustom)}
          aria-expanded={showPicker || isCustom}
          onClick={() => setShowPicker((open) => !open)}
        >
          Another day
        </button>
      </div>

      {showPicker || isCustom ? (
        <div className="mt-2">
          <label htmlFor={inputId} className="sr-only">
            Choose a date
          </label>
          <input
            id={inputId}
            type="date"
            value={value}
            min={EARLY_ENTRY_FROM_DATE}
            max={today}
            onChange={(event) => {
              if (event.target.value) onChange(event.target.value)
            }}
            className="min-h-[48px] w-full rounded-xl bg-neutral-50 px-3 text-base text-neutral-900 ring-1 ring-inset ring-neutral-300 focus:ring-2 focus:ring-hsa-600 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-700"
          />
        </div>
      ) : null}

      {beforeStudy ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          This day is before the study opens. It will be saved so you can use the
          app now, but only entries from{' '}
          {formatLogDateLong(COLLECTION_START_DATE)} onwards are part of the
          research.
        </p>
      ) : afterStudy ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          The collection closed on {formatLogDateLong(COLLECTION_END_DATE)}. This
          day can’t be logged.
        </p>
      ) : null}
    </section>
  )
}
