/**
 * Account recovery for a practitioner who signs up again because they lost
 * access (rubric item 1, tier 3).
 *
 * The rule this file exists to enforce: knowing someone's email address must
 * not log you in as them. Email is the only identifier in this system, and it
 * is guessable — a colleague's address would otherwise be enough to read and
 * write their logs. So a duplicate signup never returns a session. Instead the
 * practitioner's existing personalised link is sent *to the address that is
 * already registered*, which only its owner can read, and the API answers 409
 * with a message that tells them to go and look.
 *
 * Delivery is best-effort and never fails the request: if SMTP is not
 * configured the caller is told to contact the research team instead, which is
 * true rather than reassuring.
 *
 * INTEGRATION NOTE: Stream 3 owns reminder delivery (`src/lib/reminders/**`).
 * This is a deliberately separate, minimal transport for one transactional
 * email. At integration it should be re-pointed at Stream 3's email channel
 * adapter so there is one mailer, not two.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { buildReminderLink } from './serialise'

const SEND_TIMEOUT_MS = 5_000

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST.trim().length > 0)
}

export interface RecoveryDeliveryResult {
  delivered: boolean
  reason?: 'NOT_CONFIGURED' | 'SEND_FAILED' | 'TIMED_OUT'
}

async function sendMail(to: string, subject: string, text: string): Promise<void> {
  // Imported lazily so the module is only loaded when mail is actually configured.
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  })
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? 'HSA Data Collection <noreply@example.org>',
    to,
    subject,
    text,
  })
}

/**
 * Email an existing practitioner their personalised access link.
 * Returns whether it actually went out; callers phrase their message on that.
 */
export async function sendAccessLink(
  email: string,
  fullName: string,
  reminderLinkId: string,
): Promise<RecoveryDeliveryResult> {
  const link = buildReminderLink(reminderLinkId)

  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      // Dev convenience only. Never logged in production: the link is a
      // credential and application logs are not a safe place for one.
      console.info(`[recovery] SMTP not configured. Access link for ${email}: ${link}`)
    }
    return { delivered: false, reason: 'NOT_CONFIGURED' }
  }

  const body = [
    `Hi ${fullName},`,
    '',
    'You (or someone) tried to sign up again with this email address for the',
    'HSA October 2026 patient data collection. Your account already exists —',
    'here is your personal link. Open it on any device to log straight in:',
    '',
    link,
    '',
    'Keep this link private: it signs you in without a password.',
    '',
    'If this was not you, you can ignore this email. Nothing has changed.',
    '',
    'Homoeopathic Association of South Africa',
  ].join('\n')

  try {
    await Promise.race([
      sendMail(email, 'Your HSA data collection link', body),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), SEND_TIMEOUT_MS),
      ),
    ])
    return { delivered: true }
  } catch (error) {
    // Deliberately does not include the address or the link in the log line.
    console.error('[recovery] failed to send access link', error)
    return { delivered: false, reason: 'SEND_FAILED' }
  }
}
