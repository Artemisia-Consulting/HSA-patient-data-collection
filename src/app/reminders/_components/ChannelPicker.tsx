'use client'

/**
 * Channel opt-in (FR7): no reminders / email / WhatsApp.
 *
 * A radiogroup rather than a <select>, because on a phone three large tap
 * targets beat a picker wheel and the brief mandates >44px targets. The
 * WhatsApp number field only appears once WhatsApp is chosen, so an
 * email-only practitioner is never asked for a phone number.
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
  WHATSAPP: 'A WhatsApp message with a one-tap link to your log.',
}

export function ChannelPicker({
  value,
  whatsappNumber,
  whatsappError,
  onChange,
  onWhatsappNumberChange,
  disabled,
}: {
  value: ReminderChannel
  whatsappNumber: string
  whatsappError?: string
  onChange: (channel: ReminderChannel) => void
  onWhatsappNumberChange: (value: string) => void
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

      {value === 'WHATSAPP' ? (
        <div className="space-y-1">
          <label htmlFor="whatsappNumber" className="block text-sm font-medium">
            WhatsApp number
          </label>
          <input
            id="whatsappNumber"
            name="whatsappNumber"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+27821234567"
            value={whatsappNumber}
            onChange={(event) => onWhatsappNumberChange(event.target.value)}
            aria-invalid={Boolean(whatsappError)}
            aria-describedby={whatsappError ? 'whatsappNumber-error' : 'whatsappNumber-hint'}
            className="min-h-[44px] w-full rounded-lg border border-black/20 px-3 py-2 text-base dark:border-white/25"
          />
          {whatsappError ? (
            <p id="whatsappNumber-error" role="alert" className="text-xs text-red-600">
              {whatsappError}
            </p>
          ) : (
            <p id="whatsappNumber-hint" className="text-xs opacity-70">
              International format, starting with +27 for South Africa.
            </p>
          )}
        </div>
      ) : null}
    </fieldset>
  )
}
