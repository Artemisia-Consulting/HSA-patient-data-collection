/**
 * The shape the daily-entry form holds in React state, and the two pure
 * functions that convert between it and the contract.
 *
 * Kept out of the component on purpose: this is where a mistake would be
 * expensive and invisible (a condition silently dropped, free text sent for a
 * non-"Other" code, a count coerced to NaN), and here it can be unit-tested
 * against the contract's own Zod schema without a DOM.
 *
 * OWNER: Stream 2.
 */
import {
  type ConditionEntryInput,
  type DailyLog,
  type DailyLogRequest,
  dailyLogRequestSchema,
} from '../contract/api'
import type {
  ConditionCategory,
  DiagnosisBasis,
  GpCoManagement,
  ReferredByGp,
} from '../contract/enums'
import { isOtherCondition } from '../contract/taxonomy'
import type { EntryDefaults } from './preferences'

/** One selected condition, as the form holds it. */
export interface DraftCondition {
  /** Local-only React key. Never sent. */
  key: string
  category: ConditionCategory
  conditionCode: string
  /** Always a string in the form; omitted from the payload unless required. */
  conditionOther: string
  diagnosisBasis: DiagnosisBasis
  alsoSeeingGp: GpCoManagement
  referredByGp: ReferredByGp
}

export interface EntryForm {
  logDate: string
  newPatients: number
  followUpPatients: number
  conditions: DraftCondition[]
}

let keyCounter = 0
export function draftKey(): string {
  keyCounter += 1
  return `dc${keyCounter}_${Math.random().toString(36).slice(2, 8)}`
}

export function newDraftCondition(
  category: ConditionCategory,
  conditionCode: string,
  defaults: EntryDefaults,
): DraftCondition {
  return {
    key: draftKey(),
    category,
    conditionCode,
    conditionOther: '',
    diagnosisBasis: defaults.diagnosisBasis,
    alsoSeeingGp: defaults.alsoSeeingGp,
    referredByGp: defaults.referredByGp,
  }
}

export function emptyForm(logDate: string): EntryForm {
  return { logDate, newPatients: 0, followUpPatients: 0, conditions: [] }
}

/**
 * Form → request body. `conditionOther` is sent only for a category's "Other"
 * row; sending it for a coded condition would put free text into a dataset the
 * brief explicitly wants tick-and-select.
 */
export function toDailyLogRequest(form: EntryForm): DailyLogRequest {
  const conditions: ConditionEntryInput[] = form.conditions.map((condition) => {
    const base = {
      category: condition.category,
      conditionCode: condition.conditionCode,
      diagnosisBasis: condition.diagnosisBasis,
      alsoSeeingGp: condition.alsoSeeingGp,
      referredByGp: condition.referredByGp,
    }
    return isOtherCondition(condition.conditionCode)
      ? { ...base, conditionOther: condition.conditionOther.trim() }
      : base
  })

  return {
    newPatients: form.newPatients,
    followUpPatients: form.followUpPatients,
    conditions,
  }
}

/** An existing day reopened for editing. */
export function formFromDailyLog(log: DailyLog): EntryForm {
  return {
    logDate: log.logDate,
    newPatients: log.newPatients,
    followUpPatients: log.followUpPatients,
    conditions: log.conditions.map((entry) => ({
      key: draftKey(),
      category: entry.category,
      conditionCode: entry.conditionCode,
      conditionOther: entry.conditionOther ?? '',
      diagnosisBasis: entry.diagnosisBasis,
      alsoSeeingGp: entry.alsoSeeingGp,
      referredByGp: entry.referredByGp,
    })),
  }
}

export function formFromRequest(logDate: string, body: DailyLogRequest): EntryForm {
  return {
    logDate,
    newPatients: body.newPatients,
    followUpPatients: body.followUpPatients,
    conditions: body.conditions.map((entry) => ({
      key: draftKey(),
      category: entry.category,
      conditionCode: entry.conditionCode,
      conditionOther: entry.conditionOther ?? '',
      diagnosisBasis: entry.diagnosisBasis,
      alsoSeeingGp: entry.alsoSeeingGp,
      referredByGp: entry.referredByGp,
    })),
  }
}

export interface FormValidation {
  ok: boolean
  /** DraftCondition.key → message, so the right card can be marked. */
  conditionErrors: Record<string, string>
  formError: string | null
}

/**
 * Validated against the contract schema itself, so the client cannot disagree
 * with the server about what is acceptable. The only thing done locally is
 * mapping a Zod issue path back onto the draft key that produced it.
 */
export function validateForm(form: EntryForm): FormValidation {
  const conditionErrors: Record<string, string> = {}

  // Surfaced ahead of Zod because the message is friendlier and the mapping
  // back to a card is exact.
  form.conditions.forEach((condition) => {
    if (isOtherCondition(condition.conditionCode) && !condition.conditionOther.trim()) {
      conditionErrors[condition.key] = 'Please describe the condition'
    }
  })

  const parsed = dailyLogRequestSchema.safeParse(toDailyLogRequest(form))
  if (!parsed.success && Object.keys(conditionErrors).length === 0) {
    const issue = parsed.error.issues[0]
    const index = typeof issue?.path?.[1] === 'number' ? (issue.path[1] as number) : -1
    const key = index >= 0 ? form.conditions[index]?.key : undefined
    if (key) conditionErrors[key] = issue.message
    else {
      return {
        ok: false,
        conditionErrors,
        formError: issue?.message ?? 'Please check your entry',
      }
    }
  }

  return {
    ok: Object.keys(conditionErrors).length === 0,
    conditionErrors,
    formError: null,
  }
}

export function totalPatients(form: EntryForm): number {
  return form.newPatients + form.followUpPatients
}

function mostCommon<T extends string>(values: T[], fallback: T): T {
  if (values.length === 0) return fallback
  const counts = new Map<T, number>()
  let best = values[0]
  let bestCount = 0
  for (const value of values) {
    const next = (counts.get(value) ?? 0) + 1
    counts.set(value, next)
    // `>` not `>=` keeps the earliest-seen value on a tie, which makes the
    // result stable rather than dependent on Map iteration order.
    if (next > bestCount) {
      best = value
      bestCount = next
    }
  }
  return best
}

/**
 * What this practitioner's *next* entry should default to (rubric item 6,
 * tier 3). The modal value across the day's conditions, not the last one
 * touched: a homeopath who logs eight patients not seeing a GP and one who is
 * should not have tomorrow's default flipped by the odd one out.
 *
 * With no conditions logged, the previous defaults stand — an empty day is not
 * evidence about anything.
 */
export function deriveDefaults(
  form: EntryForm,
  current: EntryDefaults,
): EntryDefaults {
  if (form.conditions.length === 0) return current
  return {
    diagnosisBasis: mostCommon(
      form.conditions.map((c) => c.diagnosisBasis),
      current.diagnosisBasis,
    ),
    alsoSeeingGp: mostCommon(
      form.conditions.map((c) => c.alsoSeeingGp),
      current.alsoSeeingGp,
    ),
    referredByGp: mostCommon(
      form.conditions.map((c) => c.referredByGp),
      current.referredByGp,
    ),
  }
}
