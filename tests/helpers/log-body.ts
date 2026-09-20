/**
 * Builders for daily-log request bodies.
 *
 * The contract requires exactly one patient entry per counted patient, so a
 * hand-written body is easy to get subtly wrong in a way that fails validation
 * for a reason the test was not about. These builders keep the counts and the
 * patient list in agreement by construction.
 *
 * Shared by the backend and frontend suites so both send the same shapes.
 */
import type {
  ConditionEntryInput,
  DailyLogRequest,
  PatientEntryInput,
  PatientType,
} from '@/lib/contract'

export function patientWith(
  patientType: PatientType,
  conditions: ConditionEntryInput[] = [],
): PatientEntryInput {
  return { patientType, conditions }
}

/** A body from an explicit patient list, with the counts derived from it. */
export function logBody(patients: PatientEntryInput[]): DailyLogRequest {
  return {
    newPatients: patients.filter((p) => p.patientType === 'NEW').length,
    followUpPatients: patients.filter((p) => p.patientType === 'FOLLOW_UP').length,
    patients,
  }
}

/**
 * A day described the way the old day-level tests described it: two counts and
 * a flat list of conditions.
 *
 * Every condition lands on the first patient and the rest are blank. That is a
 * realistic shape rather than a convenience — a blank card is exactly how "seen
 * but not itemised" is recorded — and it keeps these tests about what they
 * were about, which is the conditions, not the distribution.
 */
export function dayWith({
  newPatients = 0,
  followUpPatients = 0,
  conditions = [],
}: {
  newPatients?: number
  followUpPatients?: number
  conditions?: ConditionEntryInput[]
}): DailyLogRequest {
  const patients: PatientEntryInput[] = []
  for (let i = 0; i < newPatients; i += 1) {
    patients.push(patientWith('NEW', i === 0 ? conditions : []))
  }
  for (let i = 0; i < followUpPatients; i += 1) {
    patients.push(patientWith('FOLLOW_UP', newPatients === 0 && i === 0 ? conditions : []))
  }
  return { newPatients, followUpPatients, patients }
}

/** Every condition on a day's response or request, flattened. */
export function conditionsOf<T>(body: { patients: Array<{ conditions: T[] }> }): T[] {
  return body.patients.flatMap((patient) => patient.conditions)
}
