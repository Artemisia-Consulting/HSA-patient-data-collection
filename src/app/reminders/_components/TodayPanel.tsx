'use client'

/**
 * Today's state and the two escape hatches (FR7, rubric item 8 tier 3).
 *
 *   Snooze          — "not now"; the reminder still comes, later today.
 *   Done for today  — "nothing to report"; the reminder stops for the day.
 *
 * The copy on "Done for today" is doing real work. It must not read as
 * "log zero patients": a suppressed day and a zero-patient day are different
 * claims about the dataset, and only the log form makes the second.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { ReminderStatusResponse } from '@/lib/contract/api'
import { formatLogDate, formatSastDateTime, formatSastTime } from './format'

const SNOOZE_OPTIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
] as const

function statusLine(status: ReminderStatusResponse): string {
  if (status.hasLoggedToday) {
    return 'Logged for today — no reminder will be sent.'
  }
  if (status.markedDoneToday) {
    return 'Marked done for today. No reminder, and no zero-patient day recorded.'
  }
  if (status.snoozedUntil) {
    return `Snoozed until ${formatSastTime(status.snoozedUntil)}.`
  }
  if (status.preferences.channel === 'NONE') {
    return 'Reminders are off. Nothing will be sent.'
  }
  if (status.nextReminderAt) {
    return `Next reminder: ${formatSastDateTime(status.nextReminderAt)}.`
  }
  return 'No further reminders are scheduled.'
}

export function TodayPanel({
  status,
  busy,
  onSnooze,
  onDone,
}: {
  status: ReminderStatusResponse
  busy: boolean
  onSnooze: (minutes: number) => void
  onDone: () => void
}) {
  const settled = status.hasLoggedToday || status.markedDoneToday

  return (
    <section
      aria-labelledby="today-heading"
      className="rounded-xl border border-black/15 p-4 dark:border-white/20"
    >
      <h2 id="today-heading" className="text-sm font-semibold">
        {formatLogDate(status.today)}
      </h2>
      <p className="mt-1 text-sm opacity-80" aria-live="polite">
        {statusLine(status)}
      </p>

      {settled ? null : (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-60">
              Remind me again in
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SNOOZE_OPTIONS.map((option) => (
                <button
                  key={option.minutes}
                  type="button"
                  disabled={busy}
                  onClick={() => onSnooze(option.minutes)}
                  className="rounded-full border border-black/15 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/20"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs opacity-60">
              A snooze past midnight ends the day — you will not be reminded again
              until tomorrow.
            </p>
          </div>

          <div>
            <button
              type="button"
              disabled={busy}
              onClick={onDone}
              className="w-full rounded-lg border border-hsa-600 px-4 py-3 text-base font-medium text-hsa-700 disabled:opacity-50"
            >
              Done for today
            </button>
            <p className="mt-2 text-xs opacity-60">
              Use this if you saw no patients. It stops today&rsquo;s reminder without
              recording a zero-patient day.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
