import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Toggle } from '../ui/Toggle'
import { writeFactCriterion, type FactCriterion, type FactKey } from './facts'
import type { LibraryFilter, StatCriterion, StatSide } from './libraryFilter'
import {
  BRANCH_CRITERIA,
  BRANCHES,
  branchCounts,
  chipSummary,
  criterionFullLabel,
  criterionLabel,
  criterionSummaries,
  definitionOf,
  inapplicableReason,
  inBranchOrder,
  statSummary,
  type Branch,
  type CriterionDefinition,
  type Section,
} from './moreFilterBranches'
import { STAT_GROUPS, STAT_TILES } from './stats'
import './MoreFilters.css'

/** What Más filtros sets: the criteria on the Hero's facts, and the Stat criterion. */
export type MoreFiltersCriteria = Pick<LibraryFilter, 'facts' | 'stat'>

const NONE: MoreFiltersCriteria = { facts: [], stat: null }

/** How many characters of summary the chip shows before it counts the rest as "+N". */
const CHIP_BUDGET = 56

/**
 * The "Biblioteca · Más filtros" board: everything set in Más filtros as
 * one chip in the filters bar (or "Más filtros" while nothing is), and the
 * panel it opens, by branch. Every change applies at once; there is no
 * Apply. Escape, "Listo", the × or a click outside close it.
 */
export function MoreFilters({
  value,
  onChange,
  open,
  onOpenChange,
  count,
  savedName = null,
  onRemove = () => onChange(NONE),
  onSave,
}: {
  value: MoreFiltersCriteria
  onChange: (value: MoreFiltersCriteria) => void
  /** The name of the Saved Filter applied, while its criteria are unchanged: the chip shows it instead of their summary. */
  savedName?: string | null
  /** What the chip's × drops; by default every criterion. */
  onRemove?: () => void
  /** Without it the panel offers no "Guardar filtro…". */
  onSave?: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Hands the whole filter keeps, and those it would without Más filtros; null until read. */
  count: { hands: number | null; of: number | null }
}) {
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const close = () => {
    onOpenChange(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, onOpenChange])

  return (
    <span className="more-filters" ref={root}>
      <MoreFiltersChip
        value={value}
        savedName={savedName}
        trigger={trigger}
        open={open}
        onOpen={() => onOpenChange(!open)}
        onRemove={onRemove}
      />
      {open && (
        <MoreFiltersPanel
          value={value}
          onChange={onChange}
          count={count}
          onClose={close}
          onSave={
            onSave &&
            (() => {
              onOpenChange(false)
              onSave()
            })
          }
        />
      )}
    </span>
  )
}

function MoreFiltersChip({
  value,
  savedName,
  trigger,
  open,
  onOpen,
  onRemove,
}: {
  value: MoreFiltersCriteria
  savedName: string | null
  trigger: RefObject<HTMLButtonElement | null>
  open: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const [listing, setListing] = useState(false)
  const tooltipId = useId()
  // The Stat criterion is the Estadística branch's, the last.
  const summaries = [...criterionSummaries(value.facts, t), ...(value.stat ? [statSummary(value.stat, t)] : [])]

  if (summaries.length === 0 && savedName === null) {
    return (
      <button type="button" ref={trigger} className="more-filters__idle" aria-expanded={open} onClick={onOpen}>
        <Icon name="filter" size={14} />
        {t('library.moreFilters')}
      </button>
    )
  }

  const { text, more } = chipSummary(summaries, CHIP_BUDGET)
  // As the summaries are, line for line.
  const branches: Branch[] = [
    ...inBranchOrder(value.facts).map((criterion) => definitionOf(criterion.fact)!.branch),
    ...(value.stat ? (['stat'] as const) : []),
  ]
  return (
    <span className="more-filters__chip" onMouseEnter={() => setListing(true)} onMouseLeave={() => setListing(false)}>
      <button
        type="button"
        ref={trigger}
        className="more-filters__open"
        aria-label={
          savedName === null
            ? t('library.moreFilters.chip.open', { summary: summaries.join(' · ') })
            : t('library.moreFilters.chip.saved', { name: savedName })
        }
        aria-expanded={open}
        aria-describedby={listing ? tooltipId : undefined}
        onClick={onOpen}
        onFocus={() => setListing(true)}
        onBlur={() => setListing(false)}
      >
        <Icon name={savedName === null ? 'filter' : 'saved-filter'} size={14} />
        <span className="more-filters__summary">{savedName ?? text}</span>
        {savedName === null && more > 0 && <span className="more-filters__more">{t('library.moreFilters.chip.more', { count: more })}</span>}
      </button>
      <span className="more-filters__sep" aria-hidden="true" />
      <button type="button" className="more-filters__remove" aria-label={t('library.moreFilters.chip.remove')} onClick={onRemove}>
        <Icon name="close" size={12} />
      </button>
      {listing && !open && branches.length > 0 && (
        <ul className="more-filters__tip" role="tooltip" id={tooltipId}>
          {branches.map((branch, index) => (
            <li key={index}>
              <b>{t(`library.moreFilters.branch.${branch}`)}</b> {summaries[index]}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

function MoreFiltersPanel({
  value,
  onChange,
  count,
  onClose,
  onSave,
}: {
  value: MoreFiltersCriteria
  onChange: (value: MoreFiltersCriteria) => void
  count: { hands: number | null; of: number | null }
  onClose: () => void
  onSave?: () => void
}) {
  const { t, formatNumber } = useI18n()
  const id = useId()
  const criteria = value.facts
  const counts = { ...branchCounts(criteria), stat: value.stat ? 1 : 0 }
  const offered = BRANCHES.filter((branch) => branch === 'stat' || BRANCH_CRITERIA[branch].length > 0)
  const [branch, setBranch] = useState<Branch>(offered[0])
  const tabs = useRef<Partial<Record<Branch, HTMLButtonElement | null>>>({})

  // The panel opens with the focus on its branch, so the keyboard starts there; moving between branches moves it after.
  const firstBranch = useRef(branch)
  useEffect(() => {
    tabs.current[firstBranch.current]?.focus()
  }, [])

  const moveTo = (next: Branch) => {
    setBranch(next)
    tabs.current[next]?.focus()
  }
  const onRailKey = (event: KeyboardEvent) => {
    const at = offered.indexOf(branch)
    const next =
      event.key === 'ArrowDown'
        ? offered[(at + 1) % offered.length]
        : event.key === 'ArrowUp'
          ? offered[(at - 1 + offered.length) % offered.length]
          : event.key === 'Home'
            ? offered[0]
            : event.key === 'End'
              ? offered.at(-1)
              : undefined
    if (!next) return
    event.preventDefault()
    moveTo(next)
  }

  const put = (fact: FactKey, next: FactCriterion | null) => {
    const at = criteria.findIndex((criterion) => criterion.fact === fact)
    const facts =
      at === -1
        ? next
          ? [...criteria, next]
          : criteria
        : next
          ? criteria.map((criterion, index) => (index === at ? next : criterion))
          : criteria.filter((_, index) => index !== at)
    onChange({ ...value, facts })
  }

  const hands = count.hands === null ? null : formatNumber(count.hands)
  const sections = BRANCH_CRITERIA[branch].reduce<{ section: Section; definitions: CriterionDefinition[] }[]>((grouped, definition) => {
    const last = grouped.at(-1)
    if (last?.section === definition.section) last.definitions.push(definition)
    else grouped.push({ section: definition.section, definitions: [definition] })
    return grouped
  }, [])

  return (
    <div
      className="more-filters__panel"
      role="dialog"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="more-filters__head">
        <span className="more-filters__title" id={`${id}-title`}>
          {t('library.moreFilters')}
        </span>
        <span className="more-filters__dim">{t('library.moreFilters.adds')}</span>
        {hands !== null && (
          <span className="more-filters__count" aria-live="polite">
            {count.of === null
              ? t('library.moreFilters.count', { hands })
              : t('library.moreFilters.countOf', { hands, of: formatNumber(count.of) })}
          </span>
        )}
        <button type="button" className="more-filters__close" aria-label={t('library.moreFilters.close')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="more-filters__body">
        <div className="more-filters__rail" role="tablist" aria-orientation="vertical" aria-label={t('library.moreFilters.branches')} onKeyDown={onRailKey}>
          {BRANCHES.map((each) => {
            const name = t(`library.moreFilters.branch.${each}`)
            const n = counts[each]
            return (
              <button
                key={each}
                type="button"
                role="tab"
                id={`${id}-tab-${each}`}
                ref={(element) => {
                  tabs.current[each] = element
                }}
                className="more-filters__branch"
                aria-selected={each === branch}
                aria-controls={each === branch ? `${id}-branch` : undefined}
                aria-label={n > 0 ? `${name}, ${t(n === 1 ? 'library.moreFilters.criteria.one' : 'library.moreFilters.criteria.other', { count: n })}` : undefined}
                tabIndex={each === branch ? 0 : -1}
                // Its criteria are still to come.
                disabled={!offered.includes(each)}
                onClick={() => setBranch(each)}
              >
                {name}
                {n > 0 && (
                  <span className="more-filters__n" aria-hidden="true">
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="more-filters__main" role="tabpanel" id={`${id}-branch`} aria-labelledby={`${id}-tab-${branch}`}>
          {branch === 'stat' && <StatBranch stat={value.stat} onPut={(stat) => onChange({ ...value, stat })} />}
          {branch !== 'stat' && sections.length === 0 && <p className="more-filters__dim">{t('library.moreFilters.soon')}</p>}
          {sections.map(({ section, definitions }) => (
            <div className="more-filters__section" key={section} role="group" aria-labelledby={`${id}-section-${section}`}>
              <div className="more-filters__section-title ro-mono" id={`${id}-section-${section}`}>
                {t(`library.moreFilters.section.${section}`)}
              </div>
              {definitions.map((definition) => (
                <CriterionRow
                  key={definition.fact}
                  definition={definition}
                  criterion={criteria.find((criterion) => criterion.fact === definition.fact) ?? null}
                  criteria={criteria}
                  onPut={(next) => put(definition.fact, next)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="more-filters__foot">
        <Button variant="ghost" onClick={() => onChange(NONE)}>
          {t('library.moreFilters.removeAll')}
        </Button>
        <span className="more-filters__spacer" />
        {onSave && (
          <Button variant="secondary" onClick={onSave}>
            <Icon name="saved-filter" size={14} />
            {t('library.moreFilters.save')}
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          {t('library.moreFilters.done')}
        </Button>
      </div>
    </div>
  )
}

/** One criterion: its label, its control, and "Excluir"; the board's row, lit while it narrows. */
function CriterionRow({
  definition,
  criterion,
  criteria,
  onPut,
}: {
  definition: CriterionDefinition
  criterion: FactCriterion | null
  criteria: FactCriterion[]
  onPut: (criterion: FactCriterion | null) => void
}) {
  const { t } = useI18n()
  const labelId = useId()
  const label = criterionLabel(definition.fact, t)
  // Where the row's section isn't there to say it, as for the exclusion's switch, the label says its Street.
  const fullLabel = criterionFullLabel(definition.fact, t)
  const exclude = criterion?.exclude ?? false
  const reason = criterion && inapplicableReason(criterion, criteria)
  const { control } = definition

  return (
    <div className="more-filters__row" data-on={criterion ? '' : undefined} role="group" aria-labelledby={labelId}>
      <span className="more-filters__label" id={labelId}>
        {label}
      </span>
      <div className="more-filters__control">
        {control.kind === 'options' ? (
          control.values.map((value) => {
            const picked = criterion !== null && 'values' in criterion && criterion.values.includes(value)
            const values = criterion && 'values' in criterion ? criterion.values : []
            return (
              <button
                key={value}
                type="button"
                className="more-filters__option"
                aria-pressed={picked}
                onClick={() => {
                  // In the order the panel offers them, whatever order they were picked in.
                  const next = control.values.filter((each) => (each === value ? !picked : values.includes(each)))
                  onPut(next.length > 0 ? { fact: definition.fact, exclude, values: next } : null)
                }}
              >
                <span>{control.label(value, t)}</span>
              </button>
            )
          })
        ) : control.kind === 'boolean' ? (
          (['true', 'false'] as const).map((value) => {
            const picked = criterion !== null && 'values' in criterion && criterion.values.length === 1 && criterion.values[0] === value
            return (
              <button
                key={value}
                type="button"
                className="more-filters__option"
                aria-pressed={picked}
                onClick={() => onPut(picked ? null : { fact: definition.fact, exclude, values: [value] })}
              >
                <span>{t(value === 'true' ? 'library.moreFilters.value.yes' : 'library.moreFilters.value.no')}</span>
              </button>
            )
          })
        ) : (
          <RangeControl
            label={fullLabel}
            min={control.min}
            max={control.max}
            signed={control.signed ?? false}
            criterion={criterion}
            onPut={(range) => onPut(range && { fact: definition.fact, exclude, range })}
          />
        )}
      </div>
      <span className="more-filters__exclude" data-on={exclude ? '' : undefined}>
        <span aria-hidden="true">{t('library.moreFilters.exclude')}</span>
        <Toggle
          label={t('library.moreFilters.exclude.label', { criterion: fullLabel })}
          checked={exclude}
          disabledReason={criterion ? undefined : t('library.moreFilters.exclude.locked')}
          onChange={(checked) => criterion && onPut({ ...criterion, exclude: checked })}
        />
      </span>
      {reason && <p className="more-filters__note">{t(reason)}</p>}
    </div>
  )
}

type Range = { min: number | null; max: number | null }

/**
 * A from and a to, both included. What is typed is kept as typed, and
 * narrows the Hands once it is a range the fact can take; both left empty,
 * it narrows nothing.
 */
function RangeControl({
  label,
  min,
  max,
  signed,
  criterion,
  onPut,
}: {
  label: string
  min: number
  max: number
  /** Its ends may be negative or have decimals, as an amount in big blinds. */
  signed: boolean
  criterion: FactCriterion | null
  onPut: (range: Range | null) => void
}) {
  const { t } = useI18n()
  const range = criterion && 'range' in criterion ? criterion.range : null
  const written = criterion ? writeFactCriterion(criterion) : ''
  const [draft, setDraft] = useState({ from: String(range?.min ?? ''), to: String(range?.max ?? '') })
  // A change from elsewhere (the chip's ×, "Quitar todo", the address) shows in the fields.
  const [seen, setSeen] = useState(written)
  if (seen !== written) {
    setSeen(written)
    const parsed = parse(draft)
    if (!parsed.valid || parsed.range?.min !== (range?.min ?? null) || parsed.range?.max !== (range?.max ?? null)) {
      setDraft({ from: String(range?.min ?? ''), to: String(range?.max ?? '') })
    }
  }

  function parse(fields: { from: string; to: string }): { valid: boolean; range: Range | null } {
    const end = (text: string) => (text.trim() === '' ? null : Number(text))
    const ends = { min: end(fields.from), max: end(fields.to) }
    const inside = (value: number | null) =>
      value === null || ((signed ? Number.isFinite(value) : Number.isInteger(value)) && value >= min && value <= max)
    if (!inside(ends.min) || !inside(ends.max)) return { valid: false, range: null }
    if (ends.min !== null && ends.max !== null && ends.min > ends.max) return { valid: false, range: null }
    return { valid: true, range: ends.min === null && ends.max === null ? null : ends }
  }

  const change = (fields: { from: string; to: string }) => {
    setDraft(fields)
    const parsed = parse(fields)
    if (parsed.valid) onPut(parsed.range)
  }
  const invalid = !parse(draft).valid

  return (
    <>
      <input
        type="number"
        className="more-filters__number"
        inputMode={signed ? 'decimal' : 'numeric'}
        step={signed ? 'any' : undefined}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        placeholder={t('library.moreFilters.range.from')}
        aria-label={t('library.moreFilters.range.fromLabel', { criterion: label })}
        aria-invalid={invalid || undefined}
        value={draft.from}
        onChange={(event) => change({ ...draft, from: event.target.value })}
      />
      <span className="more-filters__dim" aria-hidden="true">
        –
      </span>
      <input
        type="number"
        className="more-filters__number"
        inputMode={signed ? 'decimal' : 'numeric'}
        step={signed ? 'any' : undefined}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        placeholder={t('library.moreFilters.range.to')}
        aria-label={t('library.moreFilters.range.toLabel', { criterion: label })}
        aria-invalid={invalid || undefined}
        value={draft.to}
        onChange={(event) => change({ ...draft, to: event.target.value })}
      />
    </>
  )
}

const STAT_SIDES: StatSide[] = ['taken', 'opportunity']

/**
 * The Estadística branch: every Stat by its group, as the Stats view shows
 * them, each with "La hice" and "Tuve la oportunidad", the two links of its
 * tooltip. One is picked at most; picking another replaces it.
 */
function StatBranch({ stat, onPut }: { stat: StatCriterion | null; onPut: (stat: StatCriterion | null) => void }) {
  const { t } = useI18n()
  const id = useId()
  return (
    <>
      <p className="more-filters__dim">{t('library.moreFilters.stat.one')}</p>
      {STAT_GROUPS.map((group) => (
        <div className="more-filters__section" key={group} role="group" aria-labelledby={`${id}-section-${group}`}>
          <div className="more-filters__section-title ro-mono" id={`${id}-section-${group}`}>
            {t(`library.stats.group.${group}`)}
          </div>
          {STAT_TILES.filter((tile) => tile.group === group).map((tile) => (
            <div
              key={tile.key}
              className="more-filters__row"
              data-on={stat?.key === tile.key ? '' : undefined}
              role="group"
              aria-labelledby={`${id}-stat-${tile.key}`}
            >
              <span className="more-filters__label" id={`${id}-stat-${tile.key}`} title={t(tile.name)}>
                {tile.abbreviation}
              </span>
              <div className="more-filters__control">
                {STAT_SIDES.map((side) => {
                  const picked = stat?.key === tile.key && stat.side === side
                  return (
                    <button
                      key={side}
                      type="button"
                      className="more-filters__option"
                      aria-pressed={picked}
                      onClick={() => onPut(picked ? null : { key: tile.key, side })}
                    >
                      <span>{t(`library.moreFilters.stat.${side}`)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
