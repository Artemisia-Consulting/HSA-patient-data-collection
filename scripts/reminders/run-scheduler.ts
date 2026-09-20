/**
 * The long-running reminder scheduler.
 *
 *   npx tsx scripts/reminders/run-scheduler.ts
 *   npx tsx scripts/reminders/run-scheduler.ts --in-process
 *   npx tsx scripts/reminders/run-scheduler.ts --cron="*\/5 * * * *"
 *
 * Why a per-minute tick rather than a cron entry per practitioner: reminder
 * times are per-person and editable at any moment, and snoozes create new
 * due times mid-day. A minute tick that asks "who is due now?" has no
 * schedule to keep in sync with the database, and a missed tick costs one
 * minute of lateness rather than a whole day's reminders.
 *
 * By default each tick POSTs /api/reminders/dispatch with the CRON_SECRET, so
 * this runner exercises exactly the path a platform cron or an external ping
 * service would. `--in-process` runs the engine directly instead, for a
 * single-process deployment with no public dispatch URL.
 *
 * Safe to run more than one instance: every send is claimed against
 * `@@unique([practitionerId, logDate, channel])` before it goes out, so a
 * second scheduler loses the race rather than sending a second message.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import cron from 'node-cron'

import { SAST_TIME_ZONE } from '../../src/lib/dates'
import { readAppUrl, readCronSecret } from '../../src/lib/reminders/config'
import { runDispatch } from '../../src/lib/reminders/dispatch'

try {
  process.loadEnvFile()
} catch {
  // Real env vars are already present in CI / production.
}

function flag(name: string): string | undefined {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : undefined
}

const EVERY_MINUTE = '* * * * *'
const expression = flag('cron') ?? EVERY_MINUTE
const inProcess = process.argv.includes('--in-process')

async function tickViaHttp(secret: string): Promise<void> {
  const url = `${readAppUrl()}/api/reminders/dispatch`
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
  const body = await response.text()
  if (!response.ok) {
    console.error(`[reminders] dispatch ${response.status}: ${body}`)
    return
  }
  const result = JSON.parse(body) as {
    forDate: string
    considered: number
    sent: number
    skipped: number
    failed: number
  }
  if (result.sent > 0 || result.failed > 0) {
    console.info(
      `[reminders] ${result.forDate} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    )
  }
}

async function tickInProcess(): Promise<void> {
  const summary = await runDispatch()
  if (summary.sent > 0 || summary.failed > 0) {
    console.info(
      `[reminders] ${summary.forDate} sent=${summary.sent} skipped=${summary.skipped} ` +
        `failed=${summary.failed} deferred=${summary.deferred}`,
    )
  }
}

function main(): void {
  const secret = readCronSecret()
  if (!inProcess && !secret) {
    console.error(
      'CRON_SECRET is not set. Set it, or run with --in-process to bypass the HTTP endpoint.',
    )
    process.exitCode = 1
    return
  }

  console.info(
    `[reminders] scheduler up: "${expression}" in ${SAST_TIME_ZONE}, ` +
      `mode=${inProcess ? 'in-process' : 'http'}`,
  )

  const task = cron.schedule(
    expression,
    async () => {
      try {
        if (inProcess) await tickInProcess()
        else await tickViaHttp(secret!)
      } catch (error) {
        // A tick that throws must not take the scheduler down — the next
        // minute should try again.
        console.error('[reminders] tick failed', error)
      }
    },
    {
      // The expression is evaluated in SAST. It makes no difference for a
      // per-minute tick, but it means `--cron="0 18 * * *"` does what a
      // South African reader expects.
      timezone: SAST_TIME_ZONE,
      // Never let a slow run overlap the next tick and double-process.
      noOverlap: true,
      name: 'hsa-reminders',
    },
  )

  const stop = () => {
    console.info('[reminders] scheduler stopping')
    void task.stop()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main()
