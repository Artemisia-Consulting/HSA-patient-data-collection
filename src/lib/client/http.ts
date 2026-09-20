/**
 * The typed request helper. Every call in `api.ts` goes through `request()`,
 * which:
 *
 *   1. attaches the bearer token and JSON headers,
 *   2. maps a non-2xx body onto `apiErrorSchema` and throws `ApiClientError`
 *      carrying the stable `code` from the contract, so screens can branch on
 *      EMAIL_ALREADY_REGISTERED rather than on a status number or a string,
 *   3. parses the success body with the contract's own Zod schema, so a shape
 *      drift between the mock and Agent 1's routes surfaces here rather than
 *      as `undefined` three components deep.
 *
 * OWNER: Stream 2.
 */
import type { z } from 'zod'

import { apiErrorSchema, type ApiErrorCode } from '../contract/api'
import { getSessionToken } from './session'
import { apiFetch } from './transport'

/** A structured, non-2xx response from the API. */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | string
  readonly fieldErrors: Record<string, string[]>

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }

  is(code: ApiErrorCode): boolean {
    return this.code === code
  }
}

/**
 * The request never reached the server, or the reply was not usable. Distinct
 * from ApiClientError on purpose: this is the case the offline queue catches,
 * and a 409 must never be mistaken for it.
 */
export class ApiNetworkError extends Error {
  readonly cause?: unknown

  constructor(message = 'No connection', cause?: unknown) {
    super(message)
    this.name = 'ApiNetworkError'
    this.cause = cause
  }
}

/** A response whose body did not match the contract schema. */
export class ApiShapeError extends Error {
  constructor(path: string, detail: string) {
    super(
      `Response from ${path} did not match the contract: ${detail}. ` +
        'This is an integration bug, not a user error.',
    )
    this.name = 'ApiShapeError'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  /** Reminder-link id, sent as `?k=` for a device with no session yet. */
  reminderLinkId?: string | null
  signal?: AbortSignal
}

function buildUrl(path: string, reminderLinkId?: string | null): string {
  if (!reminderLinkId) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}k=${encodeURIComponent(reminderLinkId)}`
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function request<TSchema extends z.ZodType>(
  schema: TSchema,
  path: string,
  options: RequestOptions = {},
): Promise<z.infer<TSchema>> {
  const { method = 'GET', body, reminderLinkId, signal } = options

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await apiFetch(buildUrl(path, reminderLinkId), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiNetworkError('Could not reach the server', cause)
  }

  const payload = await readJson(response)

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload)
    if (parsed.success) {
      throw new ApiClientError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.fieldErrors ?? {},
      )
    }
    // A proxy, a captive-portal login page or a crashed route — anything that
    // is not our own error envelope. Do not show the raw body to a user.
    throw new ApiClientError(
      response.status,
      'INTERNAL_ERROR',
      'Something went wrong on our side. Please try again.',
    )
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiShapeError(path, parsed.error.issues[0]?.message ?? 'unknown')
  }
  return parsed.data
}
