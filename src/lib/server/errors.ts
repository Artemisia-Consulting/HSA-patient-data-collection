/**
 * The error envelope every non-2xx response in this app uses.
 *
 * There is exactly one place that turns a failure into JSON, so a route can
 * never invent an ad-hoc shape or leak a stack trace to a practitioner's
 * phone. `code` comes from `API_ERROR_CODES` in the contract, which also fixes
 * the HTTP status each code must be returned with (rubric item 12).
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { NextResponse } from 'next/server'
import type { ZodError } from 'zod'

import { API_ERROR_CODES, type ApiErrorCode } from '@/lib/contract'

export type FieldErrors = Record<string, string[]>

/** Key used for issues that belong to the request as a whole, not one field. */
export const FORM_ERROR_KEY = '_form'

/**
 * Thrown by helpers (auth, validation) and converted to a response by
 * `withRoute`. Carrying the code rather than the status keeps the two in sync:
 * the status is always looked up from the contract.
 */
export class ApiException extends Error {
  readonly code: ApiErrorCode
  readonly fieldErrors?: FieldErrors

  constructor(code: ApiErrorCode, message: string, fieldErrors?: FieldErrors) {
    super(message)
    this.name = 'ApiException'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  fieldErrors?: FieldErrors,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
    {
      status: API_ERROR_CODES[code],
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

/**
 * Flatten a Zod issue list into `{ field: [messages] }`. Nested paths are
 * dotted (`conditions.0.conditionOther`) so the frontend can address the exact
 * input that failed; issues with no path land under `_form`.
 */
export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : FORM_ERROR_KEY
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return fieldErrors
}

export function validationError(error: ZodError, message?: string): NextResponse {
  return errorResponse(
    'VALIDATION_FAILED',
    message ?? 'Some of the details you entered need fixing',
    fieldErrorsFromZod(error),
  )
}

/** A validation failure raised by hand (e.g. an unknown condition code). */
export function validationException(
  field: string,
  message: string,
  summary = 'Some of the details you entered need fixing',
): ApiException {
  return new ApiException('VALIDATION_FAILED', summary, { [field]: [message] })
}

/**
 * Wraps a route handler so that nothing escapes as an unformatted 500.
 * An `ApiException` becomes its contract status; anything else is logged
 * server-side and returned as a generic INTERNAL_ERROR — the message a caller
 * sees never contains the underlying error text, which could name a table or a
 * file path.
 */
export function withRoute<Ctx = unknown>(
  handler: (request: Request, context: Ctx) => Promise<NextResponse>,
): (request: Request, context: Ctx) => Promise<NextResponse> {
  return async (request: Request, context: Ctx) => {
    try {
      return await handler(request, context)
    } catch (error) {
      if (error instanceof ApiException) {
        return errorResponse(error.code, error.message, error.fieldErrors)
      }
      console.error('[api] unhandled error', {
        url: request.url,
        method: request.method,
        error,
      })
      return errorResponse(
        'INTERNAL_ERROR',
        'Something went wrong on our side. Please try again.',
      )
    }
  }
}

/** Parse a JSON body, turning malformed JSON into a 400 rather than a 500. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiException('VALIDATION_FAILED', 'Expected a JSON request body', {
      [FORM_ERROR_KEY]: ['Request body was empty or not valid JSON'],
    })
  }
}
