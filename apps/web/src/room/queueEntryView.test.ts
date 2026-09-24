import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator'
import type { QueueEntry } from './roomClient'
import {
  authoredCount,
  playedAtLabel,
  positionsLabel,
  potLabel,
  potSecondaryLabel,
  sameHandLabel,
  siteLabel,
  stakeLabel,
  streetLabel,
} from './queueEntryView'

const es = createTranslator('es')

const entry = (overrides: Partial<QueueEntry> = {}): QueueEntry => ({
  id: 'entry-1',
  handId: 'hand-1',
  position: 1,
  author: { identityId: 'id-javier', displayName: 'Javier' },
  site: 'pokerstars',
  siteHandId: '262120750636',
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

describe('siteLabel', () => {
  it('names the Poker Site', () => {
    expect(siteLabel(entry({ site: 'pokerstars' }), es)).toBe('PokerStars')
    expect(siteLabel(entry({ site: 'ggpoker' }), es)).toBe('GGPoker')
    expect(siteLabel(entry({ site: 'winamax' }), es)).toBe('Winamax')
  })
})

describe('potLabel', () => {
  it('reads the final pot in big blinds, in the UI language', () => {
    expect(potLabel(entry(), es)).toBe('Bote 10,5 BB')
    expect(potLabel(entry(), createTranslator('en'))).toBe('Pot 10.5 BB')
    const exact = entry({ summary: { ...entry().summary, finalPot: 100 } })
    expect(potLabel(exact, es)).toBe('Bote 10 BB')
  })

  it('reads it in the Display Unit, with the Amount beside big blinds when both are on', () => {
    expect(potLabel(entry(), es, 'amount')).toBe('Bote 1,05\u00a0€')
    expect(potLabel(entry(), createTranslator('en'), 'amount')).toBe('Pot €1.05')
    expect(potLabel(entry(), es, 'both')).toBe('Bote 10,5 BB')
    expect(potSecondaryLabel(entry(), es, 'both')).toBe('1,05\u00a0€')
    expect(potSecondaryLabel(entry(), es, 'big-blinds')).toBeNull()
    expect(potSecondaryLabel(entry(), es, 'amount')).toBeNull()
  })
})

describe('playedAtLabel', () => {
  it('reads the date and time the Hand was played, in the UI language', () => {
    expect(playedAtLabel(entry(), es, 'UTC')).toBe('18 sept · 12:34')
    expect(playedAtLabel(entry(), createTranslator('en'), 'UTC')).toBe('Sep 18 · 12:34')
  })
})

describe('sameHandLabel', () => {
  const marta = { identityId: 'id-marta', displayName: 'Marta' }
  const alberto = { identityId: 'id-alberto', displayName: 'Alberto' }

  it('says whose other Hands in the Queue are the same real-world hand, from another seat', () => {
    const mine = entry()
    const queue = [
      mine,
      entry({ id: 'entry-2', handId: 'hand-2', author: marta }),
      entry({ id: 'entry-3', handId: 'hand-3', siteHandId: '999' }),
      entry({ id: 'entry-4', handId: 'hand-4', author: alberto }),
    ]

    expect(sameHandLabel(mine, queue, es)).toBe('Misma mano que Marta y Alberto')
    expect(sameHandLabel(queue[1], queue, createTranslator('en'))).toBe('Same hand as Javier and Alberto')
  })

  it('says nothing for a hand only one Hero brought', () => {
    const queue = [entry(), entry({ id: 'entry-2', handId: 'hand-2', siteHandId: '999' })]

    expect(sameHandLabel(queue[0], queue, es)).toBeNull()
  })

  it('tells hands of different Poker Sites apart even with the same hand ID', () => {
    const queue = [entry(), entry({ id: 'entry-2', handId: 'hand-2', site: 'winamax' })]

    expect(sameHandLabel(queue[0], queue, es)).toBeNull()
  })
})

describe('authoredCount', () => {
  it('counts the Hands in the Queue a Participant is Author of', () => {
    const marta = { identityId: 'id-marta', displayName: 'Marta' }
    const queue = [entry(), entry({ id: 'entry-2', author: marta }), entry({ id: 'entry-3' })]

    expect(authoredCount(queue, 'id-javier')).toBe(2)
    expect(authoredCount(queue, 'id-marta')).toBe(1)
    expect(authoredCount(queue, 'id-nobody')).toBe(0)
  })
})
