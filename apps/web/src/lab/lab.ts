import type { FailureReason } from '../backend/api'
import type { I18n } from '../i18n/context'
import { CATEGORIES, FLOP_CARDS, formatBoard, readBoardCards, readDeadCards, streetsBefore, type Narrowing, type Selection } from './board'
import { EMPTY_RANGE, formatRange, parseRange, type Range } from './range'

/** The Lab ("Laboratorio"): an Account's study tools. It opens on the Analysis. */
export const labPath = '/lab'

/** The Lab's Analysis: a Range studied without touching the saved one. */
export const labAnalysisPath = '/lab/analysis'

/** How long a Range's name may be, as the server allows it. */
export const MAX_RANGE_NAME_LENGTH = 60

/** Why saving a Range under `name` failed, in the words both Lab screens use. */
export function rangeSaveFailure(t: I18n['t'], reason: FailureReason, name: string): string {
  if (reason === 'range-name-taken') return t('lab.ranges.nameTaken', { name })
  if (reason === 'invalid-range-name') return t('reason.invalid-range-name')
  return t('lab.ranges.saveFailed')
}

/** The Lab's Ranges: the matrix, its stats and the Account's saved Ranges. */
export const labRangesPath = '/lab/ranges'

/** Whether this path is the Lab's or one of its tools'. */
export function isLabPath(path: string): boolean {
  return path === labPath || path.startsWith(`${labPath}/`)
}

/** A saved Range's own address, which survives a reload and going back. */
export function labRangePath(id: string): string {
  return `${labRangesPath}/${encodeURIComponent(id)}`
}

/** The Range this path opens, or null when it opens none. */
export function labRangeIdFromPath(path: string): string | null {
  const match = /^\/lab\/ranges\/([^/]+)$/.exec(path)
  return match ? decodeURIComponent(match[1]) : null
}

/** One side of the Analysis: its Range, the saved Range it came from, if any, and its Narrowings. */
export interface AnalysisSide {
  range: Range
  /** The saved Range it was loaded from, for its name and the changed mark. */
  sourceId: string | null
  /**
   * One Narrowing per Street before the Board's own, the flop's first; a
   * Street past the end of them, or with no Categories, is not narrowed.
   */
  narrowings: readonly Narrowing[]
}

/** An Analysis studies one Range, or two against each other. */
export const MAX_ANALYSIS_SIDES = 2

/** What the Analysis's address holds: its one or two sides, its Board and its Dead Cards. */
export interface AnalysisState {
  /** One side, or two. */
  sides: readonly AnalysisSide[]
  /** The Board's cards in the order picked: a Board, or a flop still being filled. */
  board: readonly string[]
  /** Up to two cards out of the deck, none on the Board; none with two sides. */
  dead: readonly string[]
}

/** The Analysis with one empty side, as it opens. */
export const EMPTY_SIDE: AnalysisSide = { range: EMPTY_RANGE, sourceId: null, narrowings: [] }

/** The address's names for each side's Range, source and Narrowings: the second side's carry a 2. */
const sideKeys = (index: number) => {
  const suffix = index === 0 ? '' : String(index + 1)
  return { range: `range${suffix}`, source: `source${suffix}`, narrowing: `narrowing${suffix}` }
}

/** What separates Streets in the address's Narrowings, and Categories within a Street, as `set.overpair_top-pair`. */
const STREET_MARK = '_'
const CATEGORY_MARK = '.'

/** A side's Narrowings as the address writes them, each Street's Categories in the tables' order; empty when no Street is narrowed. */
function formatNarrowings(narrowings: readonly Narrowing[]): string {
  const streets = narrowings.map((kept) => CATEGORIES.filter((id) => kept.includes(id)).join(CATEGORY_MARK))
  while (streets.length > 0 && streets[streets.length - 1] === '') streets.pop()
  return streets.join(STREET_MARK)
}

/** The Narrowings an address writes for a side on this Board, leaving out the Category ids it cannot read. */
function readNarrowings(text: string, board: readonly string[]): Narrowing[] {
  if (text === '') return []
  return text
    .split(STREET_MARK)
    .slice(0, streetsBefore(board.length))
    .map((street) => CATEGORIES.filter((id) => street.split(CATEGORY_MARK).includes(id)))
}

/**
 * The Analysis's address for this state. Each side's Range is text in the Lab's
 * notation, so edits survive a reload; a second side is written even when empty.
 */
export function labAnalysisAddress({ sides, board, dead }: AnalysisState): string {
  const query = new URLSearchParams()
  sides.forEach(({ range, sourceId, narrowings }, index) => {
    const keys = sideKeys(index)
    const text = formatRange(range)
    if (text !== '' || index > 0) query.set(keys.range, text)
    if (sourceId !== null) query.set(keys.source, sourceId)
    const narrowed = formatNarrowings(narrowings)
    if (narrowed !== '') query.set(keys.narrowing, narrowed)
  })
  if (board.length > 0) query.set('board', formatBoard(board))
  if (dead.length > 0) query.set('dead', formatBoard(dead))
  const written = query.toString()
  return written ? `${labAnalysisPath}?${written}` : labAnalysisPath
}

/**
 * The state an Analysis address holds; a Range, Board or Dead Cards it cannot
 * read are empty ones, and a Category id it cannot read is left out of its
 * Narrowing. With two sides, Dead Cards are dropped.
 */
export function analysisStateFromSearch(search: string): AnalysisState {
  const query = new URLSearchParams(search)
  const board = readBoardCards(query.get('board') ?? '')
  const sides = Array.from({ length: MAX_ANALYSIS_SIDES }, (_, index) => sideKeys(index))
    .filter((keys, index) => index === 0 || query.has(keys.range))
    .map((keys) => {
      const parsed = parseRange(query.get(keys.range) ?? '')
      return {
        range: 'range' in parsed ? parsed.range : EMPTY_RANGE,
        sourceId: query.get(keys.source),
        narrowings: readNarrowings(query.get(keys.narrowing) ?? '', board),
      }
    })
  return { sides, board, dead: sides.length > 1 ? [] : readDeadCards(query.get('dead') ?? '', board) }
}

/** The Analysis on another Board, and the Selection each side goes back to, if any. */
export interface MovedAlongBoard {
  state: AnalysisState
  /** Each side's Categories selected on the new Street: the Narrowing a card taken off brings back. Null drops the Selection. */
  selections: Selection[] | null
}

/**
 * The Analysis moved to another Board, carrying each side's Narrowings along
 * it. Dealing on, from a flop, turns each side's Selection into the Narrowing
 * of the Street it was made on. Taking cards off brings the Narrowing of the
 * Street gone back to as its Selection. Any other change keeps only the
 * Narrowings made on cards still on the Board, in the same place.
 */
export function moveAlongBoard(state: AnalysisState, board: readonly string[], selections: readonly Selection[]): MovedAlongBoard {
  const before = state.board
  let same = 0
  while (same < before.length && same < board.length && before[same] === board[same]) same++
  if (same === before.length && same === board.length) return { state, selections: [...selections] }

  const dealt = same === before.length && before.length >= FLOP_CARDS
  const takenOff = same === board.length && board.length >= FLOP_CARDS
  const sides = state.sides.map((side, index) => {
    if (dealt) {
      const kept = Array.from({ length: streetsBefore(before.length) }, (_, street) => side.narrowings[street] ?? [])
      return { ...side, narrowings: [...kept, selections[index] ?? []] }
    }
    return { ...side, narrowings: side.narrowings.slice(0, Math.min(streetsBefore(same + 1), streetsBefore(board.length))) }
  })
  return {
    state: { ...state, sides, board },
    selections: takenOff ? state.sides.map((side) => [...(side.narrowings[streetsBefore(board.length)] ?? [])]) : null,
  }
}
