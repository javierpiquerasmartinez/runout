import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Toggle } from '../ui/Toggle'
import { writeFactCriterion, type FactCriterion, type FactKey } from './facts'
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
  type Branch,
  type CriterionDefinition,
  type Section,
} from './moreFilterBranches'
import { useBuildsFilters } from './buildsFilters'
import './MoreFilters.css'

/** How many characters of summary the chip shows before it counts the rest as "+N". */
const CHIP_BUDGET = 56

/**
 * The "Biblioteca · Más filtros" board: everything set in Más filtros as
 * one chip in the filters bar (or "Más filtros" while nothing is), and the
 * panel it opens, by branch. Every change applies at once; there is no
 * Apply. Escape, "Listo", the × or a click outside close it.
 */
export function MoreFilters({
  criteria,
  onChange,
  open,
  onOpenChange,
  count,
  saved = null,
  onRemove = () => onChange([]),
  onSave,
}: {
  criteria: FactCriterion[]
  onChange: (criteria: FactCriterion[]) => void
  /** The Saved Filter applied: the chip shows its name instead of the criteria's summary, and, once modified, a menu. */
  saved?: AppliedSavedFilter | null
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
  const [menuOpen, setMenuOpen] = useState(false)
  const builds = useBuildsFilters()
  // The menu is only for a modified Saved Filter, and not on a phone; changed back, or saved, it goes.
  const showMenu = builds && menuOpen && saved?.modified === true

  const close = () => {
    onOpenChange(false)
    trigger.current?.focus()
  }
  const closeMenu = () => {
    setMenuOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open && !showMenu) return
    const closeOutside = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return
      onOpenChange(false)
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, showMenu, onOpenChange])

  // A phone has no modified state: a changed Saved Filter shows as its criteria.
  if (!builds) return <AppliedChip criteria={criteria} savedName={saved && !saved.modified ? saved.name : null} onRemove={onRemove} />

  return (
    <span className="more-filters" ref={root}>
      <MoreFiltersChip
        criteria={criteria}
        saved={saved}
        trigger={trigger}
        open={open}
        menuOpen={showMenu}
        onOpen={() => {
          if (saved?.modified) {
            setMenuOpen(!showMenu)
            return
          }
          onOpenChange(!open)
        }}
        onRemove={onRemove}
      >
        {showMenu && saved && (
          <SavedFilterMenu
            saved={saved}
            onClose={closeMenu}
            onEdit={() => {
              setMenuOpen(false)
              onOpenChange(true)
            }}
            onPick={(action) => {
              closeMenu()
              action()
            }}
          />
        )}
      </MoreFiltersChip>
      {open && (
        <MoreFiltersPanel
          criteria={criteria}
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

/** The Saved Filter applied, as the Más filtros chip shows it, and what its menu does once it is modified. */
export interface AppliedSavedFilter {
  name: string
  modified: boolean
  /** Its criteria as saved, written as the address writes them, so the chip's list can tell which are new. */
  criteria: string[]
  onSaveChanges: () => void
  onSaveAsNew: () => void
  onDiscard: () => void
}

function MoreFiltersChip({
  criteria,
  saved,
  trigger,
  open,
  menuOpen,
  onOpen,
  onRemove,
  children,
}: {
  criteria: FactCriterion[]
  saved: AppliedSavedFilter | null
  trigger: RefObject<HTMLButtonElement | null>
  open: boolean
  menuOpen: boolean
  onOpen: () => void
  onRemove: () => void
  /** The modified Saved Filter's menu, placed under the chip. */
  children?: ReactNode
}) {
  const { t } = useI18n()
  const [listing, setListing] = useState(false)
  const tooltipId = useId()
  const summaries = criterionSummaries(criteria, t)

  const savedName = saved?.name ?? null
  if (summaries.length === 0 && savedName === null) {
    return (
      <button type="button" ref={trigger} className="more-filters__idle" aria-expanded={open} onClick={onOpen}>
        <Icon name="filter" size={14} />
        {t('library.moreFilters')}
      </button>
    )
  }

  const { text, more } = chipSummary(summaries, CHIP_BUDGET)
  const branchOf = (criterion: FactCriterion) => definitionOf(criterion.fact)!.branch
  // As the summaries are, line for line.
  const ordered = inBranchOrder(criteria)
  return (
    <span className="more-filters__chip" onMouseEnter={() => setListing(true)} onMouseLeave={() => setListing(false)}>
      <button
        type="button"
        ref={trigger}
        className="more-filters__open"
        aria-label={
          saved === null
            ? t('library.moreFilters.chip.open', { summary: summaries.join(' · ') })
            : t(saved.modified ? 'library.moreFilters.chip.savedModified' : 'library.moreFilters.chip.saved', { name: saved.name })
        }
        aria-haspopup={saved?.modified ? 'menu' : undefined}
        aria-expanded={saved?.modified ? menuOpen : open}
        aria-describedby={listing ? tooltipId : undefined}
        onClick={onOpen}
        onFocus={() => setListing(true)}
        onBlur={() => setListing(false)}
      >
        <Icon name={savedName === null ? 'filter' : 'saved-filter'} size={14} />
        <span className="more-filters__summary">{savedName ?? text}</span>
        {saved?.modified && <span className="more-filters__modified">{t('library.moreFilters.chip.modified')}</span>}
        {saved === null && more > 0 && <span className="more-filters__more">{t('library.moreFilters.chip.more', { count: more })}</span>}
      </button>
      <span className="more-filters__sep" aria-hidden="true" />
      <button type="button" className="more-filters__remove" aria-label={t('library.moreFilters.chip.remove')} onClick={onRemove}>
        <Icon name="close" size={12} />
      </button>
      {listing && !open && !menuOpen && ordered.length > 0 && (
        <ul className="more-filters__tip" role="tooltip" id={tooltipId}>
          {ordered.map((criterion, index) => {
            const unsaved = saved?.modified ? unsavedChange(criterion, saved.criteria) : null
            return (
              <li key={criterion.fact} className={unsaved ? 'more-filters__tip-unsaved' : undefined}>
                <b>{t(`library.moreFilters.branch.${branchOf(criterion)}`)}</b> {summaries[index]}
                {unsaved && ` ${t(`library.moreFilters.chip.${unsaved}`)}`}
              </li>
            )
          })}
        </ul>
      )}
      {children}
    </span>
  )
}

/** Whether the criterion is one the Saved Filter doesn't hold: on a fact it has no criterion on, or with other values. */
function unsavedChange(criterion: FactCriterion, saved: string[]): 'added' | 'changed' | null {
  if (saved.includes(writeFactCriterion(criterion))) return null
  const fact = (text: string) => text.replace(/^!/, '').split(':')[0]
  return saved.some((text) => fact(text) === criterion.fact) ? 'changed' : 'added'
}

/**
 * The "Biblioteca · Filtro guardado modificado" board's menu, under the
 * chip of a modified Saved Filter: back to Más filtros, or keep the changes
 * (over it, or as a new one), or drop them. It opens on its first item;
 * the arrows move through them and Escape closes it.
 */
function SavedFilterMenu({
  saved,
  onClose,
  onEdit,
  onPick,
}: {
  saved: AppliedSavedFilter
  onClose: () => void
  onEdit: () => void
  onPick: (action: () => void) => void
}) {
  const { t } = useI18n()
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const [focused, setFocused] = useState(0)
  useEffect(() => {
    items.current[focused]?.focus()
  }, [focused])

  const entries: { label: string; hint?: string; act: () => void; ruled?: boolean }[] = [
    { label: t('library.savedFilter.edit'), hint: t('library.savedFilter.edit.hint'), act: onEdit },
    {
      label: t('library.savedFilter.saveChanges'),
      hint: t('library.savedFilter.saveChanges.hint', { name: saved.name }),
      act: () => onPick(saved.onSaveChanges),
      ruled: true,
    },
    { label: t('library.savedFilter.saveAsNew'), act: () => onPick(saved.onSaveAsNew) },
    { label: t('library.savedFilter.discard'), hint: t('library.savedFilter.discard.hint'), act: () => onPick(saved.onDiscard) },
  ]
  const onKeyDown = (event: KeyboardEvent) => {
    const last = entries.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(focused + 1, last),
      ArrowUp: Math.max(focused - 1, 0),
      Home: 0,
      End: last,
    }
    if (event.key in moves) {
      event.preventDefault()
      setFocused(moves[event.key])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  return (
    <div role="menu" aria-label={t('library.savedFilter.menu', { name: saved.name })} className="more-filters__menu" onKeyDown={onKeyDown}>
      {entries.map((entry, index) => (
        <Fragment key={entry.label}>
          {entry.ruled && <span className="more-filters__menu-rule" aria-hidden="true" />}
          <button
            type="button"
            role="menuitem"
            ref={(element) => {
              items.current[index] = element
            }}
            className="more-filters__menu-item"
            tabIndex={index === focused ? 0 : -1}
            onClick={entry.act}
          >
            {entry.label}
            {entry.hint && <small>{entry.hint}</small>}
          </button>
        </Fragment>
      ))}
    </div>
  )
}

/** The chip at phone width: what is applied and a × to drop it, nothing to open; nothing while there is nothing applied. */
function AppliedChip({ criteria, savedName, onRemove }: { criteria: FactCriterion[]; savedName: string | null; onRemove: () => void }) {
  const { t } = useI18n()
  const summaries = criterionSummaries(criteria, t)
  if (summaries.length === 0 && savedName === null) return null
  const { text, more } = chipSummary(summaries, CHIP_BUDGET)
  return (
    <span className="more-filters">
      <span className="more-filters__chip">
        <span className="more-filters__applied">
          <Icon name={savedName === null ? 'filter' : 'saved-filter'} size={14} />
          <span className="more-filters__summary">{savedName ?? text}</span>
          {savedName === null && more > 0 && <span className="more-filters__more">{t('library.moreFilters.chip.more', { count: more })}</span>}
        </span>
        <span className="more-filters__sep" aria-hidden="true" />
        <button type="button" className="more-filters__remove" aria-label={t('library.moreFilters.chip.remove')} onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
      </span>
    </span>
  )
}

function MoreFiltersPanel({
  criteria,
  onChange,
  count,
  onClose,
  onSave,
}: {
  criteria: FactCriterion[]
  onChange: (criteria: FactCriterion[]) => void
  count: { hands: number | null; of: number | null }
  onClose: () => void
  onSave?: () => void
}) {
  const { t, formatNumber } = useI18n()
  const id = useId()
  const counts = branchCounts(criteria)
  const offered = BRANCHES.filter((branch) => BRANCH_CRITERIA[branch].length > 0)
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
    if (at === -1) onChange(next ? [...criteria, next] : criteria)
    else onChange(next ? criteria.map((criterion, index) => (index === at ? next : criterion)) : criteria.filter((_, index) => index !== at))
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
          {sections.length === 0 && <p className="more-filters__dim">{t('library.moreFilters.soon')}</p>}
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
        <Button variant="ghost" onClick={() => onChange([])}>
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
  criterion,
  onPut,
}: {
  label: string
  min: number
  max: number
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
    const inside = (value: number | null) => value === null || (Number.isInteger(value) && value >= min && value <= max)
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
        inputMode="numeric"
        min={min}
        max={max}
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
        inputMode="numeric"
        min={min}
        max={max}
        placeholder={t('library.moreFilters.range.to')}
        aria-label={t('library.moreFilters.range.toLabel', { criterion: label })}
        aria-invalid={invalid || undefined}
        value={draft.to}
        onChange={(event) => change({ ...draft, to: event.target.value })}
      />
    </>
  )
}
