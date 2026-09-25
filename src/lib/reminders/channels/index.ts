/**
 * Channel resolution.
 *
 * Email is the only delivery channel. The declared preference is still a
 * preference, not a promise: if SMTP is absent from the environment or the
 * practitioner has no address, the run records a FAILED with the reason
 * rather than throwing and taking the rest of the batch down with it.
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

export type ChannelRegistry = Record<DeliveryChannel, ChannelAdapter>

export function createChannelRegistry(config: ReminderConfig): ChannelRegistry {
  return {
    EMAIL: createEmailAdapter(config.smtp),
  }
}

export interface ResolvedChannel {
  adapter: ChannelAdapter
  recipient: string
}

export type ChannelResolution =
  | { ok: true; resolved: ResolvedChannel }
  | { ok: false; error: string }

/**
 * Pick the adapter to deliver on:
 *
 *   1. Email, if it is configured and the practitioner has an address.
 *   2. Nothing — a recorded FAILED with the reason, never a thrown run.
 */
export function resolveChannel(
  candidate: ReminderCandidate,
  registry: ChannelRegistry,
): ChannelResolution {
  if (candidate.channel === 'NONE') {
    return { ok: false, error: 'Practitioner is not opted in to reminders' }
  }

  const email = registry.EMAIL
  const recipient = email.recipientFor(candidate)

  if (email.isConfigured() && recipient) {
    return { ok: true, resolved: { adapter: email, recipient } }
  }

  const reason = email.isConfigured()
    ? 'email has no address on file for this practitioner'
    : 'email is not configured (SMTP_HOST is empty)'
  return { ok: false, error: `No usable delivery channel: ${reason}` }
}

export { createEmailAdapter }
