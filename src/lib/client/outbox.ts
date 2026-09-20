/**
 * Offline save for the daily entry (rubric item 4, tier 3).
 *
 * The scenario this exists for is concrete: a homeopath finishing at a rural
 * practice with one bar of signal taps Submit, the request times out, and the
 * day's entry is gone. Instead, a submit that fails *for network reasons* is
 * written to this queue, the practitioner is told it is saved on their phone,
 * and it is replayed when the connection returns.
 *
 * Deliberate design choices:
 *
 *  - Only `ApiNetworkError` queues. A 400 or a 409 is a real answer from the
 *    server and must be shown, not hidden behind "saved offline".
 *  - The queue is keyed by `logDate`, so re-submitting the same day replaces
 *    the pending entry rather than stacking duplicates. The API is an upsert,
 *    so a replay is idempotent by construction.
 *  - Flush is serial and stops at the first network failure, so a flaky
 *    connection does not burn every queued item on one bad moment.
 *
 * OWNER: Stream 2.
 */
import type { DailyLogRequest } from '../contract/api'
import { putLog } from './api'
import { ApiClientError, ApiNetworkError } from './http'
import { readJson, removeKey, writeJson } from './storage'

const KEY = 'hsa.outbox.dailyLogs.v1'

export interface QueuedLog {
  logDate: string
  body: DailyLogRequest
  queuedAt: string
  /** Set when a replay came back with a real error the practitioner must see. */
  lastError?: string
}

export function readOutbox(): QueuedLog[] {
  const raw = readJson<QueuedLog[]>(KEY, [])
  return Array.isArray(raw) ? raw.filter((item) => Boolean(item?.logDate)) : []
}

function writeOutbox(items: QueuedLog[]): void {
  if (items.length === 0) removeKey(KEY)
  else writeJson(KEY, items)
}

export function queueLog(logDate: string, body: DailyLogRequest): QueuedLog[] {
  const items = readOutbox().filter((item) => item.logDate !== logDate)
  items.push({ logDate, body, queuedAt: new Date().toISOString() })
  writeOutbox(items)
  return items
}

export function removeFromOutbox(logDate: string): void {
  writeOutbox(readOutbox().filter((item) => item.logDate !== logDate))
}

export function pendingFor(logDate: string): QueuedLog | undefined {
  return readOutbox().find((item) => item.logDate === logDate)
}

export interface FlushResult {
  sent: number
  /** Still queued — either the network is still down, or they need attention. */
  remaining: number
  /** Entries the server rejected with a real error; the UI must surface these. */
  rejected: QueuedLog[]
}

/**
 * Replay everything queued. Safe to call on load, on `online`, and after a
 * successful submit — it is a no-op with an empty queue.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const items = readOutbox()
  if (items.length === 0) return { sent: 0, remaining: 0, rejected: [] }

  const rejected: QueuedLog[] = []
  const stillQueued: QueuedLog[] = []
  let sent = 0

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    try {
      await putLog(item.logDate, item.body)
      sent += 1
    } catch (error) {
      if (error instanceof ApiNetworkError) {
        // Connection is gone again. Keep this one and everything after it.
        stillQueued.push(...items.slice(index))
        break
      }
      if (error instanceof ApiClientError) {
        rejected.push({ ...item, lastError: error.message })
        continue
      }
      stillQueued.push(...items.slice(index))
      break
    }
  }

  // A rejected entry stays queued with its error attached, so the day's work
  // is never silently dropped — the practitioner is shown it and can fix it.
  const next = [...stillQueued, ...rejected]
  writeOutbox(next)
  return { sent, remaining: next.length, rejected }
}
