/**
 * Browser-side calls to /api/reminders/*.
 *
 * Every request carries `?k=<reminderLinkId>` when the page was opened from a
 * reminder, so the preferences screen works on a device that has never had a
 * session — the same guarantee the log link gives (FR1, user story 2.1).
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import {
  REMINDER_LINK_QUERY_PARAM,
  type ApiError,
  type ReminderPreferences,
  type ReminderStatusResponse,
} from '@/lib/contract/api'

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }

function withKey(path: string, linkKey: string | null): string {
  if (!linkKey) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${REMINDER_LINK_QUERY_PARAM}=${encodeURIComponent(linkKey)}`
}

async function call<T>(
  path: string,
  linkKey: string | null,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(withKey(path, linkKey), {
      ...init,
      // Poor connections are a stated constraint: never serve a stale
      // "snoozed until" from the HTTP cache.
      cache: 'no-store',
      credentials: 'same-origin',
      headers: init?.body
        ? { 'content-type': 'application/json', ...(init?.headers ?? {}) }
        : init?.headers,
    })
  } catch {
    return {
      ok: false,
      message: "Could not reach the server. Check your connection and try again.",
    }
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const error = (body as ApiError | null)?.error
    return {
      ok: false,
      message: error?.message ?? 'Something went wrong. Please try again.',
      fieldErrors: error?.fieldErrors,
    }
  }

  return { ok: true, data: body as T }
}

export function getReminderStatus(linkKey: string | null) {
  return call<ReminderStatusResponse>('/api/reminders/preferences', linkKey)
}

export function saveReminderPreferences(
  linkKey: string | null,
  preferences: ReminderPreferences,
) {
  return call<ReminderStatusResponse>('/api/reminders/preferences', linkKey, {
    method: 'PUT',
    body: JSON.stringify(preferences),
  })
}

export function snoozeReminder(linkKey: string | null, minutes: number) {
  return call<ReminderStatusResponse>('/api/reminders/snooze', linkKey, {
    method: 'POST',
    body: JSON.stringify({ minutes }),
  })
}

export function markDoneToday(linkKey: string | null) {
  return call<ReminderStatusResponse>('/api/reminders/done-today', linkKey, {
    method: 'POST',
  })
}
