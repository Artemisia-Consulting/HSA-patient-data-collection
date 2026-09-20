/**
 * The condition taxonomy (FR4) — 5 fixed categories, each with a searchable
 * sub-list of *conditions treated*, not symptoms.
 *
 * This file is the seed source. At runtime the list is read from the
 * `Condition` table so the research team can add entries during October
 * without a redeploy (rubric item 5, tier 3). Re-run `npm run db:seed` after
 * editing here; the seed is idempotent and never deletes practitioner data.
 *
 * `rank` drives typeahead ordering — lower sorts first, so the conditions a
 * South African homeopath sees most often surface without scrolling, which is
 * what keeps a two-condition entry inside the 30-second budget.
 *
 * `synonyms` are extra search terms only; they are never displayed or stored.
 *
 * OWNERSHIP: integration lead. Agents read; they do not edit.
 */
import type { ConditionCategory } from './enums'

export interface ConditionSeed {
  code: string
  category: ConditionCategory
  label: string
  synonyms?: string[]
  rank?: number
}

/**
 * Every category carries this fallback, which unlocks the free-text field.
 * The code is category-scoped so an "Other" in Mental Health is distinguishable
 * from an "Other" in Communicable at analysis time.
 */
export const OTHER_CONDITION_SUFFIX = 'OTHER'

export function otherConditionCode(category: ConditionCategory): string {
  return `${category}__${OTHER_CONDITION_SUFFIX}`
}

/** True when this code requires the free-text `conditionOther` field. */
export function isOtherCondition(code: string): boolean {
  return code.endsWith(`__${OTHER_CONDITION_SUFFIX}`)
}

export const CONDITION_TAXONOMY: ConditionSeed[] = [
  // ---------------- Mental Health ----------------
  { code: 'MH_ANXIETY', category: 'MENTAL_HEALTH', label: 'Anxiety', synonyms: ['panic', 'nerves', 'GAD'], rank: 1 },
  { code: 'MH_DEPRESSION', category: 'MENTAL_HEALTH', label: 'Depression', synonyms: ['low mood', 'mood disorder'], rank: 2 },
  { code: 'MH_STRESS', category: 'MENTAL_HEALTH', label: 'Stress-related presentations', synonyms: ['burnout', 'overwhelm'], rank: 3 },
  { code: 'MH_SLEEP', category: 'MENTAL_HEALTH', label: 'Sleep disorders', synonyms: ['insomnia', 'sleeplessness'], rank: 4 },
  { code: 'MH_MIGRAINE', category: 'MENTAL_HEALTH', label: 'Migraine', synonyms: ['headache'], rank: 5 },
  { code: 'MH_EPILEPSY', category: 'MENTAL_HEALTH', label: 'Epilepsy', synonyms: ['seizures', 'fits'], rank: 6 },
  { code: 'MH_GRIEF', category: 'MENTAL_HEALTH', label: 'Grief / bereavement', rank: 7 },
  { code: 'MH_ADHD', category: 'MENTAL_HEALTH', label: 'ADHD / concentration difficulties', synonyms: ['ADD', 'attention'], rank: 8 },
  { code: 'MH_SUBSTANCE', category: 'MENTAL_HEALTH', label: 'Substance use / dependence', synonyms: ['addiction', 'alcohol'], rank: 9 },
  { code: 'MENTAL_HEALTH__OTHER', category: 'MENTAL_HEALTH', label: 'Other (specify)', rank: 999 },

  // ---------------- Women's Health & Hormones ----------------
  { code: 'WH_PREGNANCY', category: 'WOMENS_HEALTH_HORMONES', label: 'Pregnancy-related complaints', synonyms: ['antenatal', 'morning sickness'], rank: 1 },
  { code: 'WH_MENSTRUAL', category: 'WOMENS_HEALTH_HORMONES', label: 'Menstrual / cycle disorders', synonyms: ['period', 'dysmenorrhoea', 'PMS'], rank: 2 },
  { code: 'WH_HORMONAL', category: 'WOMENS_HEALTH_HORMONES', label: 'Hormonal / reproductive health', synonyms: ['PCOS', 'fertility', 'endometriosis'], rank: 3 },
  { code: 'WH_MENOPAUSE', category: 'WOMENS_HEALTH_HORMONES', label: 'Menopause / perimenopause', synonyms: ['hot flushes'], rank: 4 },
  { code: 'WH_THYROID', category: 'WOMENS_HEALTH_HORMONES', label: 'Thyroid disorders', synonyms: ['hypothyroid', 'hyperthyroid'], rank: 5 },
  { code: 'WH_PAEDIATRIC', category: 'WOMENS_HEALTH_HORMONES', label: 'Paediatric illness (non-infectious)', synonyms: ['children', 'colic', 'teething'], rank: 6 },
  { code: 'WH_POSTNATAL', category: 'WOMENS_HEALTH_HORMONES', label: 'Postnatal / breastfeeding complaints', synonyms: ['lactation', 'postpartum'], rank: 7 },
  { code: 'WOMENS_HEALTH_HORMONES__OTHER', category: 'WOMENS_HEALTH_HORMONES', label: 'Other (specify)', rank: 999 },

  // ---------------- Communicable (Infectious) Diseases ----------------
  // HIV and TB are searchable sub-items here, not top-level categories
  // (confirmed by product owner — User story 2.4).
  { code: 'CD_ARI', category: 'COMMUNICABLE', label: 'Acute respiratory infection', synonyms: ['cold', 'flu', 'bronchitis', 'sinusitis', 'URTI'], rank: 1 },
  { code: 'CD_GI', category: 'COMMUNICABLE', label: 'Gastrointestinal infection', synonyms: ['gastro', 'diarrhoea', 'food poisoning'], rank: 2 },
  { code: 'CD_SKIN', category: 'COMMUNICABLE', label: 'Skin / soft-tissue infection', synonyms: ['abscess', 'cellulitis', 'impetigo'], rank: 3 },
  { code: 'CD_TB', category: 'COMMUNICABLE', label: 'Tuberculosis (TB)', synonyms: ['TB', 'tuberculosis', 'pulmonary TB'], rank: 4 },
  { code: 'CD_HIV', category: 'COMMUNICABLE', label: 'HIV-related / opportunistic infection', synonyms: ['HIV', 'AIDS', 'ARV', 'opportunistic'], rank: 5 },
  { code: 'CD_STI', category: 'COMMUNICABLE', label: 'Sexually transmitted infection', synonyms: ['STI', 'STD'], rank: 6 },
  { code: 'CD_POSTVIRAL', category: 'COMMUNICABLE', label: 'Post-viral syndrome', synonyms: ['long covid', 'post viral fatigue'], rank: 7 },
  { code: 'CD_VECTOR', category: 'COMMUNICABLE', label: 'Vector-borne disease', synonyms: ['malaria', 'tick bite fever'], rank: 8 },
  { code: 'CD_PARASITIC', category: 'COMMUNICABLE', label: 'Parasitic infection', synonyms: ['worms', 'bilharzia', 'schistosomiasis'], rank: 9 },
  { code: 'CD_VACCINE_PREVENTABLE', category: 'COMMUNICABLE', label: 'Vaccine-preventable illness', synonyms: ['measles', 'chickenpox', 'mumps'], rank: 10 },
  { code: 'CD_URINARY', category: 'COMMUNICABLE', label: 'Urinary tract infection', synonyms: ['UTI', 'cystitis', 'bladder'], rank: 11 },
  { code: 'COMMUNICABLE__OTHER', category: 'COMMUNICABLE', label: 'Other (specify)', rank: 999 },

  // ---------------- Non-communicable / Chronic ----------------
  { code: 'NC_MUSCULOSKELETAL', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Chronic pain / musculoskeletal', synonyms: ['back pain', 'arthritis', 'joint'], rank: 1 },
  { code: 'NC_CARDIOVASCULAR', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Cardiovascular disease', synonyms: ['hypertension', 'blood pressure', 'cholesterol'], rank: 2 },
  { code: 'NC_DIABETES', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Diabetes / metabolic syndrome', synonyms: ['blood sugar', 'insulin resistance'], rank: 3 },
  { code: 'NC_RESPIRATORY', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Chronic respiratory disease', synonyms: ['asthma', 'COPD', 'emphysema'], rank: 4 },
  { code: 'NC_AUTOIMMUNE', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Autoimmune condition', synonyms: ['lupus', 'rheumatoid', 'thyroiditis'], rank: 5 },
  { code: 'NC_CANCER', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Cancer (supportive / palliative)', synonyms: ['oncology', 'chemo support'], rank: 6 },
  { code: 'NC_SKIN_CHRONIC', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Chronic skin condition', synonyms: ['eczema', 'psoriasis', 'acne'], rank: 7 },
  { code: 'NC_NEURO', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Chronic neurological condition', synonyms: ['neuropathy', 'multiple sclerosis'], rank: 8 },
  { code: 'NON_COMMUNICABLE_CHRONIC__OTHER', category: 'NON_COMMUNICABLE_CHRONIC', label: 'Other (specify)', rank: 999 },

  // ---------------- Other ----------------
  { code: 'OT_ALLERGIES', category: 'OTHER', label: 'Allergies', synonyms: ['hay fever', 'allergic rhinitis', 'sinus'], rank: 1 },
  { code: 'OT_DIGESTIVE', category: 'OTHER', label: 'Digestive (non-infectious)', synonyms: ['IBS', 'reflux', 'heartburn', 'bloating'], rank: 2 },
  { code: 'OT_PREVENTIVE', category: 'OTHER', label: 'Preventive care / wellness', synonyms: ['check-up', 'immune support', 'tonic'], rank: 3 },
  { code: 'OT_INJURY', category: 'OTHER', label: 'Injury / trauma follow-up', synonyms: ['sprain', 'fracture', 'post-op'], rank: 4 },
  { code: 'OT_FATIGUE', category: 'OTHER', label: 'Fatigue / low energy', synonyms: ['tiredness', 'exhaustion'], rank: 5 },
  { code: 'OTHER__OTHER', category: 'OTHER', label: 'Other (specify)', rank: 999 },
]

/** Conditions in one category, already in typeahead order. */
export function conditionsForCategory(category: ConditionCategory): ConditionSeed[] {
  return CONDITION_TAXONOMY.filter((c) => c.category === category).sort(
    (a, b) => (a.rank ?? 100) - (b.rank ?? 100),
  )
}

export function findCondition(code: string): ConditionSeed | undefined {
  return CONDITION_TAXONOMY.find((c) => c.code === code)
}
