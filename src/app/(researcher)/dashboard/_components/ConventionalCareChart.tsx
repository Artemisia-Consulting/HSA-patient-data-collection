'use client'

/**
 * "Conventional medical care" — the two FR6 questions, one bar each.
 *
 * This replaces a grouped bar chart whose x-axis was the *answer* (Yes / No /
 * Unsure-or-N/A) and whose bar colours were the *question*. It read the wrong
 * way round: the thing a researcher wants is "what share said yes to each
 * question", and that chart made them compare two bars of different colours
 * across three groups to work it out.
 *
 * Each question is now a single 100% bar split by answer, with the share
 * printed on it and the counts beside it, and the headline sentence says the
 * takeaway in words. Plain HTML rather than recharts: two rows of proportions
 * need no axes, and HTML keeps the labels selectable and readable by a screen
 * reader.
 *
 * Colours: Yes and No are a validated teal/orange pair (distinct under every
 * common colour-vision deficiency, ≥3:1 on both backgrounds); Unsure and N/A
 * are neutral grey because they are a non-answer, not a third category.
 * Identity never rests on colour alone — every segment wide enough is labelled
 * and the legend repeats the counts.
 *
 * OWNER: Stream 2.
 */
import type { DashboardSummary } from '@/lib/contract/api'
import {
  ALSO_SEEING_GP_QUESTION,
  GP_CO_MANAGEMENT_LABELS,
  REFERRED_BY_GP_LABELS,
  REFERRED_BY_GP_QUESTION,
} from '@/lib/contract/enums'
import { NUMBER } from './format'

const YES = 'bg-[#0d9488] dark:bg-[#199e70]'
const NO = 'bg-[#eb6834] dark:bg-[#d95926]'
const NEITHER = 'bg-neutral-300 dark:bg-neutral-600'

interface Segment {
  label: string
  count: number
  tone: string
  /**
   * Text colour for the label printed on the segment. Near-black on the teal
   * and orange: white on either falls short of 4.5:1 at this size.
   */
  ink: string
}

function share(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0
}

function QuestionBar({ question, segments }: { question: string; segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0)

  return (
    <div>
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{question}</p>
      <div
        role="img"
        aria-label={`${question} ${segments
          .map((s) => `${s.label}: ${NUMBER.format(s.count)} (${share(s.count, total)}%)`)
          .join(', ')}`}
        className="mt-2 flex h-9 w-full gap-0.5 overflow-hidden rounded-md"
      >
        {segments
          .filter((s) => s.count > 0)
          .map((s) => {
            const pct = share(s.count, total)
            return (
              <div
                key={s.label}
                title={`${s.label}: ${NUMBER.format(s.count)} (${pct}%)`}
                className={`flex min-w-[3px] items-center justify-center text-xs font-semibold ${s.tone} ${s.ink}`}
                style={{ width: `${(s.count / total) * 100}%` }}
              >
                {/* Below ~12% the label no longer fits; the legend carries it. */}
                {pct >= 12 ? `${s.label} ${pct}%` : null}
              </div>
            )
          })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${s.tone}`} />
            <span>
              {s.label}{' '}
              <span className="tabular-nums text-neutral-900 dark:text-neutral-100">
                {NUMBER.format(s.count)}
              </span>{' '}
              ({share(s.count, total)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ConventionalCareChart({ summary }: { summary: DashboardSummary }) {
  const c = summary.coManagement
  const total = summary.totals.conditionEntries

  const seeing: Segment[] = [
    { label: GP_CO_MANAGEMENT_LABELS.YES, count: c.alsoSeeingGpYes, tone: YES, ink: 'text-neutral-950' },
    { label: GP_CO_MANAGEMENT_LABELS.NO, count: c.alsoSeeingGpNo, tone: NO, ink: 'text-neutral-950' },
    {
      label: GP_CO_MANAGEMENT_LABELS.UNSURE,
      count: c.alsoSeeingGpUnsure,
      tone: NEITHER,
      ink: 'text-neutral-950 dark:text-neutral-50',
    },
  ]
  const referred: Segment[] = [
    { label: REFERRED_BY_GP_LABELS.YES, count: c.referredByGpYes, tone: YES, ink: 'text-neutral-950' },
    { label: REFERRED_BY_GP_LABELS.NO, count: c.referredByGpNo, tone: NO, ink: 'text-neutral-950' },
    {
      label: REFERRED_BY_GP_LABELS.NOT_APPLICABLE,
      count: c.referredByGpNotApplicable,
      tone: NEITHER,
      ink: 'text-neutral-950 dark:text-neutral-50',
    },
  ]

  return (
    <div className="flex h-full flex-col justify-center gap-6">
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        For{' '}
        <strong className="text-neutral-900 dark:text-neutral-50">
          {share(c.alsoSeeingGpYes, total)}%
        </strong>{' '}
        of conditions the patient was also seeing a conventional practitioner, and{' '}
        <strong className="text-neutral-900 dark:text-neutral-50">
          {share(c.referredByGpYes, total)}%
        </strong>{' '}
        were referred by one.
      </p>
      <QuestionBar question={ALSO_SEEING_GP_QUESTION} segments={seeing} />
      <QuestionBar question={REFERRED_BY_GP_QUESTION} segments={referred} />
    </div>
  )
}
