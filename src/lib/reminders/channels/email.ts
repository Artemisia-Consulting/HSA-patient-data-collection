/**
 * Email delivery via SMTP (nodemailer).
 *
 * The transport is created lazily and cached, so a dispatch run opens one
 * connection pool rather than one per practitioner.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import nodemailer, { type Transporter } from 'nodemailer'

import type { SmtpConfig } from '../config'
import { emailHtml, emailSubject, emailText } from '../message'
import type { ChannelAdapter, ReminderCandidate, ReminderMessage } from '../types'

export function createEmailAdapter(config: SmtpConfig | null): ChannelAdapter {
  let transporter: Transporter | null = null

  function transport(): Transporter {
    if (!config) {
      throw new Error('SMTP is not configured (SMTP_HOST is empty)')
    }
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        // 465 is implicit TLS; 587 upgrades with STARTTLS.
        secure: config.port === 465,
        auth: config.user ? { user: config.user, pass: config.password } : undefined,
        pool: true,
        maxConnections: 2,
      })
    }
    return transporter
  }

  return {
    channel: 'EMAIL',
    isConfigured: () => config !== null,
    recipientFor: (candidate: ReminderCandidate) => candidate.email || null,
    async send(message: ReminderMessage) {
      await transport().sendMail({
        from: config!.from,
        to: message.recipient,
        subject: emailSubject(message.logDate),
        text: emailText(message),
        html: emailHtml(message),
      })
    },
  }
}
