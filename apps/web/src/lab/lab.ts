import type { FailureReason } from '../backend/api'
import type { I18n } from '../i18n/context'
import { formatBoard, readBoardCards, readDeadCards } from './board'
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

/** One side of the Analysis: its Range, and the saved Range it came from, if any. */
export interface AnalysisSide {
  range: Range
  /** The saved Range it was loaded from, for its name and the changed mark. */
  sourceId: string | null
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
export const EMPTY_SIDE: AnalysisSide = { range: EMPTY_RANGE, sourceId: null }

/** The address's names for each side's Range and source: the second side's carry a 2. */
const sideKeys = (index: number) => (index === 0 ? { range: 'range', source: 'source' } : { range: `range${index + 1}`, source: `source${index + 1}` })

/**
 * The Analysis's address for this state. Each side's Range is text in the Lab's
 * notation, so edits survive a reload; a second side is written even when empty.
 */
export function labAnalysisAddress({ sides, board, dead }: AnalysisState): string {
  const query = new URLSearchParams()
  sides.forEach(({ range, sourceId }, index) => {
    const keys = sideKeys(index)
    const text = formatRange(range)
    if (text !== '' || index > 0) query.set(keys.range, text)
    if (sourceId !== null) query.set(keys.source, sourceId)
  })
  if (board.length > 0) query.set('board', formatBoard(board))
  if (dead.length > 0) query.set('dead', formatBoard(dead))
  const written = query.toString()
  return written ? `${labAnalysisPath}?${written}` : labAnalysisPath
}

/**
 * The state an Analysis address holds; a Range, Board or Dead Cards it cannot
 * read are empty ones. With two sides, Dead Cards are dropped.
 */
export function analysisStateFromSearch(search: string): AnalysisState {
  const query = new URLSearchParams(search)
  const sides = Array.from({ length: MAX_ANALYSIS_SIDES }, (_, index) => sideKeys(index))
    .filter((keys, index) => index === 0 || query.has(keys.range))
    .map((keys) => {
      const parsed = parseRange(query.get(keys.range) ?? '')
      return { range: 'range' in parsed ? parsed.range : EMPTY_RANGE, sourceId: query.get(keys.source) }
    })
  const board = readBoardCards(query.get('board') ?? '')
  return { sides, board, dead: sides.length > 1 ? [] : readDeadCards(query.get('dead') ?? '', board) }
}
