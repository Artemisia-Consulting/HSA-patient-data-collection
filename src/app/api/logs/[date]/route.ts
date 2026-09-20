/**
 * GET|PUT /api/logs/:date — FR3–FR6.
 *
 * PUT upserts by (practitioner, date): one row per practitioner per day, always.
 * A practitioner who submits twice for the same date is correcting that day,
 * not creating a second one — which is why this is a PUT on the date rather
 * than a POST to a collection.
 *
 * 201 when the day is created, 200 when an existing day is replaced, so the
 * client can tell "logged" from "edited" without a second lookup.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { type NextResponse } from 'next/server'

import { dailyLogRequestSchema, dailyLogSchema, logDateSchema } from '@/lib/contract'
import { attachSession, requireAuth } from '@/lib/server/auth'
import {
  ApiException,
  readJsonBody,
  validationError,
  withRoute,
} from '@/lib/server/errors'
import { jsonResponse } from '@/lib/server/http'
import { assertWritableDate, getLog, upsertLog } from '@/lib/server/logs'
import { toDailyLogResponse } from '@/lib/server/serialise'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ date: string }> }

/** The path segment is user input like anything else. "2026-02-31" is a 400. */
async function readDate(context: RouteContext): Promise<string> {
  const { date } = await context.params
  const parsed = logDateSchema.safeParse(decodeURIComponent(date))
  if (!parsed.success) {
    throw new ApiException('VALIDATION_FAILED', 'That is not a valid date', {
      date: parsed.error.issues.map((issue) => issue.message),
    })
  }
  return parsed.data
}

export const GET = withRoute(
  async (request: Request, context: RouteContext): Promise<NextResponse> => {
    const auth = await requireAuth(request)
    const logDate = await readDate(context)

    const log = await getLog(auth.practitioner.id, logDate)
    if (!log) {
      throw new ApiException('NOT_FOUND', 'Nothing logged for that date yet')
    }

    const response = jsonResponse(dailyLogSchema, toDailyLogResponse(log))
    return attachSession(response, auth)
  },
)

export const PUT = withRoute(
  async (request: Request, context: RouteContext): Promise<NextResponse> => {
    const auth = await requireAuth(request)
    const logDate = await readDate(context)
    // Writes are confined to the collection window and to days that have
    // actually happened in SAST; reads above are not.
    assertWritableDate(logDate)

    const parsed = dailyLogRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationError(parsed.error)

    const { log, created } = await upsertLog(auth.practitioner.id, logDate, parsed.data)

    const response = jsonResponse(dailyLogSchema, toDailyLogResponse(log), {
      status: created ? 201 : 200,
    })
    return attachSession(response, auth)
  },
)
