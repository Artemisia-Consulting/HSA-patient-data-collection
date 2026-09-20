/**
 * Response helpers.
 *
 * Every successful response goes out through `jsonResponse`, which parses the
 * payload with the contract schema before sending it. That is not belt-and-
 * braces: `z.object` strips unknown keys, so a field that is not in the
 * contract — `email` on a dashboard row, say — cannot reach the wire even if a
 * query accidentally selects it. A payload that fails the schema is a server
 * bug and surfaces as a 500 rather than as a silently wrong shape.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'

export const NO_STORE = { 'Cache-Control': 'no-store' } as const

export function jsonResponse<T>(
  schema: ZodType<T>,
  payload: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    // Throwing here is deliberate: withRoute turns it into a 500 and logs the
    // issues, which is what a contract violation deserves.
    console.error('[api] response failed contract validation', parsed.error.issues)
    throw new Error('Response payload did not match the API contract')
  }
  return NextResponse.json(parsed.data, {
    status: init.status ?? 200,
    headers: { ...NO_STORE, ...init.headers },
  })
}

/** ISO-8601 with milliseconds, which is what `z.iso.datetime()` expects. */
export function isoString(value: Date): string {
  return value.toISOString()
}

export function isoStringOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/**
 * The caller's IP, best-effort, for rate limiting only. Never stored.
 * `NextRequest.ip` was removed in Next 15, so the proxy headers are all we get.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Base URL used to build personalised reminder links. */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const base = configured && configured.length > 0 ? configured : 'http://localhost:3000'
  return base.replace(/\/+$/, '')
}
