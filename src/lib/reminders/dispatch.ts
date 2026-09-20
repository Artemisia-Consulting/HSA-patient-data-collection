/**
 * The dispatch engine: one pass over every practitioner at a given instant.
 *
 * Structure, and why:
 *
 *  - The clock is injected. Nothing in here calls `new Date()`, so the whole
 *    18:00-Friday-Saturday-Sunday matrix is exercised in milliseconds.
 *  - Persistence is behind `DispatchStore`, so the tests use an in-memory fake
 *    with the same unique-key behaviour as SQLite.
 *  - The double-send guard is claim-then-send: a PENDING row is inserted
 *    *before* the message goes out, and a P2002 from
 *    `@@unique([practitionerId, logDate, channel])` means someone else already
 *    owns this send. There is no read-then-write window for two cron ticks,
 *    two instances or a manual trigger to slip through.
 *  - One practitioner's failure never aborts the batch.
 *
 * POPIA: this engine handles identity, a boolean and a link. It does not read
 * DailyLog contents, ConditionEntry rows or anything clinical, and it cannot —
 * `DayState.hasLogged` is the only fact it is given about a log.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { SkipReason } from '../contract/enums'
import { todayInSast } from '../dates'
import { readReminderConfig } from './config'
import { createChannelRegistry, resolveChannel, type ChannelRegistry } from './channels'
import { buildLogLink, buildManageLink, greetingNameFor, maskRecipient } from './message'
import { decideDispatch, isDispatchableDate } from './schedule'
import {
  systemClock,
  type Clock,
  type DeferReason,
  type DispatchStore,
  type ReminderCandidate,
} from './types'

/* ------------------------------------------------------------------ *
 * Run reporting
 * ------------------------------------------------------------------ */

export type DispatchEvent =
  | { type: 'SENT'; practitionerId: string; channel: string; recipient: string; fellBack: boolean }
  | { type: 'SKIPPED'; practitionerId: string; channel: string; reason: SkipReason; recorded: boolean }
  | { type: 'DEFERRED'; practitionerId: string; reason: DeferReason; until: string }
  | { type: 'FAILED'; practitionerId: string; channel: string; error: string }
  | { type: 'CLAIMED_ELSEWHERE'; practitionerId: string; channel: string }

export interface DispatchRunSummary {
  runAt: Date
  forDate: string
  considered: number
  sent: number
  skipped: number
  failed: number
  /**
   * Practitioners whose reminder is still to come today (before their chosen
   * time, or inside a snooze that lapses before midnight). Nothing is written
   * for them. The locked contract's `dispatchResultSchema` has no field for
   * this, so it is surfaced in run logs only — see the handoff note.
   */
  deferred: number
  /** True when the run did nothing because the date is outside October 2026. */
  outsideCollectionWindow: boolean
  dryRun: boolean
  events: DispatchEvent[]
}

export interface DispatchRunOptions {
  store?: DispatchStore
  registry?: ChannelRegistry
  clock?: Clock
  appUrl?: string
  /** Override the SAST date. Defaults to today in SAST at the injected instant. */
  logDate?: string
  /** Lift the October-2026 guard, for demos and load tests. */
  ignoreWindow?: boolean
  /** Decide everything, write nothing, send nothing. */
  dryRun?: boolean
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

export async function runDispatch(
  options: DispatchRunOptions = {},
): Promise<DispatchRunSummary> {
  const clock = options.clock ?? systemClock
  const now = clock()
  const forDate = options.logDate ?? todayInSast(now)
  const dryRun = options.dryRun ?? false

  const config = readReminderConfig()
  // Loaded on demand so that supplying a store keeps Prisma — and therefore
  // the generated client and a live database — out of the import graph. That
  // is what lets tests/reminders exercise this engine with no setup at all.
  const store = options.store ?? (await import('./store')).createPrismaDispatchStore()
  const registry = options.registry ?? createChannelRegistry(config)
  const appUrl = options.appUrl ?? config.appUrl

  const summary: DispatchRunSummary = {
    runAt: now,
    forDate,
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    outsideCollectionWindow: false,
    dryRun,
    events: [],
  }

  if (!isDispatchableDate(forDate, options.ignoreWindow)) {
    // Outside the collection window the run is a deliberate no-op: no sends,
    // no rows. Practitioners must not be nudged in September or November.
    summary.outsideCollectionWindow = true
    return summary
  }

  const candidates = await store.listCandidates()
  summary.considered = candidates.length
  if (candidates.length === 0) return summary

  const dayState = await store.loadDayState(
    candidates.map((candidate) => candidate.practitionerId),
    forDate,
  )

  for (const candidate of candidates) {
    try {
      await processCandidate({
        candidate,
        day: dayState.get(candidate.practitionerId) ?? {
          hasLogged: false,
          markedDoneAt: null,
          snoozedUntil: null,
        },
        forDate,
        now,
        store,
        registry,
        appUrl,
        dryRun,
        summary,
      })
    } catch (error) {
      // A single unexpected failure (a dead DB connection mid-batch, a
      // malformed row) must not cost the other practitioners their reminder.
      summary.failed += 1
      summary.events.push({
        type: 'FAILED',
        practitionerId: candidate.practitionerId,
        channel: candidate.channel,
        error: describeError(error),
      })
    }
  }

  return summary
}

async function processCandidate(args: {
  candidate: ReminderCandidate
  day: { hasLogged: boolean; markedDoneAt: Date | null; snoozedUntil: Date | null }
  forDate: string
  now: Date
  store: DispatchStore
  registry: ChannelRegistry
  appUrl: string
  dryRun: boolean
  summary: DispatchRunSummary
}): Promise<void> {
  const { candidate, day, forDate, now, store, registry, appUrl, dryRun, summary } = args

  const decision = decideDispatch({ candidate, day, logDate: forDate, now })

  if (decision.kind === 'DEFER') {
    summary.deferred += 1
    summary.events.push({
      type: 'DEFERRED',
      practitionerId: candidate.practitionerId,
      reason: decision.reason,
      until: decision.until.toISOString(),
    })
    return
  }

  if (decision.kind === 'SKIP') {
    // The decision is final for this SAST day, so it is safe — and required —
    // to leave a row explaining the silence.
    const recorded = dryRun
      ? false
      : await store.recordSkip({
          practitionerId: candidate.practitionerId,
          logDate: forDate,
          channel: decision.channel,
          scheduledFor: decision.dueAt,
          reason: decision.reason,
        })
    summary.skipped += 1
    summary.events.push({
      type: 'SKIPPED',
      practitionerId: candidate.practitionerId,
      channel: decision.channel,
      reason: decision.reason,
      recorded,
    })
    return
  }

  const resolution = resolveChannel(candidate, registry)
  if (!resolution.ok) {
    // No channel can carry this message. Record FAILED with the reason rather
    // than swallowing it — a silent October is indistinguishable from a
    // working one otherwise.
    summary.failed += 1
    if (!dryRun) {
      const claim = await store.claim({
        practitionerId: candidate.practitionerId,
        logDate: forDate,
        channel: candidate.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
        scheduledFor: decision.dueAt,
      })
      if (claim) await store.markFailed(claim.id, resolution.error)
    }
    summary.events.push({
      type: 'FAILED',
      practitionerId: candidate.practitionerId,
      channel: candidate.channel,
      error: resolution.error,
    })
    return
  }

  const { adapter, recipient, fellBack } = resolution.resolved

  if (dryRun) {
    summary.sent += 1
    summary.events.push({
      type: 'SENT',
      practitionerId: candidate.practitionerId,
      channel: adapter.channel,
      recipient: maskRecipient(recipient),
      fellBack,
    })
    return
  }

  // Claim first. If the insert is rejected by the unique constraint, another
  // run already has this one and we must not send.
  const claim = await store.claim({
    practitionerId: candidate.practitionerId,
    logDate: forDate,
    channel: adapter.channel,
    scheduledFor: decision.dueAt,
  })

  if (!claim) {
    summary.events.push({
      type: 'CLAIMED_ELSEWHERE',
      practitionerId: candidate.practitionerId,
      channel: adapter.channel,
    })
    return
  }

  try {
    await adapter.send({
      practitionerId: candidate.practitionerId,
      recipient,
      greetingName: greetingNameFor(candidate.fullName),
      logDate: forDate,
      link: buildLogLink(appUrl, candidate.reminderLinkId),
      manageLink: buildManageLink(appUrl, candidate.reminderLinkId),
    })
    await store.markSent(claim.id, now)
    summary.sent += 1
    summary.events.push({
      type: 'SENT',
      practitionerId: candidate.practitionerId,
      channel: adapter.channel,
      recipient: maskRecipient(recipient),
      fellBack,
    })
  } catch (error) {
    const message = describeError(error)
    await store.markFailed(claim.id, message)
    summary.failed += 1
    summary.events.push({
      type: 'FAILED',
      practitionerId: candidate.practitionerId,
      channel: adapter.channel,
      error: message,
    })
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Project a run onto the locked `dispatchResultSchema` shape. */
export function toDispatchResult(summary: DispatchRunSummary) {
  return {
    runAt: summary.runAt.toISOString(),
    forDate: summary.forDate,
    considered: summary.considered,
    sent: summary.sent,
    skipped: summary.skipped,
    failed: summary.failed,
  }
}
