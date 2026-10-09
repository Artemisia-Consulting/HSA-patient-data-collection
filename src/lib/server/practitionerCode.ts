/**
 * The practitioner passcode — what turns a stranger with an email address
 * into a registered practitioner.
 *
 * Signup used to take anyone who ticked the consent box, so anybody who found
 * the URL could add days to the October dataset. Now a *new* practitioner also
 * needs the passcode the HSA gives to the practitioners taking part
 * (PRACTITIONER_CODE). It is asked for once, at signup: after that the
 * practitioner row exists, and every way back in — the session cookie, the
 * `?k=` reminder link, Google — identifies them without it. Everyone who
 * signed up before this existed already has a row, so they are registered by
 * definition and are never asked.
 *
 * Deliberately no new column: "is a registered practitioner" and "has a
 * Practitioner row" are the same fact, so there is no flag for a migration to
 * get wrong and no half-registered state for the dashboard or the reminder
 * dispatcher to have to filter out.
 *
 * The same three rules as RESEARCHER_CODE (see api/auth/researcher):
 *
 *  - In production a missing PRACTITIONER_CODE closes new signups rather than
 *    opening them — a gate that silently fails open is not a gate. Existing
 *    practitioners are unaffected either way.
 *  - The comparison is constant-time.
 *  - Attempts are rate limited (RATE_LIMITS.practitionerCode).
 *
 * One difference: case is ignored. This passcode is typed on phones whose
 * keyboards capitalise the first letter, by people who were read it over the
 * phone or sent it in a WhatsApp; the rate limit, not the case of the letters,
 * is what stops guessing.
 *
 * OWNERSHIP: Integration lead.
 */
import { safeCompare } from './auth'

/** Dev-only convenience value. Never reachable when NODE_ENV is production. */
export const DEV_FALLBACK_PRACTITIONER_CODE = 'hsa-dev-practitioner'

/** The expected passcode, or null when this deployment has not configured one. */
export function expectedPractitionerCode(): string | null {
  const configured = process.env.PRACTITIONER_CODE?.trim()
  if (configured) return configured
  return process.env.NODE_ENV === 'production' ? null : DEV_FALLBACK_PRACTITIONER_CODE
}

export function practitionerCodeMatches(given: string, expected: string): boolean {
  return safeCompare(given.trim().toLowerCase(), expected.trim().toLowerCase())
}
