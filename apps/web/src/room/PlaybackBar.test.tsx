import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { createTranslator } from '../i18n/translator'
import type { HandWithTimeline, Street, TableState } from './hand'
import { PlaybackBar } from './PlaybackBar'
import { tableView } from './tableView'

const state = (street: Street): TableState => ({
  street,
  board: street === 'flop' ? ['2c', '10h', '4c'] : [],
  pot: 15,
  pots: [],
  toAct: null,
  action: null,
  players: [
    { screenName: 'Alder239', stack: 1000, bet: 0, folded: false, allIn: false, committed: 0 },
    { screenName: 'iMapleAA', stack: 1000, bet: 0, folded: false, allIn: false, committed: 0 },
  ],
  effectiveStack: 1000,
  spr: null,
  result: null,
})

/** Heads-up, won by a fold on the flop: Actions 1–3, the flop dealt at Action 2. */
const hand: HandWithTimeline = {
  id: 'hand-1',
  stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  tableSize: 2,
  timeline: {
    seats: [
      { seat: 1, screenName: 'Alder239', position: 'SB', startingStack: 1000 },
      { seat: 2, screenName: 'iMapleAA', position: 'BB', startingStack: 1000 },
    ],
    buttonSeat: 1,
    hero: { screenName: 'iMapleAA', cards: ['Js', '8s'] },
    states: [state('preflop'), state('preflop'), state('flop'), state('flop')],
    showdown: false,
  },
}

function renderBar(actionIndex: number, isMaster: boolean) {
  const onGoTo = vi.fn()
  const view = tableView(hand, actionIndex, createTranslator('en'))
  render(
    <I18nProvider initialLocale="en">
      <PlaybackBar view={view} isMaster={isMaster} connected onGoTo={onGoTo} />
    </I18nProvider>,
  )
  return onGoTo
}

describe('PlaybackBar', () => {
  it('jumps to a Street’s start from its segment', async () => {
    const onGoTo = renderBar(3, true)
    await userEvent.click(screen.getByRole('button', { name: 'Preflop' }))
    await userEvent.click(screen.getByRole('button', { name: 'Flop' }))
    expect(onGoTo.mock.calls).toEqual([[0], [2]])
  })

  it('marks the current Street', () => {
    renderBar(1, true)
    expect(screen.getByRole('button', { name: 'Preflop' })).toHaveProperty('ariaCurrent', 'step')
  })

  it('disables the Streets the Hand never reached, and Showdown when there was none', async () => {
    const onGoTo = renderBar(0, true)
    await userEvent.click(screen.getByRole('button', { name: "Turn. This hand didn't get this far." }))
    await userEvent.click(screen.getByRole('button', { name: 'Showdown. This hand had no showdown.' }))
    expect(onGoTo).not.toHaveBeenCalled()
  })

  it('jumps Streets from the Street buttons', async () => {
    const onGoTo = renderBar(1, true)
    await userEvent.click(screen.getByRole('button', { name: 'Previous street' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next street' }))
    expect(onGoTo.mock.calls).toEqual([[0], [2]])
  })

  it('shows Guests the same Street controls, locked', async () => {
    const onGoTo = renderBar(1, false)
    await userEvent.click(screen.getByRole('button', { name: 'Flop. Only the Master controls playback' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next street. Only the Master controls playback' }))
    expect(onGoTo).not.toHaveBeenCalled()
  })
})
