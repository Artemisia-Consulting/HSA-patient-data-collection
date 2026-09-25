/**
 * The Prisma-backed `DispatchStore`. This is the only file in the reminder
 * engine that touches the database; `schedule.ts` and `dispatch.ts` stay pure
 * and are tested against an in-memory fake of the same interface.
 *
 * OWNERSHIP: Stream 3 (reminders).
 */
import { prisma } from '../db'
import { practitionersWhoLoggedOn } from './daily-log-gateway'
import type {
  ClaimInput,
  DayState,
  DispatchClaim,
  DispatchStore,
  ReminderCandidate,
  SkipInput,
} from './types'

/**
 * Prisma reports a unique-constraint violation as P2002. That is not an error
 * here — it is the double-send guard doing its job, and it means another run
 * (or another instance of the cron, or a manual trigger) already owns this
 * practitioner/date/channel.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

/**
 * Candidates for a run. Everyone is loaded, including practitioners with
 * reminderChannel = NONE: they are recorded as SKIPPED/NOT_OPTED_IN so the
 * October audit trail can answer "why did this person get nothing?" for every
 * participant rather than only for the opted-in ones.
 */
export function createPrismaDispatchStore(): DispatchStore {
  return {
    async listCandidates(): Promise<ReminderCandidate[]> {
      const rows = await prisma.practitioner.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          reminderChannel: true,
          reminderTime: true,
          reminderIncludeSat: true,
          reminderLinkId: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      return rows.map((row) => ({
        practitionerId: row.id,
        email: row.email,
        fullName: row.fullName,
        channel: toReminderChannel(row.reminderChannel),
        time: row.reminderTime,
        includeSaturday: row.reminderIncludeSat,
        reminderLinkId: row.reminderLinkId,
      }))
    },

    async loadDayState(practitionerIds, logDate) {
      const [logged, overrides] = await Promise.all([
        practitionersWhoLoggedOn(practitionerIds, logDate),
        prisma.dayOverride.findMany({
          where: { logDate, practitionerId: { in: practitionerIds } },
          select: { practitionerId: true, markedDoneAt: true, snoozedUntil: true },
        }),
      ])

      const byPractitioner = new Map<string, DayState>()
      for (const id of practitionerIds) {
        byPractitioner.set(id, {
          hasLogged: logged.has(id),
          markedDoneAt: null,
          snoozedUntil: null,
        })
      }
      for (const override of overrides) {
        const existing = byPractitioner.get(override.practitionerId)
        if (!existing) continue
        existing.markedDoneAt = override.markedDoneAt
        existing.snoozedUntil = override.snoozedUntil
      }
      return byPractitioner
    },

    async claim(input: ClaimInput): Promise<DispatchClaim | null> {
      try {
        const row = await prisma.reminderDispatch.create({
          data: {
            practitionerId: input.practitionerId,
            logDate: input.logDate,
            channel: input.channel,
            status: 'PENDING',
            scheduledFor: input.scheduledFor,
          },
          select: { id: true },
        })
        return { id: row.id, channel: input.channel }
      } catch (error) {
        if (isUniqueViolation(error)) return null
        throw error
      }
    },

    async markSent(dispatchId, sentAt) {
      await prisma.reminderDispatch.update({
        where: { id: dispatchId },
        data: { status: 'SENT', sentAt },
      })
    },

    async markFailed(dispatchId, error) {
      await prisma.reminderDispatch.update({
        where: { id: dispatchId },
        // Cap the message: an upstream stack trace should not become a
        // multi-kilobyte column in the audit table.
        data: { status: 'FAILED', error: error.slice(0, 1000) },
      })
    },

    async recordSkip(input: SkipInput): Promise<boolean> {
      try {
        await prisma.reminderDispatch.create({
          data: {
            practitionerId: input.practitionerId,
            logDate: input.logDate,
            channel: input.channel,
            status: 'SKIPPED',
            skipReason: input.reason,
            scheduledFor: input.scheduledFor,
          },
        })
        return true
      } catch (error) {
        if (isUniqueViolation(error)) return false
        throw error
      }
    },
  }
}

function toReminderChannel(value: string): ReminderCandidate['channel'] {
  return value === 'EMAIL' ? 'EMAIL' : 'NONE'
}
