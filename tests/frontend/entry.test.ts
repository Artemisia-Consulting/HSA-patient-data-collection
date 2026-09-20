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
  deriveDefaults,
  emptyForm,
  formFromDailyLog,
  formFromRequest,
  isEmptyEntry,
  newDraftCondition,
  shouldReplaceForm,
  toDailyLogRequest,
  totalPatients,
  validateForm,
  type EntryForm,
} from '../../src/lib/client/entry'
import { CONTRACT_DEFAULTS } from '../../src/lib/client/preferences'
import { dailyLogRequestSchema, type DailyLog } from '../../src/lib/contract/api'
import {
  DEFAULT_DIAGNOSIS_BASIS,
  DEFAULT_GP_CO_MANAGEMENT,
  DEFAULT_REFERRED_BY_GP,
} from '../../src/lib/contract/enums'

const TODAY = '2026-10-07'

function formWith(conditions: EntryForm['conditions']): EntryForm {
  return { logDate: TODAY, newPatients: 3, followUpPatients: 4, conditions }
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
    const [sent] = toDailyLogRequest(formWith([a, b])).conditions
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
    expect(Object.keys(body.conditions[0])).not.toContain('conditionOther')
    expect(dailyLogRequestSchema.safeParse(body).success).toBe(true)
  })

  it('includes trimmed conditionOther for an "Other" code', () => {
    const condition = {
      ...newDraftCondition('OTHER', 'OTHER__OTHER', CONTRACT_DEFAULTS),
      conditionOther: '  chronic fatigue  ',
    }
    const body = toDailyLogRequest(formWith([condition]))
    expect(body.conditions[0].conditionOther).toBe('chronic fatigue')
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
      'conditions',
      'followUpPatients',
      'newPatients',
    ])
    expect(Object.keys(body.conditions[0]).sort()).toEqual([
      'alsoSeeingGp',
      'category',
      'conditionCode',
      'diagnosisBasis',
      'referredByGp',
    ])
    // Nothing that could identify a patient, and no logDate — the date is in
    // the URL, which keeps the upsert key in one place.
    expect(JSON.stringify(body)).not.toMatch(/patient(Name|Ref)|idNumber|dob|notes/i)
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
      createdAt: '2026-10-07T18:00:00.000Z',
      updatedAt: '2026-10-07T18:00:00.000Z',
    }
    const form = formFromDailyLog(log)
    expect(form.conditions[0].conditionOther).toBe('')
    expect(form.newPatients).toBe(2)
    expect(totalPatients(form)).toBe(log.totalPatients)
    // And editing it back out must not resurrect the null as free text.
    expect(Object.keys(toDailyLogRequest(form).conditions[0])).not.toContain(
      'conditionOther',
    )
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

  it('rejects counts the contract rejects', () => {
    expect(validateForm({ ...emptyForm(TODAY), newPatients: 201 }).ok).toBe(false)
    expect(validateForm({ ...emptyForm(TODAY), followUpPatients: -1 }).ok).toBe(false)
    expect(validateForm({ ...emptyForm(TODAY), newPatients: 1.5 }).ok).toBe(false)
    expect(validateForm({ ...emptyForm(TODAY), newPatients: 200 }).ok).toBe(true)
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
  it('is true only for a day with no counts and no conditions', () => {
    expect(isEmptyEntry(emptyForm(TODAY))).toBe(true)
    expect(isEmptyEntry({ ...emptyForm(TODAY), newPatients: 1 })).toBe(false)
    expect(isEmptyEntry({ ...emptyForm(TODAY), followUpPatients: 1 })).toBe(false)
    expect(
      isEmptyEntry({
        ...emptyForm(TODAY),
        conditions: [newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS)],
      }),
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

  it('counts conditions alone as a real record', () => {
    const loaded = {
      ...emptyForm(TODAY),
      conditions: [newDraftCondition('MENTAL_HEALTH', 'MH_ANXIETY', CONTRACT_DEFAULTS)],
    }
    expect(shouldReplaceForm(loaded, true)).toBe(true)
  })
})
