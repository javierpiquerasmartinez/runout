import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { createTranslator } from '../i18n/translator'
import type { HandWithTimeline, Street, TableState } from './hand'
import { PlaybackBar } from './PlaybackBar'
import type { RoomSync } from './roomClient'
import type { GuestsFollowing } from './syncView'
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

const inSync: RoomSync = { state: 'synced', latencyMs: 42, failedAttempts: 0, awaitingSnapshot: false }
const noGuests: GuestsFollowing = { total: 0, inSync: 0, latencyMs: null }

function renderBar(actionIndex: number, isMaster: boolean, sync: RoomSync = inSync, guests = noGuests) {
  const onGoTo = vi.fn()
  const view = tableView(hand, actionIndex, createTranslator('en'))
  render(
    <I18nProvider initialLocale="en">
      <PlaybackBar view={view} isMaster={isMaster} sync={sync} guests={guests} onGoTo={onGoTo} />
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

  it('freezes the table for the Master too, once the Room is out of reach', async () => {
    const onGoTo = renderBar(1, true, { ...inSync, state: 'offline' })
    const frozen = 'Offline: the table is frozen on the last Action it received.'

    await userEvent.click(screen.getByRole('button', { name: `Next action. ${frozen}` }))
    await userEvent.click(screen.getByRole('button', { name: `Flop. ${frozen}` }))

    expect(onGoTo).not.toHaveBeenCalled()
  })
})

describe('PlaybackBar, the sync indicator', () => {
  const sync = (state: RoomSync['state'], over: Partial<RoomSync> = {}): RoomSync => ({
    ...inSync,
    state,
    ...over,
  })
  const said = () => screen.getByRole('status').textContent ?? ''

  it('tells a Guest they are with the Master, and how long the round trip takes', () => {
    renderBar(1, false)
    expect(said()).toContain('In sync with the Master')
    expect(said()).toContain('42 ms latency · up to date')
  })

  it('says it is recovering, and stops claiming to be up to date', () => {
    renderBar(1, false, sync('recovering'))
    expect(said()).toContain('Recovering sync')
    expect(said()).toContain('42 ms latency · catching up')
  })

  it('says there is no connection at all, and that the table is frozen', () => {
    renderBar(1, false, sync('offline'))
    expect(said()).toContain('Not connected to the room')
    expect(screen.queryByRole('button', { name: /Reconnect/ })).toBeNull()
  })

  it('offers a reload once three reconnections have failed', () => {
    renderBar(1, false, sync('offline', { failedAttempts: 3 }))
    expect(screen.getByRole('button', { name: /Reconnect/ })).toBeTruthy()
  })

  it('tells the Master how many Guests are with them, and the slowest round trip', () => {
    renderBar(1, true, inSync, { total: 3, inSync: 2, latencyMs: 118 })
    expect(said()).toContain('You control the room')
    expect(said()).toContain('2 guests in sync · 118 ms')
  })

  it('says so plainly when the Master is alone in the Room', () => {
    renderBar(1, true)
    expect(said()).toContain('No guests in the room')
  })

  it('drops "you control the room" while the Master’s own connection is in doubt', () => {
    renderBar(1, true, sync('recovering'), { total: 1, inSync: 0, latencyMs: null })
    expect(said()).toContain('Recovering sync')
    expect(said()).not.toContain('You control the room')
  })
})
