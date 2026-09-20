'use client'

/**
 * Session bootstrap for every practitioner screen (FR1, user story 2.1,
 * rubric item 2 tier 3).
 *
 * The three ways someone arrives, in the order they are tried:
 *
 *  1. A stored bearer token — the ordinary returning user. One GET, straight
 *     to the log form, nothing re-entered. This is the sub-10-second path.
 *  2. `?k=<reminderLinkId>` in the URL — they tapped tonight's reminder on a
 *     new phone, or after clearing their browser. The link id is exchanged for
 *     a real session via POST /api/auth/resume, so the *next* visit is path 1
 *     even though this one had no cookie.
 *  3. Neither — anonymous, send them to signup.
 *
 * After a successful resume the `k` is stripped from the address bar with
 * replaceState. It is a bearer credential in a URL: leaving it in history, in
 * a screenshot or in a shared link is the one way this scheme leaks.
 *
 * OWNER: Stream 2.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { MeResponse, Practitioner } from '@/lib/contract/api'
import { api, ApiClientError, ApiNetworkError } from '@/lib/client'
import { getReminderLinkId, getSessionToken, setReminderLinkId } from '@/lib/client'
import { REMINDER_LINK_QUERY_PARAM } from '@/lib/contract/api'

export type SessionStatus = 'loading' | 'ready' | 'anonymous' | 'offline'

export interface SessionState {
  status: SessionStatus
  practitioner: Practitioner | null
  /** Today in SAST as the *server* reckons it — never the device clock. */
  today: string | null
  hasLoggedToday: boolean
  refresh: () => Promise<void>
  /** Adopt a session the signup screen just created, without a round trip. */
  adopt: (me: MeResponse) => void
}

function readLinkIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  return params.get(REMINDER_LINK_QUERY_PARAM)
}

function stripLinkIdFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(REMINDER_LINK_QUERY_PARAM)) return
  url.searchParams.delete(REMINDER_LINK_QUERY_PARAM)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

export function useSession(): SessionState {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [practitioner, setPractitioner] = useState<Practitioner | null>(null)
  const [today, setToday] = useState<string | null>(null)
  const [hasLoggedToday, setHasLoggedToday] = useState(false)
  const bootstrapped = useRef(false)

  const apply = useCallback((result: MeResponse) => {
    setPractitioner(result.practitioner)
    setToday(result.today)
    setHasLoggedToday(result.hasLoggedToday)
    setStatus('ready')
  }, [])

  const load = useCallback(async () => {
    const urlLinkId = readLinkIdFromUrl()
    if (urlLinkId) setReminderLinkId(urlLinkId)
    const linkId = urlLinkId ?? getReminderLinkId()

    try {
      if (!getSessionToken() && linkId) {
        // New device following a reminder link: trade the link id for a
        // session so this only ever happens once per device.
        await api.resume(linkId)
        stripLinkIdFromUrl()
      } else if (urlLinkId) {
        stripLinkIdFromUrl()
      }
      apply(await api.me(linkId))
    } catch (error) {
      if (error instanceof ApiNetworkError) {
        setStatus('offline')
        return
      }
      if (error instanceof ApiClientError && error.status === 401) {
        setStatus('anonymous')
        return
      }
      setStatus('anonymous')
    }
  }, [apply])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    void load()
  }, [load])

  return {
    status,
    practitioner,
    today,
    hasLoggedToday,
    refresh: load,
    adopt: apply,
  }
}
