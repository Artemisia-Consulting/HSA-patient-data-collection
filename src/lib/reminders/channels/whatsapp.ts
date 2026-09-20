/**
 * WhatsApp delivery via the Meta WhatsApp Cloud API.
 *
 * Two shapes are supported:
 *
 *  - Template send (the normal case). Business-initiated messages outside a
 *    24-hour customer-service window *must* use an approved template, so this
 *    is what October will actually use. Body parameters are the practitioner's
 *    first name and the date; the personalised link is passed as the dynamic
 *    suffix of a URL button, which is how Cloud API templates carry per-user
 *    links.
 *  - Plain text send, used only when WHATSAPP_TEMPLATE_NAME is empty. Useful
 *    for a sandbox number inside the 24-hour window; it will be rejected by
 *    Meta for a cold send.
 *
 * NOT TESTED against the live API — see docs/streams/reminders.md. The request
 * shape follows Meta's documented schema but no message has been delivered.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { WhatsAppConfig } from '../config'
import { whatsappText } from '../message'
import type { ChannelAdapter, ReminderCandidate, ReminderMessage } from '../types'

/** Injectable so tests can assert on the request without hitting the network. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export function buildWhatsAppPayload(
  config: WhatsAppConfig,
  message: ReminderMessage,
): Record<string, unknown> {
  if (!config.templateName) {
    return {
      messaging_product: 'whatsapp',
      to: message.recipient,
      type: 'text',
      text: { preview_url: true, body: whatsappText(message) },
    }
  }

  // The link id is the button's dynamic suffix: the approved template holds
  // the base URL, Meta appends this. Sending the full URL here would produce
  // a doubled path.
  const linkSuffix = message.link.split('?')[1] ?? ''

  return {
    messaging_product: 'whatsapp',
    to: message.recipient,
    type: 'template',
    template: {
      name: config.templateName,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: message.greetingName },
            { type: 'text', text: message.logDate },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: linkSuffix }],
        },
      ],
    },
  }
}

export function createWhatsAppAdapter(
  config: WhatsAppConfig | null,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): ChannelAdapter {
  return {
    channel: 'WHATSAPP',
    isConfigured: () => config !== null,
    recipientFor: (candidate: ReminderCandidate) => candidate.whatsappNumber || null,
    async send(message: ReminderMessage) {
      if (!config) {
        throw new Error('WhatsApp is not configured (missing phone number id or token)')
      }

      const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildWhatsAppPayload(config, message)),
      })

      if (!response.ok) {
        // Meta returns the reason in the body; keep it, but cap the length so
        // a stack-trace-sized error cannot bloat the ReminderDispatch row.
        const detail = (await response.text()).slice(0, 500)
        throw new Error(`WhatsApp send failed (${response.status}): ${detail}`)
      }
    },
  }
}
