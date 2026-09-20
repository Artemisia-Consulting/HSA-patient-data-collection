/**
 * Form state → contract payload.
 *
 * This is the layer where a mistake is both expensive and invisible: a
 * condition silently dropped, free text attached to a coded condition, a count
 * that became NaN on the way through an input. Every assertion here is made
 * against the contract's own schema rather than a hand-written expectation, so
 * these tests fail if Stream 2 drifts from the contract — which is the point.
 *
 * OWNER: Stream 2.
 */
import { describe, expect, it } from 'vitest'

import {
  allConditions,
  COLLAPSED,
  countOf,
  deriveDefaults,
  emptyForm,
  firstFailingPatient,
  formFromDailyLog,
  formFromRequest,
  isEmptyEntry,
  newDraftCondition,
  newDraftPatient,
  nextOpenRequest,
  patientsOfType,
  resolveOpenPatient,
  setPatientCount,
  shouldReplaceForm,
  toDailyLogRequest,
  totalPatients,
  updatePatient,
  validateForm,
  type DraftCondition,
  type EntryForm,
} from '../../src/lib/client/entry'
import { conditionsOf } from '../helpers/log-body'
import { CONTRACT_DEFAULTS } from '../../src/lib/client/preferences'
import { dailyLogRequestSchema, type DailyLog } from '../../src/lib/contract/api'
import {
  DEFAULT_DIAGNOSIS_BASIS,
  DEFAULT_GP_CO_MANAGEMENT,
  DEFAULT_REFERRED_BY_GP,
} from '../../src/lib/contract/enums'

const TODAY = '2026-10-07'

/**
 * A day with 3 new and 4 returning patients, the given conditions all on the
 * first new patient. The counts are derived from the patient list rather than
 * set beside it, so this is the same shape the count picker produces.
 */
function formWith(conditions: DraftCondition[]): EntryForm {
  let form: EntryForm = {
    logDate: TODAY,
    patients: [{ ...newDraftPatient('NEW'), conditions }],
  }
  form = setPatientCount(form, 'NEW', 3)
  return setPatientCount(form, 'FOLLOW_UP', 4)
}

/** A day holding exactly one patient, carrying the given conditions. */
function onePatientWith(conditions: DraftCondition[]): EntryForm {
  return { logDate: TODAY, patients: [{ ...newDraftPatient('NEW'), conditions }] }
}

describe('newDraftCondition', () => {
  it('pre-answers all three flags from the contract defaults (FR5)', () => {
    const condition = newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS)
    expect(condition.diagnosisBasis).toBe(DEFAULT_DIAGNOSIS_BASIS)
    expect(condition.alsoSeeingGp).toBe(DEFAULT_GP_CO_MANAGEMENT)
    expect(condition.referredByGp).toBe(DEFAULT_REFERRED_BY_GP)
    // Selecting a condition must therefore cost exactly one tap: this is the
    // single biggest contributor to the 30-second budget.
    expect(validateForm(formWith([condition])).ok).toBe(true)
  })

  it('gives each draft a distinct local key that is never sent', () => {
    const a = newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS)
    const b = newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS)
    expect(a.key).not.toBe(b.key)
    const [sent] = conditionsOf(toDailyLogRequest(formWith([a, b])))
    expect(sent).not.toHaveProperty('key')
  })
})

describe('toDailyLogRequest', () => {
  it('omits conditionOther entirely for a coded condition', () => {
    const condition = {
      ...newDraftCondition('COMMUNICABLE', 'CD_TB', CONTRACT_DEFAULTS),
      // Simulate a practitioner who typed in the free-text box, then picked a
      // real condition instead. The stray text must not travel.
      conditionOther: 'left over text',
    }
    const body = toDailyLogRequest(formWith([condition]))
    expect(Object.keys(conditionsOf(body)[0])).not.toContain('conditionOther')
    expect(dailyLogRequestSchema.safeParse(body).success).toBe(true)
  })

  it('includes trimmed conditionOther for an "Other" code', () => {
    const condition = {
      ...newDraftCondition('OTHER', 'OTHER__OTHER', CONTRACT_DEFAULTS),
      conditionOther: '  chronic fatigue  ',
    }
    const body = toDailyLogRequest(formWith([condition]))
    expect(conditionsOf(body)[0].conditionOther).toBe('chronic fatigue')
    expect(dailyLogRequestSchema.safeParse(body).success).toBe(true)
  })

  it('produces a payload with no key beyond the contract (POPIA)', () => {
    const body = toDailyLogRequest(
      formWith([
        newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS),
        {
          ...newDraftCondition('OTHER', 'OTHER__OTHER', CONTRACT_DEFAULTS),
          conditionOther: 'burnout',
        },
      ]),
    )

    expect(Object.keys(body).sort()).toEqual([
      'followUpPatients',
      'newPatients',
      'patients',
    ])
    // A patient carries a type and what was treated — nothing about who they
    // are, not even a client-side ordering hint.
    expect(Object.keys(body.patients[0]).sort()).toEqual(['conditions', 'patientType'])
    expect(Object.keys(conditionsOf(body)[0]).sort()).toEqual([
      'alsoSeeingGp',
      'category',
      'conditionCode',
      'diagnosisBasis',
      'referredByGp',
    ])
    // Nothing that could identify a patient, and no logDate — the date is in
    // the URL, which keeps the upsert key in one place.
    expect(JSON.stringify(body)).not.toMatch(/patient(Name|Ref)|idNumber|dob|notes/i)
    // Seven patients were counted, so seven patient entries are sent — the
    // two counts and the list are the same fact, and the server rejects them
    // when they disagree.
    expect(body.patients).toHaveLength(body.newPatients + body.followUpPatients)
  })

  it('round-trips a saved day back into an identical payload', () => {
    const original = toDailyLogRequest(
      formWith([
        newDraftCondition('NON_COMMUNICABLE_CHRONIC', 'NC_MUSCULOSKELETAL', {
          diagnosisBasis: 'PATIENT_REPORTED_PRIOR',
          alsoSeeingGp: 'YES',
          referredByGp: 'YES',
        }),
      ]),
    )
    expect(toDailyLogRequest(formFromRequest(TODAY, original))).toEqual(original)
  })

  it('rehydrates a stored DailyLog, mapping null free text to an empty string', () => {
    const log: DailyLog = {
      // Note: the contract's DailyLog carries no practitionerId. A
      // practitioner reading back their own day does not need to be told whose
      // it is, and leaving it out keeps the id out of the client entirely.
      id: 'log_1',
      logDate: TODAY,
      newPatients: 2,
      followUpPatients: 5,
      totalPatients: 7,
      patients: [
        {
          id: 'pe_1',
          patientType: 'NEW',
          position: 1,
          conditions: [
            {
              id: 'ce_1',
              category: 'COMMUNICABLE',
              conditionCode: 'CD_TB',
              conditionOther: null,
              diagnosisBasis: 'CLINICAL_DIAGNOSIS',
              alsoSeeingGp: 'YES',
              referredByGp: 'YES',
            },
          ],
        },
        { id: 'pe_2', patientType: 'NEW', position: 2, conditions: [] },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `pe_f${i + 1}`,
          patientType: 'FOLLOW_UP' as const,
          position: i + 1,
          conditions: [],
        })),
      ],
      createdAt: '2026-10-07T18:00:00.000Z',
      updatedAt: '2026-10-07T18:00:00.000Z',
    }
    const form = formFromDailyLog(log)
    expect(allConditions(form)[0].conditionOther).toBe('')
    expect(countOf(form, 'NEW')).toBe(2)
    expect(totalPatients(form)).toBe(log.totalPatients)
    // And editing it back out must not resurrect the null as free text.
    expect(Object.keys(conditionsOf(toDailyLogRequest(form))[0])).not.toContain(
      'conditionOther',
    )
  })

  it('keeps each stored patient separate, with their own conditions', () => {
    const log: DailyLog = {
      id: 'log_2',
      logDate: TODAY,
      newPatients: 2,
      followUpPatients: 0,
      totalPatients: 2,
      patients: [
        {
          id: 'pe_1',
          patientType: 'NEW',
          position: 1,
          conditions: [
            {
              id: 'ce_1',
              category: 'COMMUNICABLE',
              conditionCode: 'CD_TB',
              conditionOther: null,
              diagnosisBasis: 'CLINICAL_DIAGNOSIS',
              alsoSeeingGp: 'YES',
              referredByGp: 'YES',
            },
            {
              id: 'ce_2',
              category: 'MENTAL_HEALTH',
              conditionCode: 'MH_ANXIETY',
              conditionOther: null,
              diagnosisBasis: 'CLINICAL_DIAGNOSIS',
              alsoSeeingGp: 'YES',
              referredByGp: 'YES',
            },
          ],
        },
        { id: 'pe_2', patientType: 'NEW', position: 2, conditions: [] },
      ],
      createdAt: '2026-10-07T18:00:00.000Z',
      updatedAt: '2026-10-07T18:00:00.000Z',
    }
    const form = formFromDailyLog(log)
    expect(form.patients.map((patient) => patient.conditions.length)).toEqual([2, 0])
    // Reopening a day and saving it again must send back what was stored.
    expect(toDailyLogRequest(form).patients).toEqual([
      {
        patientType: 'NEW',
        conditions: [
          {
            category: 'COMMUNICABLE',
            conditionCode: 'CD_TB',
            diagnosisBasis: 'CLINICAL_DIAGNOSIS',
            alsoSeeingGp: 'YES',
            referredByGp: 'YES',
          },
          {
            category: 'MENTAL_HEALTH',
            conditionCode: 'MH_ANXIETY',
            diagnosisBasis: 'CLINICAL_DIAGNOSIS',
            alsoSeeingGp: 'YES',
            referredByGp: 'YES',
          },
        ],
      },
      { patientType: 'NEW', conditions: [] },
    ])
  })
})

describe('validateForm', () => {
  it('accepts a day with zero patients and no conditions', () => {
    // A quiet day is real data, not an error — blocking it would train people
    // to make something up.
    expect(validateForm(emptyForm(TODAY)).ok).toBe(true)
  })

  it('blocks an "Other" row with no description, and names the card', () => {
    const condition = newDraftCondition(
      'COMMUNICABLE',
      'COMMUNICABLE__OTHER',
      CONTRACT_DEFAULTS,
    )
    const result = validateForm(formWith([condition]))
    expect(result.ok).toBe(false)
    expect(result.conditionErrors[condition.key]).toBeTruthy()
  })

  it('treats whitespace-only free text as missing', () => {
    const condition = {
      ...newDraftCondition('COMMUNICABLE', 'COMMUNICABLE__OTHER', CONTRACT_DEFAULTS),
      conditionOther: '   ',
    }
    expect(validateForm(formWith([condition])).ok).toBe(false)
  })

  it('rejects a day with more patients than the contract allows', () => {
    expect(validateForm(setPatientCount(emptyForm(TODAY), 'NEW', 200)).ok).toBe(true)
    expect(validateForm(setPatientCount(emptyForm(TODAY), 'NEW', 201)).ok).toBe(false)
  })
})

describe('setPatientCount', () => {
  it('creates a card per patient, so the counts can never disagree', () => {
    const form = setPatientCount(setPatientCount(emptyForm(TODAY), 'NEW', 3), 'FOLLOW_UP', 2)
    expect(countOf(form, 'NEW')).toBe(3)
    expect(countOf(form, 'FOLLOW_UP')).toBe(2)
    expect(totalPatients(form)).toBe(5)
    const body = toDailyLogRequest(form)
    expect(body.patients).toHaveLength(5)
    expect(validateForm(form).ok).toBe(true)
  })

  it('trims from the end, so a mis-tap costs the newest card not the first', () => {
    // The first card is where the work usually is: it is filled in first and
    // it is the one still on screen when the picker is re-tapped.
    const seeded = setPatientCount(emptyForm(TODAY), 'NEW', 3)
    const first = seeded.patients[0]
    const withWork = updatePatient(seeded, first.key, (patient) => ({
      ...patient,
      conditions: [newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS)],
    }))

    const trimmed = setPatientCount(withWork, 'NEW', 1)
    expect(trimmed.patients).toHaveLength(1)
    expect(trimmed.patients[0].key).toBe(first.key)
    expect(allConditions(trimmed)).toHaveLength(1)
  })

  it('leaves the other type alone', () => {
    let form = setPatientCount(emptyForm(TODAY), 'NEW', 2)
    form = setPatientCount(form, 'FOLLOW_UP', 3)
    form = setPatientCount(form, 'NEW', 0)
    expect(countOf(form, 'NEW')).toBe(0)
    expect(patientsOfType(form, 'FOLLOW_UP')).toHaveLength(3)
  })

  it('cannot be driven negative or fractional by a stray input', () => {
    expect(countOf(setPatientCount(emptyForm(TODAY), 'NEW', -1), 'NEW')).toBe(0)
    expect(countOf(setPatientCount(emptyForm(TODAY), 'NEW', 1.7), 'NEW')).toBe(1)
  })
})

describe('resolveOpenPatient', () => {
  const threeNew = () => setPatientCount(emptyForm(TODAY), 'NEW', 3)

  it('opens the first card before anything has been asked for', () => {
    // Otherwise setting a count lands the practitioner on a list of collapsed
    // rows, costing a tap the always-expanded layout did not.
    const form = threeNew()
    expect(resolveOpenPatient(form, null)).toBe(form.patients[0].key)
  })

  it('opens nothing when there are no patients yet', () => {
    expect(resolveOpenPatient(emptyForm(TODAY), null)).toBeNull()
  })

  it('opens the card that was asked for', () => {
    const form = threeNew()
    expect(resolveOpenPatient(form, form.patients[2].key)).toBe(form.patients[2].key)
  })

  it('keeps everything collapsed once the open card is closed', () => {
    // This is why the request cannot just go back to null: that would spring
    // the first card open again the moment the practitioner closed one.
    const form = threeNew()
    expect(resolveOpenPatient(form, COLLAPSED)).toBeNull()
  })

  it('collapses rather than jumping when the open card is removed', () => {
    const form = threeNew()
    const last = form.patients[2].key
    const trimmed = setPatientCount(form, 'NEW', 1)
    expect(resolveOpenPatient(trimmed, last)).toBeNull()
  })

  it('collapses when the keys belong to a different day', () => {
    // Loading another date regenerates every draft key, so a stale request
    // must not resolve onto whichever patient happens to sit in that slot.
    const stale = threeNew().patients[0].key
    const other = setPatientCount(emptyForm('2026-10-08'), 'NEW', 3)
    expect(resolveOpenPatient(other, stale)).toBeNull()
  })

  it('spans both sections, so a returning patient closes an open new one', () => {
    let form = setPatientCount(emptyForm(TODAY), 'NEW', 2)
    form = setPatientCount(form, 'FOLLOW_UP', 2)
    const returning = patientsOfType(form, 'FOLLOW_UP')[0].key
    const open = resolveOpenPatient(form, returning)
    expect(open).toBe(returning)
    expect(patientsOfType(form, 'NEW').some((p) => p.key === open)).toBe(false)
  })
})

describe('nextOpenRequest', () => {
  it('opens a card that is not the open one', () => {
    expect(nextOpenRequest('a', 'b')).toBe('b')
  })

  it('closes the card that is already open', () => {
    expect(nextOpenRequest('a', 'a')).toBe(COLLAPSED)
  })

  it('closes the first card when it is open by default rather than by request', () => {
    // The tap is resolved against the card that *is* open, not the request
    // that produced it, or tapping the auto-opened first card would re-open it.
    const form = setPatientCount(emptyForm(TODAY), 'NEW', 3)
    const open = resolveOpenPatient(form, null)
    expect(open).not.toBeNull()
    const request = nextOpenRequest(open, form.patients[0].key)
    expect(resolveOpenPatient(form, request)).toBeNull()
  })
})

describe('firstFailingPatient', () => {
  it('finds the patient holding a rejected condition', () => {
    // A collapsed card hides the field the error message is about, so the
    // submit handler uses this to open the one the practitioner must fix.
    let form = setPatientCount(emptyForm(TODAY), 'NEW', 3)
    const second = form.patients[1]
    form = updatePatient(form, second.key, (patient) => ({
      ...patient,
      conditions: [
        newDraftCondition('COMMUNICABLE', 'COMMUNICABLE__OTHER', CONTRACT_DEFAULTS),
      ],
    }))

    const validation = validateForm(form)
    expect(validation.ok).toBe(false)
    expect(firstFailingPatient(form, validation.conditionErrors)?.key).toBe(second.key)
  })

  it('is null when nothing failed', () => {
    const form = setPatientCount(emptyForm(TODAY), 'NEW', 2)
    expect(firstFailingPatient(form, {})).toBeNull()
  })
})

describe('deriveDefaults', () => {
  const basis = (n: number, value: 'CLINICAL_DIAGNOSIS' | 'PRESENTING_COMPLAINT_ONLY') =>
    Array.from({ length: n }, () => ({
      ...newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS),
      diagnosisBasis: value,
    }))

  it('takes the modal value, not the last one touched', () => {
    // Eight patients on a clinical diagnosis and one outlier must not flip
    // tomorrow's default. "Last touched" would; "most common" does not.
    const form = formWith([
      ...basis(8, 'CLINICAL_DIAGNOSIS'),
      ...basis(1, 'PRESENTING_COMPLAINT_ONLY'),
    ])
    expect(deriveDefaults(form, CONTRACT_DEFAULTS).diagnosisBasis).toBe(
      'CLINICAL_DIAGNOSIS',
    )
  })

  it('does move the default when the practitioner consistently changes it', () => {
    const form = formWith(basis(3, 'PRESENTING_COMPLAINT_ONLY'))
    expect(deriveDefaults(form, CONTRACT_DEFAULTS).diagnosisBasis).toBe(
      'PRESENTING_COMPLAINT_ONLY',
    )
  })

  it('leaves defaults untouched on an empty day', () => {
    expect(deriveDefaults(emptyForm(TODAY), CONTRACT_DEFAULTS)).toEqual(CONTRACT_DEFAULTS)
  })

  it('is stable on a tie, keeping the earliest value', () => {
    const form = formWith([
      ...basis(1, 'PRESENTING_COMPLAINT_ONLY'),
      ...basis(1, 'CLINICAL_DIAGNOSIS'),
    ])
    expect(deriveDefaults(form, CONTRACT_DEFAULTS).diagnosisBasis).toBe(
      'PRESENTING_COMPLAINT_ONLY',
    )
  })

  it('derives each of the three flags independently', () => {
    const form = formWith([
      {
        ...newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS),
        alsoSeeingGp: 'NO',
        referredByGp: 'NO',
      },
      {
        ...newDraftCondition('MENTAL_HEALTH', 'MH_SLEEP', CONTRACT_DEFAULTS),
        alsoSeeingGp: 'NO',
        referredByGp: 'YES',
      },
    ])
    const next = deriveDefaults(form, CONTRACT_DEFAULTS)
    expect(next.alsoSeeingGp).toBe('NO')
    expect(next.referredByGp).toBe('NO')
    expect(next.diagnosisBasis).toBe(DEFAULT_DIAGNOSIS_BASIS)
  })
})

describe('isEmptyEntry', () => {
  it('is true only for a day with nobody on it', () => {
    expect(isEmptyEntry(emptyForm(TODAY))).toBe(true)
    expect(isEmptyEntry(setPatientCount(emptyForm(TODAY), 'NEW', 1))).toBe(false)
    expect(isEmptyEntry(setPatientCount(emptyForm(TODAY), 'FOLLOW_UP', 1))).toBe(false)
    // A patient with nothing itemised is still a record: they were seen.
    expect(
      isEmptyEntry(
        onePatientWith([newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS)]),
      ),
    ).toBe(false)
  })
})

describe('shouldReplaceForm', () => {
  it('accepts any load while the practitioner has not touched the form', () => {
    expect(shouldReplaceForm(emptyForm(TODAY), false)).toBe(true)
    expect(shouldReplaceForm(formWith([]), false)).toBe(true)
  })

  it('never lets an empty reply wipe out a tap already made', () => {
    // The form is interactive while the day is still loading, so a late
    // "nothing is logged for today" reply can land after an early tap. Letting
    // it win would silently reset a count and submit a zero.
    expect(shouldReplaceForm(emptyForm(TODAY), true)).toBe(false)
  })

  it('still shows a real record that arrives after an early tap', () => {
    // A non-empty reply is the only truth for that date; keeping the taps
    // instead would be showing the wrong day.
    expect(shouldReplaceForm(formWith([]), true)).toBe(true)
  })

  it('counts a single patient as a real record', () => {
    const loaded = onePatientWith([
      newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS),
    ])
    expect(shouldReplaceForm(loaded, true)).toBe(true)
  })
})
