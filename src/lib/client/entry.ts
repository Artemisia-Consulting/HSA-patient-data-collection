/**
 * The shape the daily-entry form holds in React state, and the pure functions
 * that convert between it and the contract.
 *
 * Kept out of the component on purpose: this is where a mistake would be
 * expensive and invisible (a condition silently dropped, free text sent for a
 * non-"Other" code, a count coerced to NaN), and here it can be unit-tested
 * against the contract's own Zod schema without a DOM.
 *
 * The form holds a list of patients, and the day's counts are *derived* from
 * that list rather than stored beside it. Raising the "New patients" picker to
 * 4 is what creates the fourth card, and lowering it is what removes one, so
 * the count and the number of patients cannot drift apart — which is exactly
 * the disagreement the server would reject.
 *
 * OWNER: Stream 2.
 */
import {
  type ConditionEntryInput,
  type DailyLog,
  type DailyLogRequest,
  type PatientEntryInput,
  dailyLogRequestSchema,
} from '../contract/api'
import type {
  ConditionCategory,
  DiagnosisBasis,
  GpCoManagement,
  PatientType,
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

/** One patient seen that day, and what was treated for them. */
export interface DraftPatient {
  /** Local-only React key. Never sent. */
  key: string
  patientType: PatientType
  conditions: DraftCondition[]
}

export interface EntryForm {
  logDate: string
  patients: DraftPatient[]
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

export function newDraftPatient(patientType: PatientType): DraftPatient {
  return { key: draftKey(), patientType, conditions: [] }
}

export function emptyForm(logDate: string): EntryForm {
  return { logDate, patients: [] }
}

/* ------------------------------------------------------------------ *
 * Counts
 * ------------------------------------------------------------------ */

export function countOf(form: EntryForm, patientType: PatientType): number {
  return form.patients.filter((patient) => patient.patientType === patientType).length
}

export function patientsOfType(
  form: EntryForm,
  patientType: PatientType,
): DraftPatient[] {
  return form.patients.filter((patient) => patient.patientType === patientType)
}

export function totalPatients(form: EntryForm): number {
  return form.patients.length
}

/** Every condition on the day, across all patients. */
export function allConditions(form: EntryForm): DraftCondition[] {
  return form.patients.flatMap((patient) => patient.conditions)
}

/* ------------------------------------------------------------------ *
 * Which patient card is expanded
 *
 * Exactly one card is open at a time, so the practitioner is always looking
 * at the patient they are working on rather than scrolling a wall of every
 * patient's conditions at once.
 *
 * The state is "what was last asked for" rather than "which card is open",
 * because three situations have to be told apart and only one of them is a
 * card key:
 *
 *  - nothing asked for yet (`null`) opens the first card, so setting a count
 *    does not land the practitioner on an all-collapsed list;
 *  - a deliberate collapse of the open card (`COLLAPSED`) has to survive, and
 *    so cannot be represented as "nothing asked for";
 *  - a key for a card that has since gone — the count was lowered, or another
 *    date was loaded and the draft keys were regenerated — collapses to
 *    nothing rather than silently opening some other patient.
 * ------------------------------------------------------------------ */

/** "The practitioner closed the open card." Never a real draft key. */
export const COLLAPSED = ''

/** The key of the card that should be expanded, or null if none is. */
export function resolveOpenPatient(form: EntryForm, request: string | null): string | null {
  if (request === null) return form.patients[0]?.key ?? null
  if (request === COLLAPSED) return null
  return form.patients.some((patient) => patient.key === request) ? request : null
}

/** What tapping a card's header asks for: open it, or close it if it is open. */
export function nextOpenRequest(openKey: string | null, tappedKey: string): string {
  return openKey === tappedKey ? COLLAPSED : tappedKey
}

/** The first patient holding a condition the validator rejected, if any. */
export function firstFailingPatient(
  form: EntryForm,
  conditionErrors: Record<string, string>,
): DraftPatient | null {
  return (
    form.patients.find((patient) =>
      patient.conditions.some((condition) => Boolean(conditionErrors[condition.key])),
    ) ?? null
  )
}

/**
 * Set how many patients of one type the day has, adding blank cards or
 * removing cards from the end.
 *
 * Trimming from the end is what makes lowering the count feel undoable: the
 * cards that disappear are the ones most recently added, so a mis-tap on the
 * picker costs at most the last card rather than the work done on the first.
 * The other type's patients are untouched, and relative order is preserved.
 */
export function setPatientCount(
  form: EntryForm,
  patientType: PatientType,
  count: number,
): EntryForm {
  const target = Math.max(0, Math.trunc(count))
  const current = countOf(form, patientType)
  if (target === current) return form

  if (target < current) {
    let remaining = current - target
    // Walk backwards so the dropped cards are the last ones of that type.
    const doomed = new Set<string>()
    for (let i = form.patients.length - 1; i >= 0 && remaining > 0; i -= 1) {
      if (form.patients[i].patientType === patientType) {
        doomed.add(form.patients[i].key)
        remaining -= 1
      }
    }
    return {
      ...form,
      patients: form.patients.filter((patient) => !doomed.has(patient.key)),
    }
  }

  const added = Array.from({ length: target - current }, () =>
    newDraftPatient(patientType),
  )
  return { ...form, patients: [...form.patients, ...added] }
}

/** Replace one patient in place, by key. */
export function updatePatient(
  form: EntryForm,
  key: string,
  update: (patient: DraftPatient) => DraftPatient,
): EntryForm {
  return {
    ...form,
    patients: form.patients.map((patient) =>
      patient.key === key ? update(patient) : patient,
    ),
  }
}

/* ------------------------------------------------------------------ *
 * Contract conversion
 * ------------------------------------------------------------------ */

function toConditionInput(condition: DraftCondition): ConditionEntryInput {
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
}

/**
 * Form → request body. `conditionOther` is sent only for a category's "Other"
 * row; sending it for a coded condition would put free text into a dataset the
 * brief explicitly wants tick-and-select.
 */
export function toDailyLogRequest(form: EntryForm): DailyLogRequest {
  const patients: PatientEntryInput[] = form.patients.map((patient) => ({
    patientType: patient.patientType,
    conditions: patient.conditions.map(toConditionInput),
  }))

  return {
    newPatients: countOf(form, 'NEW'),
    followUpPatients: countOf(form, 'FOLLOW_UP'),
    patients,
  }
}

/**
 * Accepts either side of the contract: a request entry omits `conditionOther`,
 * a response entry carries it as null.
 */
type ConditionLike = Omit<ConditionEntryInput, 'conditionOther'> & {
  conditionOther?: string | null
}

function toDraftCondition(entry: ConditionLike): DraftCondition {
  return {
    key: draftKey(),
    category: entry.category,
    conditionCode: entry.conditionCode,
    conditionOther: entry.conditionOther ?? '',
    diagnosisBasis: entry.diagnosisBasis,
    alsoSeeingGp: entry.alsoSeeingGp,
    referredByGp: entry.referredByGp,
  }
}

/** An existing day reopened for editing. */
export function formFromDailyLog(log: DailyLog): EntryForm {
  return {
    logDate: log.logDate,
    patients: log.patients.map((patient) => ({
      key: draftKey(),
      patientType: patient.patientType,
      conditions: patient.conditions.map(toDraftCondition),
    })),
  }
}

export function formFromRequest(logDate: string, body: DailyLogRequest): EntryForm {
  return {
    logDate,
    patients: body.patients.map((patient) => ({
      key: draftKey(),
      patientType: patient.patientType,
      conditions: patient.conditions.map(toDraftCondition),
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

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
  for (const condition of allConditions(form)) {
    if (isOtherCondition(condition.conditionCode) && !condition.conditionOther.trim()) {
      conditionErrors[condition.key] = 'Please describe the condition'
    }
  }

  const parsed = dailyLogRequestSchema.safeParse(toDailyLogRequest(form))
  if (!parsed.success && Object.keys(conditionErrors).length === 0) {
    const issue = parsed.error.issues[0]
    // `patients.<i>.conditions.<j>.<field>` — the two indices are what point at
    // a specific card.
    const patientIndex = typeof issue?.path?.[1] === 'number' ? issue.path[1] : -1
    const conditionIndex = typeof issue?.path?.[3] === 'number' ? issue.path[3] : -1
    const key =
      patientIndex >= 0 && conditionIndex >= 0
        ? form.patients[patientIndex]?.conditions[conditionIndex]?.key
        : undefined
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

/** A day with nothing in it at all. */
export function isEmptyEntry(form: EntryForm): boolean {
  return form.patients.length === 0
}

/**
 * May a day that has just finished loading replace what is on screen?
 *
 * The form is interactive before the network reply lands — deliberately, so
 * the first tap never waits. That opens a window in which a late "nothing is
 * logged for today" reply can overwrite a tap that already happened: the
 * practitioner taps "4 new patients", sees it highlight, the reply lands, the
 * 4 silently reverts to 0, and they submit a zero. It is the worst failure
 * this form has, because it is invisible and it corrupts the dataset.
 *
 * So: an empty reply never wins against work already done. A reply that
 * carries an actual day does, because that is a real record for this date and
 * showing the wrong one would be worse.
 */
export function shouldReplaceForm(
  loaded: EntryForm,
  practitionerHasEdited: boolean,
): boolean {
  if (!practitionerHasEdited) return true
  return !isEmptyEntry(loaded)
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
 * touched: a homeopath who logs eight patients not seeing a conventional
 * practitioner and one who is should not have tomorrow's default flipped by
 * the odd one out.
 *
 * With no conditions logged, the previous defaults stand — an empty day is not
 * evidence about anything.
 */
export function deriveDefaults(
  form: EntryForm,
  current: EntryDefaults,
): EntryDefaults {
  const conditions = allConditions(form)
  if (conditions.length === 0) return current
  return {
    diagnosisBasis: mostCommon(
      conditions.map((c) => c.diagnosisBasis),
      current.diagnosisBasis,
    ),
    alsoSeeingGp: mostCommon(
      conditions.map((c) => c.alsoSeeingGp),
      current.alsoSeeingGp,
    ),
    referredByGp: mostCommon(
      conditions.map((c) => c.referredByGp),
      current.referredByGp,
    ),
  }
}
