/**
 * Autosave for the in-progress daily entry.
 *
 * Distinct from the outbox: the outbox holds entries the practitioner *did*
 * submit and we could not send, this holds an entry they have not submitted
 * yet. A backgrounded PWA on Android is killed aggressively; without this, a
 * phone call halfway through an entry costs the whole thing.
 *
 * Drafts are per log date and are cleared the moment a submit succeeds or is
 * queued. Nothing here is patient data — counts and taxonomy codes only.
 *
 * OWNER: Stream 2.
 */
import type { DailyLogRequest } from '../contract/api'
import { dailyLogRequestSchema } from '../contract/api'
import { readJson, removeKey, writeJson } from './storage'

const PREFIX = 'hsa.draft.dailyLog.v1.'

const keyFor = (logDate: string) => `${PREFIX}${logDate}`

export interface StoredDraft {
  savedAt: string
  body: DailyLogRequest
}

export function saveDraft(logDate: string, body: DailyLogRequest): void {
  writeJson(keyFor(logDate), { savedAt: new Date().toISOString(), body })
}

export function loadDraft(logDate: string): StoredDraft | null {
  const stored = readJson<StoredDraft | null>(keyFor(logDate), null)
  if (!stored) return null
  const parsed = dailyLogRequestSchema.safeParse(stored.body)
  // A draft written before a taxonomy change may no longer be valid; drop it
  // rather than rehydrating a form into an unsubmittable state.
  if (!parsed.success) {
    clearDraft(logDate)
    return null
  }
  return { savedAt: stored.savedAt, body: parsed.data }
}

export function clearDraft(logDate: string): void {
  removeKey(keyFor(logDate))
}
