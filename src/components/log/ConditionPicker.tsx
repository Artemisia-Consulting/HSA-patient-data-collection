'use client'

/**
 * Category → condition selection (FR4, user story 2.4, rubric item 5).
 *
 * The design decision that buys the 30 seconds: **the list is useful before
 * you type.** Picking a category immediately shows its conditions in `rank`
 * order, so "Anxiety" or "Acute respiratory infection" is one tap, not a tap
 * plus six characters plus a tap. The search box is there for the long tail —
 * a 12-row category where the thing you want is at the bottom — and it matches
 * synonyms, so "TB", "flu", "UTI" and "hot flushes" all land correctly.
 *
 * The search box is deliberately NOT autofocused. Autofocus raises the Android
 * keyboard over the very list the practitioner is about to tap, which costs
 * more time than it saves for the common case.
 *
 * "Other (specify)" is always last and always present, so free text is
 * reachable but never in the way (the brief is explicit that entry must be
 * tick-and-select, with free text as the fallback only).
 *
 * One of these is rendered per patient, so every id it generates has to be
 * unique per instance — hence `useId` rather than the fixed ids an earlier
 * single-picker version could get away with.
 *
 * OWNER: Stream 2.
 */
import { useId, useMemo, useState } from 'react'

import { searchConditions } from '@/lib/client'
import type { TaxonomyResponse } from '@/lib/contract/api'
import type { ConditionCategory } from '@/lib/contract/enums'

type TaxonomyCategory = TaxonomyResponse['categories'][number]

interface ConditionPickerProps {
  categories: TaxonomyCategory[]
  /** Condition codes currently selected, across all categories. */
  selectedCodes: Set<string>
  onToggle: (category: ConditionCategory, code: string) => void
  title?: string
  hint?: string
  /**
   * Drops the card chrome, for when the picker is already inside one — a
   * patient card, in practice. Nesting two identical rounded panels reads as a
   * rendering bug rather than as structure.
   */
  frameless?: boolean
}

export function ConditionPicker({
  categories,
  selectedCodes,
  onToggle,
  title = 'Conditions treated',
  hint = 'Optional. Tap a category, then tap every condition you treated today.',
  frameless = false,
}: ConditionPickerProps) {
  const [activeCategory, setActiveCategory] = useState<ConditionCategory | null>(null)
  const [query, setQuery] = useState('')
  const headingId = useId()
  const searchId = useId()

  const active = categories.find((category) => category.code === activeCategory) ?? null

  const results = useMemo(
    () => (active ? searchConditions(active.conditions, query) : []),
    [active, query],
  )

  const countIn = (category: TaxonomyCategory) =>
    category.conditions.filter((condition) => selectedCodes.has(condition.code)).length

  return (
    <section
      aria-labelledby={headingId}
      className={
        frameless
          ? ''
          : 'rounded-2xl bg-white p-3 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800'
      }
    >
      <h3
        id={headingId}
        className={
          frameless
            ? 'text-sm font-semibold text-neutral-700 dark:text-neutral-200'
            : 'text-base font-semibold text-neutral-900 dark:text-neutral-100'
        }
      >
        {title}
      </h3>
      {hint ? (
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      ) : null}

      <div role="group" aria-label="Condition category" className="mt-2.5 flex flex-wrap gap-2">
        {categories.map((category) => {
          const selected = category.code === activeCategory
          const count = countIn(category)
          return (
            <button
              key={category.code}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setActiveCategory(selected ? null : category.code)
                setQuery('')
              }}
              className={[
                'flex min-h-[48px] items-center gap-1.5 rounded-xl px-3 text-left text-sm font-semibold transition-colors',
                selected
                  ? 'bg-hsa-600 text-white'
                  : 'bg-neutral-100 text-neutral-800 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-700',
              ].join(' ')}
            >
              <span>{category.label}</span>
              {count > 0 ? (
                <span
                  aria-label={`${count} selected`}
                  className={[
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums',
                    selected ? 'bg-white text-hsa-700' : 'bg-hsa-600 text-white',
                  ].join(' ')}
                >
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {active ? (
        <div className="mt-3">
          <label htmlFor={searchId} className="sr-only">
            Search conditions in {active.label}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${active.label}…`}
            autoComplete="off"
            className="min-h-[48px] w-full rounded-xl bg-neutral-50 px-3 text-base text-neutral-900 ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-hsa-600 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-700"
          />

          <ul
            className="mt-2 max-h-80 overflow-y-auto overscroll-contain rounded-xl ring-1 ring-neutral-200 dark:ring-neutral-800"
            aria-label={`Conditions in ${active.label}`}
          >
            {results.map((condition) => {
              const selected = selectedCodes.has(condition.code)
              return (
                <li key={condition.code}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onToggle(active.code, condition.code)}
                    className={[
                      'flex min-h-[52px] w-full items-center gap-3 border-b border-neutral-100 px-3 text-left text-[15px] last:border-b-0 dark:border-neutral-800',
                      selected
                        ? 'bg-hsa-50 font-semibold text-hsa-700 dark:bg-hsa-700/20 dark:text-hsa-100'
                        : 'bg-white text-neutral-800 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold',
                        selected
                          ? 'bg-hsa-600 text-white'
                          : 'ring-1 ring-inset ring-neutral-300 dark:ring-neutral-600',
                      ].join(' ')}
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span className="flex-1">{condition.label}</span>
                  </button>
                </li>
              )
            })}
            {results.length === 0 ? (
              <li className="px-3 py-4 text-sm text-neutral-500 dark:text-neutral-400">
                Nothing matches “{query}”.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
