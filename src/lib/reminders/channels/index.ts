/**
 * Channel resolution and graceful degradation.
 *
 * The rule: a practitioner's declared channel is a preference, not a promise.
 * If they asked for WhatsApp but the Cloud API credentials are absent from
 * the environment, or they have no number on file, the run falls back to
 * email rather than throwing and taking the rest of the batch down with it.
 *
 * This fallback is decided *before* any send is attempted, so it can never
 * produce two messages. Falling back after a failed send is deliberately not
 * done — a WhatsApp call that errors may still have delivered, and a second
 * message on another channel would be worse than a recorded failure.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { ReminderConfig } from '../config'
import type {
  ChannelAdapter,
  DeliveryChannel,
  ReminderCandidate,
} from '../types'
import { createEmailAdapter } from './email'
import { createWhatsAppAdapter } from './whatsapp'

export type ChannelRegistry = Record<DeliveryChannel, ChannelAdapter>

export function createChannelRegistry(config: ReminderConfig): ChannelRegistry {
  return {
    EMAIL: createEmailAdapter(config.smtp),
    WHATSAPP: createWhatsAppAdapter(config.whatsapp),
  }
}

export interface ResolvedChannel {
  adapter: ChannelAdapter
  recipient: string
  /** True when the practitioner's declared channel was not the one used. */
  fellBack: boolean
}

export type ChannelResolution =
  | { ok: true; resolved: ResolvedChannel }
  | { ok: false; error: string }

/**
 * Pick the adapter to deliver on. Preference order:
 *
 *   1. The declared channel, if it is configured and has a recipient.
 *   2. Email, if it is configured and the practitioner has an address.
 *   3. Nothing — a recorded FAILED with the reason, never a thrown run.
 */
export function resolveChannel(
  candidate: ReminderCandidate,
  registry: ChannelRegistry,
): ChannelResolution {
  const reasons: string[] = []

  const declared = candidate.channel
  if (declared === 'NONE') {
    return { ok: false, error: 'Practitioner is not opted in to reminders' }
  }

  const preferred = registry[declared]
  const preferredRecipient = preferred.recipientFor(candidate)

  if (preferred.isConfigured() && preferredRecipient) {
    return {
      ok: true,
      resolved: { adapter: preferred, recipient: preferredRecipient, fellBack: false },
    }
  }

  if (!preferred.isConfigured()) {
    reasons.push(`${declared} is not configured in this environment`)
  } else if (!preferredRecipient) {
    reasons.push(`${declared} has no recipient on file for this practitioner`)
  }

  if (declared !== 'EMAIL') {
    const email = registry.EMAIL
    const emailRecipient = email.recipientFor(candidate)
    if (email.isConfigured() && emailRecipient) {
      return {
        ok: true,
        resolved: { adapter: email, recipient: emailRecipient, fellBack: true },
      }
    }
    reasons.push(
      email.isConfigured()
        ? 'email fallback has no address on file'
        : 'email fallback is not configured (SMTP_HOST is empty)',
    )
  }

  return { ok: false, error: `No usable delivery channel: ${reasons.join('; ')}` }
}

export { createEmailAdapter, createWhatsAppAdapter }
