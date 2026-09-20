/**
 * Personalised links and message bodies (FR7, user story 2.1).
 *
 * POPIA: every string produced here is built from a practitioner's own name,
 * a calendar date and their link id. Nothing about a patient, a condition or
 * a count can reach a message body, because none of it is an input to these
 * functions — the types make that a compile-time property rather than a
 * convention someone has to remember.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { REMINDER_LINK_QUERY_PARAM } from '../contract/api'
import { formatLogDateLong } from '../dates'
import type { ReminderMessage } from './types'

/**
 * The one-tap personalised link. `?k=<reminderLinkId>` authenticates on a
 * brand-new device with no session, which is the whole point: a practitioner
 * who reinstalled or switched phones still gets straight to the form.
 */
export function buildLogLink(appUrl: string, reminderLinkId: string): string {
  const base = appUrl.replace(/\/+$/, '')
  return `${base}/log?${REMINDER_LINK_QUERY_PARAM}=${encodeURIComponent(reminderLinkId)}`
}

/** Where snooze and "done for today" live, same personalised authentication. */
export function buildManageLink(appUrl: string, reminderLinkId: string): string {
  const base = appUrl.replace(/\/+$/, '')
  return `${base}/reminders?${REMINDER_LINK_QUERY_PARAM}=${encodeURIComponent(reminderLinkId)}`
}

/** First name only, for a greeting. Falls back to a neutral form. */
export function greetingNameFor(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0]
  return first && first.length > 0 ? first : 'there'
}

export function emailSubject(logDate: string): string {
  return `Your HSA daily log — ${formatLogDateLong(logDate)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function emailText(message: ReminderMessage): string {
  return [
    `Hi ${message.greetingName},`,
    '',
    `Quick reminder to log your patient numbers for ${formatLogDateLong(message.logDate)}. It takes under a minute.`,
    '',
    message.link,
    '',
    'Saw no patients today? Open the link below and tap "Done for today" — that keeps the record straight without logging a zero.',
    message.manageLink,
    '',
    'Homoeopathic Association of South Africa — October 2026 data collection.',
    'To change the time, switch to WhatsApp or turn reminders off, use the same link.',
  ].join('\n')
}

export function emailHtml(message: ReminderMessage): string {
  const name = escapeHtml(message.greetingName)
  const date = escapeHtml(formatLogDateLong(message.logDate))
  const link = escapeHtml(message.link)
  const manage = escapeHtml(message.manageLink)

  return `<!doctype html>
<html lang="en-ZA">
  <body style="margin:0;padding:24px;background:#f5f7f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1d2b22;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
      <p style="margin:0 0 16px;font-size:16px;">Hi ${name},</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">
        Quick reminder to log your patient numbers for <strong>${date}</strong>. It takes under a minute.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${link}"
           style="display:inline-block;min-height:44px;line-height:44px;padding:0 24px;background:#2f6b4f;color:#ffffff;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;">
          Log today
        </a>
      </p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#4a5a51;">
        Saw no patients today? <a href="${manage}" style="color:#2f6b4f;">Tap "Done for today"</a> — that keeps the record
        straight without logging a zero.
      </p>
      <hr style="border:none;border-top:1px solid #e3e9e5;margin:24px 0;" />
      <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7a72;">
        Homoeopathic Association of South Africa — October 2026 data collection.<br />
        Change the time, switch to WhatsApp or turn reminders off from the
        <a href="${manage}" style="color:#2f6b4f;">same link</a>.
      </p>
    </div>
  </body>
</html>`
}

/** The plain-text WhatsApp body, used outside a template send. */
export function whatsappText(message: ReminderMessage): string {
  return [
    `Hi ${message.greetingName}, a quick nudge to log your patient numbers for ${formatLogDateLong(message.logDate)}.`,
    '',
    message.link,
    '',
    'Saw no patients? Tap "Done for today": ' + message.manageLink,
  ].join('\n')
}

/**
 * Hide most of a recipient before it reaches a log line. Practitioner.email is
 * the only personal datum in the system and must not end up in run output.
 */
export function maskRecipient(recipient: string): string {
  if (recipient.includes('@')) {
    const [local, domain] = recipient.split('@')
    const head = local.slice(0, 1)
    return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`
  }
  const tail = recipient.slice(-3)
  return `${'*'.repeat(Math.max(recipient.length - 3, 1))}${tail}`
}
