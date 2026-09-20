/**
 * Response helpers for the /api/reminders/* routes.
 *
 * Every non-2xx body is the locked `apiErrorSchema` shape and every status
 * code comes from `API_ERROR_CODES`, so the codes cannot drift from the
 * contract (rubric item 12).
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import type { ZodError } from 'zod'

import { API_ERROR_CODES, type ApiErrorCode } from '../contract/api'

export function jsonError(
  code: ApiErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  return Response.json(
    { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status: API_ERROR_CODES[code] },
  )
}

/** Turn a Zod failure into the contract's fieldErrors map. */
export function validationError(error: ZodError): Response {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  const first = error.issues[0]?.message ?? 'Please check the highlighted fields'
  return jsonError('VALIDATION_FAILED', first, fieldErrors)
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export const UNAUTHENTICATED_MESSAGE =
  'Please open the app from your reminder link or sign in again.'
