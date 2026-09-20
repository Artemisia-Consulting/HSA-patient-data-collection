/**
 * Smart per-condition defaults (rubric items 4 and 6, tier 3).
 *
 * The contract fixes the product owner's defaults — CLINICAL_DIAGNOSIS,
 * UNSURE, NOT_APPLICABLE. Those are right for a practitioner's first entry and
 * wrong for their twentieth: a homeopath whose patients are almost never
 * GP-referred should not re-tap "No" every evening.
 *
 * So the fixed contract default seeds the field, and thereafter the last value
 * the practitioner actually *chose* becomes the default. The flags still cost
 * zero taps; they just cost zero taps more often.
 *
 * Only enum values are stored — nothing about a patient, nothing free-text.
 *
 * OWNER: Stream 2.
 */
import {
  DEFAULT_DIAGNOSIS_BASIS,
  DEFAULT_GP_CO_MANAGEMENT,
  DEFAULT_REFERRED_BY_GP,
  DIAGNOSIS_BASES,
  GP_CO_MANAGEMENT,
  REFERRED_BY_GP,
  type DiagnosisBasis,
  type GpCoManagement,
  type ReferredByGp,
} from '../contract/enums'
import { readJson, writeJson } from './storage'

const KEY = 'hsa.prefs.entryDefaults.v1'

export interface EntryDefaults {
  diagnosisBasis: DiagnosisBasis
  alsoSeeingGp: GpCoManagement
  referredByGp: ReferredByGp
}

/** What the contract says a first-ever entry should look like. */
export const CONTRACT_DEFAULTS: EntryDefaults = {
  diagnosisBasis: DEFAULT_DIAGNOSIS_BASIS,
  alsoSeeingGp: DEFAULT_GP_CO_MANAGEMENT,
  referredByGp: DEFAULT_REFERRED_BY_GP,
}

/** Never trust what came out of storage — an old build may have written it. */
export function sanitiseDefaults(value: Partial<EntryDefaults> | null): EntryDefaults {
  const basis = value?.diagnosisBasis
  const gp = value?.alsoSeeingGp
  const referred = value?.referredByGp
  return {
    diagnosisBasis: DIAGNOSIS_BASES.includes(basis as DiagnosisBasis)
      ? (basis as DiagnosisBasis)
      : CONTRACT_DEFAULTS.diagnosisBasis,
    alsoSeeingGp: GP_CO_MANAGEMENT.includes(gp as GpCoManagement)
      ? (gp as GpCoManagement)
      : CONTRACT_DEFAULTS.alsoSeeingGp,
    referredByGp: REFERRED_BY_GP.includes(referred as ReferredByGp)
      ? (referred as ReferredByGp)
      : CONTRACT_DEFAULTS.referredByGp,
  }
}

export function loadEntryDefaults(): EntryDefaults {
  return sanitiseDefaults(readJson<Partial<EntryDefaults> | null>(KEY, null))
}

export function saveEntryDefaults(defaults: EntryDefaults): void {
  writeJson(KEY, sanitiseDefaults(defaults))
}
