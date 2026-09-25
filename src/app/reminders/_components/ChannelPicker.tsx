'use client'

/**
 * Channel opt-in (FR7): no reminders / email.
 *
 * A radiogroup rather than a <select>, because on a phone two large tap
 * targets beat a picker wheel and the brief mandates >44px targets.
 *
 * `value` may be null — the first-run choice screen starts with nothing
 * selected so the practitioner has to make a deliberate pick before the
 * save button unlocks. The preferences screen always passes a real value.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import {
  REMINDER_CHANNELS,
  REMINDER_CHANNEL_LABELS,
  type ReminderChannel,
} from '@/lib/contract/enums'

const CHANNEL_HINTS: Record<ReminderChannel, string> = {
  NONE: 'You will not be nudged. You can still log any day you like.',
  EMAIL: 'A short email with a one-tap link to your log.',
}

export function ChannelPicker({
  value,
  onChange,
  disabled,
}: {
  value: ReminderChannel | null
  onChange: (channel: ReminderChannel) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold">How should we remind you?</legend>

      <div role="radiogroup" aria-label="Reminder channel" className="grid gap-2">
        {REMINDER_CHANNELS.map((channel) => {
          const selected = channel === value
          return (
            <button
              key={channel}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(channel)}
              className={[
                'flex w-full flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition',
                selected
                  ? 'border-hsa-600 bg-hsa-50 ring-2 ring-hsa-600/40'
                  : 'border-black/15 hover:border-black/30 dark:border-white/20',
              ].join(' ')}
            >
              <span className="text-base font-medium">
                {REMINDER_CHANNEL_LABELS[channel]}
              </span>
              <span className="text-xs opacity-70">{CHANNEL_HINTS[channel]}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
