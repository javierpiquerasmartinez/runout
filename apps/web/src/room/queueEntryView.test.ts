import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator'
import type { QueueEntry } from './roomClient'
import { playedAtLabel, positionsLabel, potLabel, stakeLabel, streetLabel } from './queueEntryView'

const es = createTranslator('es')

const entry = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  id: 'entry-1',
  handId: 'hand-1',
  position: 1,
  author: { identityId: 'id-javier', displayName: 'Javier' },
  playedAt: '2026-09-18T12:34:30.000Z',
  stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  summary: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
  ...overrides,
})

describe('positionsLabel', () => {
  it('joins the Positions involved against each other', () => {
    expect(positionsLabel(entry(), es)).toBe('BTN vs BB')
    expect(positionsLabel(entry({ summary: { ...entry().summary, positions: ['SB', 'BB', 'CO'] } }), es)).toBe(
      'SB vs BB vs CO',
    )
  })
})

describe('streetLabel', () => {
  it('names the Final Street, or Showdown when the Hand went to one', () => {
    expect(streetLabel(entry(), es)).toBe('SHOWDOWN')
    expect(streetLabel(entry({ summary: { ...entry().summary, showdown: false } }), es)).toBe('RIVER')
    expect(
      streetLabel(entry({ summary: { ...entry().summary, finalStreet: 'preflop', showdown: false } }), es),
    ).toBe('PREFLOP')
  })
})

describe('stakeLabel', () => {
  it('names the game by its big blind, the online-poker way', () => {
    expect(stakeLabel(entry())).toBe('NL10')
    expect(stakeLabel(entry({ stake: { limit: 'no-limit', smallBlind: 25, bigBlind: 50, currency: 'USD' } }))).toBe(
      'NL50',
    )
    expect(stakeLabel(entry({ stake: { limit: 'pot-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' } }))).toBe(
      'PL10',
    )
  })
})

describe('potLabel', () => {
  it('reads the final pot in big blinds, in the UI language', () => {
    expect(potLabel(entry(), es)).toBe('Bote 10,5 BB')
    expect(potLabel(entry(), createTranslator('en'))).toBe('Pot 10.5 BB')
    const exact = entry({ summary: { ...entry().summary, finalPot: 100 } })
    expect(potLabel(exact, es)).toBe('Bote 10 BB')
  })
})

describe('playedAtLabel', () => {
  it('reads the date and time the Hand was played, in the UI language', () => {
    expect(playedAtLabel(entry(), es, 'UTC')).toBe('18 sept · 12:34')
    expect(playedAtLabel(entry(), createTranslator('en'), 'UTC')).toBe('Sep 18 · 12:34')
  })
})
