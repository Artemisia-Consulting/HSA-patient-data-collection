/**
 * One dispatch pass, from the command line.
 *
 * This is how the scheduler is exercised without waiting for 18:00: the clock
 * is an argument, so any minute of any day in October can be simulated in a
 * second.
 *
 *   npx tsx scripts/reminders/dispatch-once.ts --dry-run --at=2026-10-05T18:00
 *   npx tsx scripts/reminders/dispatch-once.ts --dry-run --at=2026-10-04T18:00   # Sunday
 *   npx tsx scripts/reminders/dispatch-once.ts --at=2026-10-05T18:01
 *   npx tsx scripts/reminders/dispatch-once.ts --via-http                        # real endpoint
 *
 * Flags
 *   --at=<when>    Instant to run at. "yyyy-MM-ddTHH:mm" is read as SAST wall
 *                  time; anything else is handed to `new Date()`. Default now.
 *   --date=<d>     Force the SAST logDate, independently of --at. Rarely needed.
 *   --dry-run      Decide everything, write nothing, send nothing. Safe anywhere.
 *   --force        Ignore the October-2026 collection window.
 *   --via-http     POST /api/reminders/dispatch with CRON_SECRET instead of
 *                  running in-process. Needs the app running; this is the
 *                  exact path production cron takes.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { readAppUrl, readCronSecret } from '../../src/lib/reminders/config'
import { runDispatch, type DispatchEvent } from '../../src/lib/reminders/dispatch'
import { sastDateTimeToInstant } from '../../src/lib/dates'
import { fixedClock } from '../../src/lib/reminders/types'

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

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

/** "2026-10-05T18:00" means 18:00 SAST, not 18:00 UTC. */
function parseAt(value: string | undefined): Date {
  if (!value) return new Date()
  const wall = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(value.trim())
  if (wall) return sastDateTimeToInstant(wall[1], wall[2])
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--at is not a date I can read: ${value}`)
  }
  return parsed
}

function describe(event: DispatchEvent): string {
  switch (event.type) {
    case 'SENT':
      return `SENT      ${event.practitionerId} via ${event.channel} to ${event.recipient}${
        event.fellBack ? '  (fell back from the declared channel)' : ''
      }`
    case 'SKIPPED':
      return `SKIPPED   ${event.practitionerId} ${event.reason}${
        event.recorded ? '' : ' (already recorded)'
      }`
    case 'DEFERRED':
      return `DEFERRED  ${event.practitionerId} ${event.reason} until ${event.until}`
    case 'FAILED':
      return `FAILED    ${event.practitionerId} via ${event.channel}: ${event.error}`
    case 'CLAIMED_ELSEWHERE':
      return `CLAIMED   ${event.practitionerId} ${event.channel} — another run owns this send`
  }
}

async function viaHttp(): Promise<void> {
  const secret = readCronSecret()
  if (!secret) throw new Error('CRON_SECRET is not set')

  const url = `${readAppUrl()}/api/reminders/dispatch`
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
  console.log(`POST ${url} → ${response.status}`)
  console.log(await response.text())
  if (!response.ok) process.exitCode = 1
}

async function main(): Promise<void> {
  if (has('via-http')) {
    await viaHttp()
    return
  }

  const now = parseAt(flag('at'))
  const summary = await runDispatch({
    clock: fixedClock(now),
    logDate: flag('date'),
    dryRun: has('dry-run'),
    ignoreWindow: has('force') || undefined,
  })

  console.log(
    `Run at ${summary.runAt.toISOString()} for SAST date ${summary.forDate}` +
      (summary.dryRun ? '  [DRY RUN — nothing written, nothing sent]' : ''),
  )
  if (summary.outsideCollectionWindow) {
    console.log(
      'Outside the October 2026 collection window — no reminders sent. Use --force to override.',
    )
    return
  }

  for (const event of summary.events) console.log('  ' + describe(event))

  console.log(
    `considered=${summary.considered} sent=${summary.sent} skipped=${summary.skipped} ` +
      `failed=${summary.failed} deferred=${summary.deferred}`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    // The Prisma client holds a SQLite handle open; without this the script
    // hangs after printing its summary.
    void import('../../src/lib/db').then(({ prisma }) => prisma.$disconnect())
  })
