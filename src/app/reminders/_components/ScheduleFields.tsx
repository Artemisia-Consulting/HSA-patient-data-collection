'use client'

/**
 * Reminder time and the Saturday toggle (FR7).
 *
 * The default is 18:00 SAST, Monday to Friday. Sunday is never offered —
 * it is a rule of the collection, not a preference, so there is no control
 * for it and the dispatcher would refuse anyway.
 *
 * The quick-pick row exists because a native time input is fiddly with a
 * thumb; the input stays for anyone who wants 17:45.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
const QUICK_TIMES = ['17:00', '18:00', '19:00', '20:00'] as const

export function ScheduleFields({
  time,
  includeSaturday,
  timeError,
  onTimeChange,
  onIncludeSaturdayChange,
  disabled,
}: {
  time: string
  includeSaturday: boolean
  timeError?: string
  onTimeChange: (value: string) => void
  onIncludeSaturdayChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="text-sm font-semibold">When?</legend>

      <div className="space-y-2">
        <label htmlFor="reminderTime" className="block text-sm font-medium">
          Reminder time <span className="font-normal opacity-70">(South African time)</span>
        </label>
        <input
          id="reminderTime"
          name="reminderTime"
          type="time"
          step={300}
          value={time}
          onChange={(event) => onTimeChange(event.target.value)}
          aria-invalid={Boolean(timeError)}
          aria-describedby={timeError ? 'reminderTime-error' : undefined}
          className="min-h-[44px] w-full rounded-lg border border-black/20 px-3 py-2 text-base dark:border-white/25"
        />
        {timeError ? (
          <p id="reminderTime-error" role="alert" className="text-xs text-red-600">
            {timeError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {QUICK_TIMES.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => onTimeChange(quick)}
              aria-pressed={time === quick}
              className={[
                'rounded-full border px-4 py-2 text-sm transition',
                time === quick
                  ? 'border-hsa-600 bg-hsa-600 text-white'
                  : 'border-black/15 hover:border-black/30 dark:border-white/20',
              ].join(' ')}
            >
              {quick}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-black/15 px-4 py-3 dark:border-white/20">
        <span className="flex flex-col">
          <span id="saturday-label" className="text-base font-medium">
            Also remind me on Saturdays
          </span>
          <span className="text-xs opacity-70">
            Monday to Friday either way. Never on a Sunday.
          </span>
        </span>
        {/* The button itself is the 44px tap target (globals.css enforces the
            minimum); the visible track sits inside it. */}
        <button
          type="button"
          role="switch"
          aria-checked={includeSaturday}
          aria-labelledby="saturday-label"
          onClick={() => onIncludeSaturdayChange(!includeSaturday)}
          className="relative flex w-12 shrink-0 items-center self-center"
        >
          <span
            className={[
              'block h-7 w-12 rounded-full transition',
              includeSaturday ? 'bg-hsa-600' : 'bg-black/25 dark:bg-white/30',
            ].join(' ')}
          />
          <span
            className={[
              'absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-all',
              includeSaturday ? 'left-[22px]' : 'left-0.5',
            ].join(' ')}
          />
        </button>
      </div>
    </fieldset>
  )
}
