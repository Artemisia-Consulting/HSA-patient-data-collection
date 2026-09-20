/**
 * Environment plumbing for the reminder system. Everything reads from
 * `process.env` here and nowhere else, so a test can pass an explicit config
 * object instead of mutating global state.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */

export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  from: string
}

export interface WhatsAppConfig {
  phoneNumberId: string
  accessToken: string
  /** Empty means "send a plain session message instead of a template". */
  templateName: string
  /** Meta Graph API version. Pinned so a Meta release cannot change behaviour. */
  graphVersion: string
}

export interface ReminderConfig {
  appUrl: string
  smtp: SmtpConfig | null
  whatsapp: WhatsAppConfig | null
}

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

export function readSmtpConfig(): SmtpConfig | null {
  const host = env('SMTP_HOST')
  if (!host) return null
  return {
    host,
    port: Number(env('SMTP_PORT') || '587'),
    user: env('SMTP_USER'),
    password: env('SMTP_PASSWORD'),
    from: env('SMTP_FROM') || 'HSA Data Collection <noreply@example.org>',
  }
}

export function readWhatsAppConfig(): WhatsAppConfig | null {
  const phoneNumberId = env('WHATSAPP_PHONE_NUMBER_ID')
  const accessToken = env('WHATSAPP_ACCESS_TOKEN')
  // Both are required. A half-configured WhatsApp is treated as absent, which
  // is what makes the email fallback kick in rather than a 401 at send time.
  if (!phoneNumberId || !accessToken) return null
  return {
    phoneNumberId,
    accessToken,
    templateName: env('WHATSAPP_TEMPLATE_NAME'),
    graphVersion: env('WHATSAPP_GRAPH_VERSION') || 'v21.0',
  }
}

export function readAppUrl(): string {
  const raw = env('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

export function readReminderConfig(): ReminderConfig {
  return {
    appUrl: readAppUrl(),
    smtp: readSmtpConfig(),
    whatsapp: readWhatsAppConfig(),
  }
}

/**
 * The shared secret the cron trigger must present on POST /api/reminders/dispatch.
 * Returns null when unset, and the route then refuses every request rather
 * than defaulting to open — an unauthenticated dispatch endpoint would let
 * anyone mail every practitioner in the study.
 */
export function readCronSecret(): string | null {
  const secret = env('CRON_SECRET')
  return secret.length > 0 ? secret : null
}

/**
 * Constant-time-ish comparison so the endpoint does not leak the secret one
 * character at a time through response timing.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
