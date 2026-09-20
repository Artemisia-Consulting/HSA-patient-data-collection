'use client'

/**
 * The core screen (FR3–FR6, user stories 2.3–2.6).
 *
 * The shape of the entry follows the day: say how many patients were new and
 * how many were returning, then fill in what each of them presented with. The
 * counts are not a summary written beside the detail — they *are* the detail's
 * structure, because setting "New patients" to 4 is what puts four patient
 * cards on the screen. That is what makes the dataset able to answer "how many
 * patients presented with more than one condition?", which a day-level list of
 * conditions could not express at all.
 *
 * A full day is now a couple of minutes rather than thirty seconds, which is
 * the deliberate trade. What is still protected is the cost of each *step*:
 *
 *  - Date is already right (server-side SAST) — 0 taps.
 *  - Counts are a 0–9 grid — 1 tap each, not eight on a stepper.
 *  - Category then condition is 2 taps, no typing, because the list is
 *    rank-ordered and open by default.
 *  - Exactly one patient card is expanded at a time, so moving to the next
 *    patient is 1 tap and the one you are on is never lost in the list.
 *  - The three questions are already answered with the practitioner's own
 *    remembered values — 0 taps, visible without opening anything.
 *  - Submit is one tap on a bar that never scrolls away.
 *
 * A patient card left untouched is a valid record: somebody was seen and their
 * conditions were not itemised. Nothing on a card is required, so a busy day
 * can still be filed in seconds by setting two counts and submitting.
 *
 * Two failure paths are handled rather than assumed away: a submit that cannot
 * reach the server is written to the outbox and replayed (so the day is not
 * lost on a bad signal), and an in-progress entry is autosaved per date (so a
 * backgrounded PWA killed by Android does not cost the whole thing).
 *
 * OWNER: Stream 2.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/Button'
import { CountPicker } from '@/components/ui/CountPicker'
import { PatientCard } from '@/components/log/PatientCard'
import { DateField } from '@/components/log/DateField'
import { useOnline } from '@/components/session/useOnline'
import {
  ApiClientError,
  ApiNetworkError,
  api,
  clearDraft,
  flushOutbox,
  loadDraft,
  loadEntryDefaults,
  loadTaxonomy,
  pendingFor,
  queueLog,
  removeFromOutbox,
  saveDraft,
  saveEntryDefaults,
  type EntryDefaults,
} from '@/lib/client'
import {
  allConditions,
  countOf,
  deriveDefaults,
  emptyForm,
  firstFailingPatient,
  formFromDailyLog,
  formFromRequest,
  newDraftCondition,
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
} from '@/lib/client/entry'
import type { TaxonomyResponse } from '@/lib/contract/api'
import {
  PATIENT_TYPE_LABELS,
  type ConditionCategory,
  type PatientType,
} from '@/lib/contract/enums'
import { formatLogDateLong } from '@/lib/dates'

type SubmitState =
  | { kind: 'editing' }
  | { kind: 'saving' }
  | { kind: 'saved'; updated: boolean }
  | { kind: 'queued' }
  | { kind: 'practised' }

interface DailyLogFormProps {
  today: string
  /** Practice mode (FR2, rubric item 3 tier 3): nothing is sent or stored. */
  practice?: boolean
  onFinishPractice?: () => void
}

export function DailyLogForm({
  today,
  practice = false,
  onFinishPractice,
}: DailyLogFormProps) {
  const online = useOnline()

  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null)
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<EntryDefaults | null>(null)

  const [form, setForm] = useState<EntryForm>(() => emptyForm(today))
  const [loadingDate, setLoadingDate] = useState(true)
  const [conditionErrors, setConditionErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'editing' })
  const [wasExisting, setWasExisting] = useState(false)

  /**
   * What the practitioner last asked to have open. `resolveOpenPatient` turns
   * it into the card that actually is — see the note on it for why the two are
   * not the same thing.
   */
  const [openRequest, setOpenRequest] = useState<string | null>(null)

  const confirmationRef = useRef<HTMLDivElement | null>(null)

  /**
   * Has the practitioner touched the form since this date started loading?
   *
   * The screen is interactive before `loadForDate` resolves — deliberately, so
   * the first tap never has to wait for the network. That leaves a window in
   * which a late "there is nothing logged for today" reply could overwrite a
   * tap that has already happened. See `applyLoaded`.
   */
  const dirty = useRef(false)
  /** Discards a reply for a date the practitioner has already moved on from. */
  const loadSeq = useRef(0)

  /** Every user-initiated change goes through here, so `dirty` cannot drift. */
  const editForm = useCallback(
    (update: (current: EntryForm) => EntryForm) => {
      dirty.current = true
      setForm(update)
    },
    [],
  )

  /* ---------------- taxonomy + remembered defaults ---------------- */

  useEffect(() => {
    setDefaults(loadEntryDefaults())
    let cancelled = false
    loadTaxonomy((fresh) => {
      if (!cancelled) setTaxonomy(fresh)
    })
      .then(({ taxonomy: loaded }) => {
        if (!cancelled) setTaxonomy(loaded)
      })
      .catch(() => {
        if (!cancelled)
          setTaxonomyError(
            'Could not load the condition list. Your patient counts will still save.',
          )
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* ---------------- load whatever exists for this date ---------------- */

  const loadForDate = useCallback(
    async (logDate: string) => {
      const seq = ++loadSeq.current
      const isStale = () => seq !== loadSeq.current

      setLoadingDate(true)
      dirty.current = false
      setConditionErrors({})
      setSubmitError(null)
      setSubmitState({ kind: 'editing' })
      setOpenRequest(null)

      /** The one place a loaded day reaches the form. See shouldReplaceForm. */
      const applyLoaded = (next: EntryForm, existing: boolean) => {
        if (isStale()) return
        setWasExisting(existing)
        if (shouldReplaceForm(next, dirty.current)) setForm(next)
      }

      const fallbackToLocal = () => {
        const draft = loadDraft(logDate)
        applyLoaded(
          draft ? formFromRequest(logDate, draft.body) : emptyForm(logDate),
          false,
        )
      }

      if (practice) {
        applyLoaded(emptyForm(logDate), false)
        setLoadingDate(false)
        return
      }

      // A submit that is queued offline is the most recent truth for that day.
      const queued = pendingFor(logDate)
      if (queued) {
        applyLoaded(formFromRequest(logDate, queued.body), true)
        setLoadingDate(false)
        return
      }

      try {
        const existing = await api.getLog(logDate)
        applyLoaded(formFromDailyLog(existing), true)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) fallbackToLocal()
        else if (error instanceof ApiNetworkError) fallbackToLocal()
        else fallbackToLocal()
      } finally {
        if (!isStale()) {
          setLoadingDate(false)
        }
      }
    },
    [practice],
  )

  useEffect(() => {
    void loadForDate(today)
    // Only on mount / when the server's idea of today changes.
  }, [loadForDate, today])

  /* ---------------- replay anything stuck in the outbox ---------------- */

  useEffect(() => {
    if (practice) return
    const attempt = () => {
      void flushOutbox()
    }
    attempt()
    window.addEventListener('online', attempt)
    return () => window.removeEventListener('online', attempt)
  }, [practice])

  /* ---------------- autosave the in-progress entry ---------------- */

  // Keyed on `loadingDate` rather than the `hydrated` ref so that a tap made
  // *before* the load finished still gets written once it does — a ref change
  // would not re-run this effect, and that entry would sit unsaved.
  useEffect(() => {
    if (practice || loadingDate || submitState.kind !== 'editing') return
    const handle = window.setTimeout(() => {
      saveDraft(form.logDate, toDailyLogRequest(form))
    }, 400)
    return () => window.clearTimeout(handle)
  }, [form, loadingDate, practice, submitState.kind])

  /* ---------------- derived ---------------- */

  const categories = taxonomy?.categories ?? []

  const openPatientKey = useMemo(
    () => resolveOpenPatient(form, openRequest),
    [form, openRequest],
  )

  const labelForCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const category of categories) {
      for (const condition of category.conditions) map.set(condition.code, condition.label)
    }
    return map
  }, [categories])

  /* ---------------- mutations ---------------- */

  const setCount = useCallback((patientType: PatientType, count: number) => {
    editForm((current) => setPatientCount(current, patientType, count))
  }, [])

  const toggleCondition = useCallback(
    (patientKey: string, category: ConditionCategory, code: string) => {
      editForm((current) =>
        updatePatient(current, patientKey, (patient) => {
          const already = patient.conditions.some((c) => c.conditionCode === code)
          return {
            ...patient,
            conditions: already
              ? patient.conditions.filter((c) => c.conditionCode !== code)
              : [
                  ...patient.conditions,
                  newDraftCondition(category, code, defaults ?? loadEntryDefaults()),
                ],
          }
        }),
      )
    },
    [defaults],
  )

  const patchCondition = useCallback(
    (patientKey: string, key: string, patch: Partial<DraftCondition>) => {
      editForm((current) =>
        updatePatient(current, patientKey, (patient) => ({
          ...patient,
          conditions: patient.conditions.map((condition) =>
            condition.key === key ? { ...condition, ...patch } : condition,
          ),
        })),
      )
      setConditionErrors((current) => {
        if (!current[key]) return current
        const next = { ...current }
        delete next[key]
        return next
      })
    },
    [],
  )

  const removeCondition = useCallback((patientKey: string, key: string) => {
    editForm((current) =>
      updatePatient(current, patientKey, (patient) => ({
        ...patient,
        conditions: patient.conditions.filter((condition) => condition.key !== key),
      })),
    )
  }, [])

  /* ---------------- submit ---------------- */

  const submit = useCallback(async () => {
    const validation = validateForm(form)
    if (!validation.ok) {
      setConditionErrors(validation.conditionErrors)
      setSubmitError(validation.formError ?? 'Please fix the highlighted condition.')
      // "Fix the highlighted condition" is useless if the card holding it is
      // collapsed, so open the first patient that has a problem.
      const failing = firstFailingPatient(form, validation.conditionErrors)
      if (failing) setOpenRequest(failing.key)
      return
    }
    setConditionErrors({})
    setSubmitError(null)

    const nextDefaults = deriveDefaults(form, defaults ?? loadEntryDefaults())
    setDefaults(nextDefaults)
    saveEntryDefaults(nextDefaults)

    if (practice) {
      setSubmitState({ kind: 'practised' })
      return
    }

    setSubmitState({ kind: 'saving' })
    const body = toDailyLogRequest(form)

    try {
      await api.putLog(form.logDate, body)
      clearDraft(form.logDate)
      removeFromOutbox(form.logDate)
      setSubmitState({ kind: 'saved', updated: wasExisting })
    } catch (error) {
      if (error instanceof ApiNetworkError) {
        queueLog(form.logDate, body)
        clearDraft(form.logDate)
        setSubmitState({ kind: 'queued' })
        return
      }
      if (error instanceof ApiClientError) {
        setSubmitState({ kind: 'editing' })
        // The server's message already names the dates it will accept, which
        // are no longer just October's — don't append a second, staler range.
        setSubmitError(error.message)
        return
      }
      setSubmitState({ kind: 'editing' })
      setSubmitError('Something went wrong saving your log. Please try again.')
    }
  }, [defaults, form, practice, wasExisting])

  useEffect(() => {
    if (submitState.kind === 'editing' || submitState.kind === 'saving') return
    confirmationRef.current?.focus()
  }, [submitState.kind])

  /* ---------------- confirmation ---------------- */

  if (
    submitState.kind === 'saved' ||
    submitState.kind === 'queued' ||
    submitState.kind === 'practised'
  ) {
    return (
      <Confirmation
        ref={confirmationRef}
        state={submitState}
        form={form}
        labelForCode={labelForCode}
        onEdit={() => setSubmitState({ kind: 'editing' })}
        onAnotherDay={() => {
          setSubmitState({ kind: 'editing' })
          void loadForDate(today)
        }}
        onFinishPractice={onFinishPractice}
      />
    )
  }

  /* ---------------- the form ---------------- */

  /**
   * One count picker and the patient cards it creates. Written as a function
   * rather than a component so React keeps the same element identity across
   * renders — a nested component defined in the body would remount every card
   * on each keystroke and lose each picker's open state.
   */
  const renderSection = (patientType: PatientType, label: string, hint: string) => {
    const rows = patientsOfType(form, patientType)
    return (
      <div className="space-y-2.5">
        <CountPicker
          label={label}
          hint={hint}
          value={rows.length}
          onChange={(count) => setCount(patientType, count)}
        />
        {rows.length > 0 ? (
          <ul className="space-y-2.5">
            {rows.map((patient, index) => (
              <PatientCard
                key={patient.key}
                patient={patient}
                title={`${PATIENT_TYPE_LABELS[patientType]} patient ${index + 1}`}
                open={patient.key === openPatientKey}
                onToggle={() =>
                  setOpenRequest(nextOpenRequest(openPatientKey, patient.key))
                }
                categories={categories}
                labelForCode={labelForCode}
                conditionErrors={conditionErrors}
                onToggleCondition={(category, code) =>
                  toggleCondition(patient.key, category, code)
                }
                onPatchCondition={(key, patch) =>
                  patchCondition(patient.key, key, patch)
                }
                onRemoveCondition={(key) => removeCondition(patient.key, key)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <div className="pb-28">
      {practice ? (
        <p className="mb-3 rounded-xl bg-amber-100 px-3 py-2.5 text-sm font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          Practice run — nothing here is saved or sent. Try a full entry so
          1 October is muscle memory.
        </p>
      ) : null}

      {!online ? (
        <p
          role="status"
          className="mb-3 rounded-xl bg-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
        >
          You’re offline. You can still fill this in — it saves on your phone and
          sends itself when you’re back on.
        </p>
      ) : null}

      <div className="space-y-3">
        <DateField
          value={form.logDate}
          today={today}
          onChange={(logDate) => void loadForDate(logDate)}
        />

        {loadingDate ? (
          <p className="px-1 text-sm text-neutral-500 dark:text-neutral-400">
            Loading this day…
          </p>
        ) : null}

        {wasExisting && submitState.kind === 'editing' && !loadingDate ? (
          <p className="rounded-xl bg-hsa-50 px-3 py-2.5 text-sm font-medium text-hsa-700 dark:bg-hsa-700/20 dark:text-hsa-100">
            You already logged this day. Changing anything and saving will
            replace it.
          </p>
        ) : null}

        {taxonomyError ? (
          <p className="rounded-xl bg-amber-100 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
            {taxonomyError}
          </p>
        ) : null}

        {renderSection('NEW', 'New patients', 'Seen for the first time')}
        {renderSection(
          'FOLLOW_UP',
          'Returning patients',
          'Coming back for an existing case',
        )}

        <p className="px-1 pt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Counts and conditions only — never a patient’s name, ID or notes.{' '}
          <Link href="/privacy" className="underline">
            How your data is handled
          </Link>
        </p>
      </div>

      {/* Sticky submit: one tap, always reachable, never scrolls away. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto max-w-md">
          {submitError ? (
            <p role="alert" className="mb-2 text-sm font-medium text-red-600 dark:text-red-400">
              {submitError}
            </p>
          ) : null}
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-neutral-600 dark:text-neutral-300">
              {formatLogDateLong(form.logDate)}
            </span>
            <span className="font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">
              {totalPatients(form)} patient{totalPatients(form) === 1 ? '' : 's'}
            </span>
          </div>
          <Button
            size="lg"
            fullWidth
            busy={submitState.kind === 'saving'}
            disabled={loadingDate}
            onClick={() => void submit()}
          >
            {practice
              ? 'Finish practice entry'
              : wasExisting
                ? 'Update this day'
                : 'Save today’s log'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Confirmation (FR3: "one-tap submit with confirmation")
 * ------------------------------------------------------------------ */

function Confirmation({
  ref,
  state,
  form,
  labelForCode,
  onEdit,
  onAnotherDay,
  onFinishPractice,
}: {
  ref: React.Ref<HTMLDivElement>
  state: SubmitState
  form: EntryForm
  labelForCode: Map<string, string>
  onEdit: () => void
  onAnotherDay: () => void
  onFinishPractice?: () => void
}) {
  const queued = state.kind === 'queued'
  const practised = state.kind === 'practised'
  const conditions = allConditions(form)

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="rounded-2xl bg-white p-5 text-center ring-1 ring-neutral-200 outline-none dark:bg-neutral-900 dark:ring-neutral-800"
    >
      <div
        aria-hidden="true"
        className={[
          'mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl',
          queued
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
            : 'bg-hsa-100 text-hsa-700 dark:bg-hsa-700/30 dark:text-hsa-100',
        ].join(' ')}
      >
        {queued ? '↑' : '✓'}
      </div>

      <h2 className="mt-3 text-xl font-bold text-neutral-900 dark:text-neutral-50">
        {practised
          ? 'That’s the whole thing'
          : queued
            ? 'Saved on your phone'
            : state.kind === 'saved' && state.updated
              ? 'Day updated'
              : 'Logged — thank you'}
      </h2>

      <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-300">
        {practised
          ? 'Nothing was sent. From 1 October, that same flow files your day.'
          : queued
            ? 'No connection right now. It will send itself as soon as you’re back online — you don’t need to do anything.'
            : `${formatLogDateLong(form.logDate)} is recorded.`}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="New" value={countOf(form, 'NEW')} />
        <Stat label="Returning" value={countOf(form, 'FOLLOW_UP')} />
        <Stat label="Total" value={totalPatients(form)} />
      </dl>

      {conditions.length > 0 ? (
        <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
          {conditions.map((condition) => (
            <li
              key={condition.key}
              className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              {condition.conditionOther.trim() ||
                labelForCode.get(condition.conditionCode) ||
                condition.conditionCode}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 space-y-2">
        {practised ? (
          <Button size="lg" fullWidth onClick={onFinishPractice}>
            I’m ready — finish setup
          </Button>
        ) : (
          <>
            <Button variant="secondary" fullWidth onClick={onEdit}>
              Change something
            </Button>
            <Button variant="ghost" fullWidth onClick={onAnotherDay}>
              Log another day
            </Button>
          </>
        )}
      </div>

      {!practised ? (
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/reminders" className="underline">
            Set up a daily reminder
          </Link>{' '}
          so you don’t have to remember.
        </p>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-neutral-50 py-2.5 dark:bg-neutral-800">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
        {value}
      </dd>
    </div>
  )
}
