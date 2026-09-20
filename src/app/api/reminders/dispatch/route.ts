/**
 * POST /api/reminders/dispatch → 200 dispatchResultSchema | 401 | 500
 *
 * The cron entry point. Whatever drives the schedule — the bundled node-cron
 * runner in scripts/reminders/, a platform cron, or an external ping service —
 * calls this one URL, so there is exactly one code path into delivery and one
 * place the audit trail is written.
 *
 * AUTH: the CRON_SECRET from the environment, as
 * `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`. If the
 * variable is unset the route refuses every request rather than defaulting to
 * open — an unauthenticated dispatch endpoint would let anyone on the
 * internet mail every practitioner in the study, repeatedly.
 *
 * Idempotent by construction: calling it twice in the same minute cannot
 * double-send, because each send is claimed against
 * `@@unique([practitionerId, logDate, channel])` before the message goes out.
 * That is also what makes it safe to expose to a cron service with at-least-
 * once semantics.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { dispatchResultSchema } from '@/lib/contract/api'
import { readCronSecret, secretsMatch } from '@/lib/reminders/config'
import { runDispatch, toDispatchResult } from '@/lib/reminders/dispatch'
import { jsonError } from '@/lib/reminders/http'

export const dynamic = 'force-dynamic'
// Nodemailer and node:crypto need the Node runtime, not the Edge one.
export const runtime = 'nodejs'

function presentedSecret(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (match) return match[1].trim()
  }
  const direct = request.headers.get('x-cron-secret')
  return direct ? direct.trim() : null
}

export async function POST(request: Request): Promise<Response> {
  const expected = readCronSecret()
  if (!expected) {
    console.error('[reminders] CRON_SECRET is not set; refusing to dispatch')
    return jsonError(
      'UNAUTHENTICATED',
      'Reminder dispatch is not configured on this deployment.',
    )
  }

  const provided = presentedSecret(request)
  if (!provided || !secretsMatch(provided, expected)) {
    return jsonError('UNAUTHENTICATED', 'Invalid or missing dispatch credentials.')
  }

  try {
    const summary = await runDispatch()

    // Deferred practitioners (before their chosen time, or mid-snooze) have no
    // field in the locked dispatchResultSchema, so they are logged rather than
    // returned. See the contract-gap note in docs/streams/reminders.md.
    console.info(
      `[reminders] run ${summary.forDate}: considered=${summary.considered} ` +
        `sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed} ` +
        `deferred=${summary.deferred}` +
        (summary.outsideCollectionWindow ? ' (outside collection window)' : ''),
    )

    // Parsing our own response guarantees the body matches the contract even
    // if the engine's summary shape drifts later.
    return Response.json(dispatchResultSchema.parse(toDispatchResult(summary)))
  } catch (error) {
    console.error('[reminders] dispatch run failed', error)
    return jsonError('INTERNAL_ERROR', 'The reminder run could not be completed.')
  }
}
