import { describe, expect, it } from 'vitest'
import {
  batchHands,
  batchTotals,
  emptyBatch,
  MAX_FILE_BYTES,
  reduceBatch,
  type HandPreview,
  type ImportBatch,
  type ImportPreview,
  unmatchedHeroes,
} from './importBatch'

const me = { identityId: 'id-marta', displayName: 'Marta' }

function hand(playedAt: string, hero = 'iMapleAA', heroMatched = false): HandPreview {
  return {
    hero,
    author: me,
    heroMatched,
    playedAt,
    stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
    board: [],
    summary: { positions: ['BTN', 'BB'], finalPot: 25, finalStreet: 'preflop', showdown: false },
  }
}

function preview(id: string, hands: number, discarded = 0): ImportPreview {
  return {
    id,
    format: 'pokerstars',
    tried: ['pokerstars'],
    hands: Array.from({ length: hands }, (_, index) => hand(`2026-09-18T12:0${index}:00.000Z`)),
    discarded: Array.from({ length: discarded }, () => ({ text: 'junk', reason: 'unrecognised-format' as const })),
  }
}

function added(...files: { key: string; name: string; size?: number }[]): ImportBatch {
  return reduceBatch(emptyBatch, {
    type: 'added',
    items: files.map(({ key, name, size = 1000 }) => ({ key, name, size })),
  })
}

describe('An import batch', () => {
  it('reads each added file, and refuses one over 20 MB without sending it', () => {
    const batch = added({ key: 'a', name: 'a.txt' }, { key: 'b', name: 'huge.zip', size: MAX_FILE_BYTES + 1 })

    expect(batch.items).toEqual([
      { key: 'a', name: 'a.txt', state: 'reading' },
      { key: 'b', name: 'huge.zip', state: 'failed', reason: 'file-too-large' },
    ])
  })

  it('counts the Hands ready to add and the ones that will be left out, across files', () => {
    let batch = added({ key: 'a', name: 'a.txt' }, { key: 'b', name: 'b.zip' })
    batch = reduceBatch(batch, { type: 'read', key: 'a', preview: preview('p1', 2, 1) })

    expect(batchTotals(batch)).toEqual({ ready: 2, discarded: 1, reading: true, previewIds: ['p1'] })

    batch = reduceBatch(batch, { type: 'read', key: 'b', preview: preview('p2', 3, 2) })

    expect(batchTotals(batch)).toEqual({ ready: 5, discarded: 3, reading: false, previewIds: ['p1', 'p2'] })
  })

  it('leaves a removed file out of the totals and of what is confirmed', () => {
    let batch = added({ key: 'a', name: 'a.txt' }, { key: 'b', name: 'b.txt' })
    batch = reduceBatch(batch, { type: 'read', key: 'a', preview: preview('p1', 2) })
    batch = reduceBatch(batch, { type: 'read', key: 'b', preview: preview('p2', 3) })

    batch = reduceBatch(batch, { type: 'removed', key: 'a' })

    expect(batch.items.map((item) => item.key)).toEqual(['b'])
    expect(batchTotals(batch)).toMatchObject({ ready: 3, previewIds: ['p2'] })
  })

  it('ignores the answer for a file removed while it was being read', () => {
    let batch = added({ key: 'a', name: 'a.txt' })
    batch = reduceBatch(batch, { type: 'removed', key: 'a' })

    batch = reduceBatch(batch, { type: 'read', key: 'a', preview: preview('p1', 2) })

    expect(batch.items).toEqual([])
  })

  it('reads a file again in a format picked by hand, in place', () => {
    let batch = added({ key: 'a', name: 'a.txt' }, { key: 'b', name: 'b.txt' })
    batch = reduceBatch(batch, { type: 'read', key: 'a', preview: { ...preview('p1', 0, 1), format: null } })

    batch = reduceBatch(batch, { type: 'rereading', key: 'a', format: 'pokerstars' })

    expect(batch.items[0]).toEqual({ key: 'a', name: 'a.txt', state: 'reading', format: 'pokerstars' })
    expect(batchTotals(batch).previewIds).toEqual([])
  })

  it('does not confirm a file with no Hands, nor one that failed', () => {
    let batch = added({ key: 'a', name: 'a.txt' }, { key: 'b', name: 'b.txt' })
    batch = reduceBatch(batch, { type: 'read', key: 'a', preview: preview('p1', 0, 3) })
    batch = reduceBatch(batch, { type: 'failed', key: 'b', reason: 'unreadable-file' })

    expect(batchTotals(batch)).toEqual({ ready: 0, discarded: 3, reading: false, previewIds: [] })
  })
})

describe('The Screen Names an import could add', () => {
  function withHands(...hands: HandPreview[]): ImportBatch {
    const batch = added({ key: 'a', name: 'a.txt' })
    return reduceBatch(batch, { type: 'read', key: 'a', preview: { ...preview('p1', 0), hands } })
  }

  it('offers each Hero nobody in the Room is recognised as, once', () => {
    const batch = withHands(
      hand('2026-09-18T12:00:00.000Z', 'Javier_PS'),
      hand('2026-09-18T12:01:00.000Z', 'Marta88', true),
      hand('2026-09-18T12:02:00.000Z', 'Javier_PS'),
      hand('2026-09-18T12:03:00.000Z', 'JaviPQ'),
    )

    expect(unmatchedHeroes(batch)).toEqual(['Javier_PS', 'JaviPQ'])
  })

  it('stops offering a Screen Name once the Importer adds it, and marks its Hands matched', () => {
    const batch = reduceBatch(
      withHands(hand('2026-09-18T12:00:00.000Z', 'Javier_PS'), hand('2026-09-18T12:01:00.000Z', 'JaviPQ')),
      { type: 'screenNameAdded', screenName: 'javier_ps' },
    )

    expect(unmatchedHeroes(batch)).toEqual(['JaviPQ'])
    expect(batchHands(batch).map((each) => each.heroMatched)).toEqual([true, false])
  })
})
