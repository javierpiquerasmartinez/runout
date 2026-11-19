import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import { SessionContext } from '../identity/context'
import { PreferencesContext } from '../preferences/context'
import { DEFAULT_PREFERENCES, type Preferences } from '../preferences/preferences'
import { fakeSession } from '../test/fakeSession'
import { STAT_KEYS, type LibraryStats, type StatKey } from './stats'
import type { StatCriterion } from './libraryFilter'
import { StatsView } from './StatsView'

/** AF, the one Stat answered as a ratio. */
const AF_KEYS: StatKey[] = ['af-flop', 'af-turn', 'af-river', 'af']

/** 1,860 Hands where the Hero put money in 412 times out of 1,838 and raised 334 times out of 1,830; nothing else counted. */
const stats: LibraryStats = {
  hands: 1860,
  stats: {
    ...Object.fromEntries(
      STAT_KEYS.map((key) => [key, AF_KEYS.includes(key) ? { ratio: true, aggressive: 0, calls: 0 } : { opportunities: 0, taken: 0 }]),
    ),
    vpip: { opportunities: 1838, taken: 412 },
    pfr: { opportunities: 1830, taken: 334 },
  } as LibraryStats['stats'],
  handsWith: {
    ...Object.fromEntries(STAT_KEYS.map((key) => [key, { opportunity: 0, taken: 0 }])),
    vpip: { opportunity: 1838, taken: 412 },
    pfr: { opportunity: 1830, taken: 334 },
  } as LibraryStats['handsWith'],
}

/** Where a Stat's links lead, as the Library would write it. */
const statHref = ({ key, side }: StatCriterion) => `/library?stat=${key}:${side}`

/** Every change of Preferences the view asked for, as the server would get them. */
let changes: Partial<Preferences>[] = []

/** A session whose Preferences change when the view asks, as the server would keep them. */
function Session({ shownStats, children }: { shownStats: StatKey[] | null; children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES, shownStats })
  const changePreferences = async (change: Partial<Preferences>) => {
    changes.push(change)
    setPreferences((before) => ({ ...before, ...change }))
  }
  return (
    <SessionContext.Provider value={fakeSession({ preferences }, { changePreferences })}>
      <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>
    </SessionContext.Provider>
  )
}

function renderStats(of: LibraryStats = stats, locale: Locale = 'en', shownStats: StatKey[] | null = null) {
  changes = []
  render(
    <I18nProvider initialLocale={locale}>
      <Session shownStats={shownStats}>
        <StatsView stats={of} statHref={statHref} />
      </Session>
    </I18nProvider>,
  )
  return screen.getByRole('region', { name: locale === 'en' ? 'Stats' : 'Estadísticas' })
}

/** A band's or a column's tiles, as they read, in the order they show. */
function tilesOf(group: HTMLElement) {
  return within(group)
    .getAllByRole('button')
    .map((tile) => tile.textContent)
}

/** A Street's column under Postflop. */
function column(view: HTMLElement, street: string) {
  return within(within(view).getByRole('group', { name: 'Postflop' })).getByRole('group', { name: street })
}

describe('StatsView', () => {
  it('says how many Hands the Stats cover', () => {
    const view = renderStats()

    expect(within(view).getByText('1,860 hands')).toBeTruthy()
  })

  it('shows each Stat as its abbreviation and its percentage, to one decimal, in its group', () => {
    const view = renderStats()

    const preflop = within(view).getByRole('group', { name: 'Preflop' })
    expect(within(preflop).getByRole('button', { name: 'VPIP 22.4%' })).toBeTruthy()
    expect(within(preflop).getByRole('button', { name: 'PFR 18.3%' })).toBeTruthy()
  })

  it('writes the percentage the way the language does, keeping the abbreviation', () => {
    const view = renderStats(stats, 'es')

    const preflop = within(view).getByRole('group', { name: 'Preflop' })
    expect(within(preflop).getByRole('button', { name: 'VPIP 22,4 %' })).toBeTruthy()
  })

  it('shows “—” for a Stat the Hero never had the chance at', () => {
    renderStats({
      ...stats,
      hands: 1,
      stats: { ...stats.stats, pfr: { opportunities: 0, taken: 0 } },
    })

    expect(screen.getByRole('button', { name: 'PFR —' })).toBeTruthy()
  })

  it('names the Stat in full and gives its count on hover', async () => {
    renderStats()
    expect(screen.queryByRole('tooltip')).toBeNull()

    await userEvent.hover(screen.getByRole('button', { name: 'VPIP 22.4%' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Voluntarily put money in the pot')).toBeTruthy()
    expect(within(tip).getByText('412 / 1,838')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'VPIP 22.4%' }).getAttribute('aria-describedby')).toBe(tip.id)

    await userEvent.unhover(screen.getByRole('button', { name: 'VPIP 22.4%' }))

    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('gives the same on focus, in the person’s language', async () => {
    renderStats(stats, 'es')

    // Past Editar, to the first tile.
    await userEvent.tab()
    await userEvent.tab()

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Pone dinero voluntariamente en el bote')).toBeTruthy()
    expect(within(tip).getByText('412 / 1838')).toBeTruthy()
  })

  it('lays out today’s 21 Stats in Preflop, Postflop and Showdown and totals, in the catalogue’s order', () => {
    const view = renderStats()

    expect(within(view).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Preflop',
      'Postflop',
      'Showdown and totals',
    ])
    expect(tilesOf(within(view).getByRole('group', { name: 'Preflop' }))).toEqual([
      'VPIP 22.4%',
      'PFR 18.3%',
      'ATS —',
      '3-bet —',
      'Fold to 3-bet —',
      'Squeeze —',
      'Cold Call —',
      '4-bet —',
      'Fold to 4-bet —',
      'Fold BB to Steal —',
    ])
    expect(tilesOf(within(view).getByRole('group', { name: 'Showdown and totals' }))).toEqual(['WWSF —', 'WTSD —', 'W$SD —', 'AFq —'])
  })

  it('lays out Postflop as Flop, Turn and River columns, the Street left out of each tile', () => {
    const view = renderStats()

    const postflop = within(view).getByRole('group', { name: 'Postflop' })
    expect(within(postflop).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Flop', 'Turn', 'River'])
    expect(tilesOf(column(view, 'Flop'))).toEqual(['C-bet —', 'Fold to C-bet —', 'Check-raise —'])
    expect(tilesOf(column(view, 'Turn'))).toEqual(['C-bet —', 'Fold to C-bet —'])
    expect(tilesOf(column(view, 'River'))).toEqual(['C-bet —', 'Fold to C-bet —'])
  })

  it('names the bands in Spanish, and the Streets as players do', () => {
    const view = renderStats(stats, 'es')

    expect(within(view).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Preflop',
      'Postflop',
      'Showdown y totales',
    ])
    expect(tilesOf(column(view, 'Turn'))).toEqual(['C-bet —', 'Fold to C-bet —'])
  })

  it('shows each Stat’s value in its own column', () => {
    const view = renderStats({
      ...stats,
      stats: {
        ...stats.stats,
        'cbet-flop': { opportunities: 268, taken: 152 },
        'check-raise-flop': { opportunities: 160, taken: 18 },
        'fold-to-cbet-turn': { opportunities: 88, taken: 39 },
        'cbet-river': { opportunities: 48, taken: 22 },
        afq: { opportunities: 2450, taken: 980 },
        wsd: { opportunities: 146, taken: 77 },
      },
    })

    expect(tilesOf(column(view, 'Flop'))).toEqual(['C-bet 56.7%', 'Fold to C-bet —', 'Check-raise 11.3%'])
    expect(tilesOf(column(view, 'Turn'))).toEqual(['C-bet —', 'Fold to C-bet 44.3%'])
    expect(tilesOf(column(view, 'River'))).toEqual(['C-bet 45.8%', 'Fold to C-bet —'])
    expect(tilesOf(within(view).getByRole('group', { name: 'Showdown and totals' }))).toEqual(['WWSF —', 'WTSD —', 'W$SD 52.7%', 'AFq 40.0%'])
  })

  it('names every Stat in full in its tooltip, a postflop one with its Street', async () => {
    const view = renderStats()

    const named: [HTMLElement, string, string][] = [
      [within(view).getByRole('group', { name: 'Preflop' }), 'ATS —', 'Attempt to steal'],
      [within(view).getByRole('group', { name: 'Preflop' }), '3-bet —', 'Re-raise the first raise preflop'],
      [within(view).getByRole('group', { name: 'Preflop' }), 'Fold to 4-bet —', 'Fold to a re-raise of your 3-bet'],
      [within(view).getByRole('group', { name: 'Preflop' }), 'Cold Call —', 'Cold call'],
      [within(view).getByRole('group', { name: 'Preflop' }), 'Fold BB to Steal —', 'Fold big blind to steal'],
      [column(view, 'Flop'), 'C-bet —', 'Flop continuation bet'],
      [column(view, 'Flop'), 'Check-raise —', 'Check-raise on the flop'],
      [column(view, 'Turn'), 'Fold to C-bet —', 'Fold to turn continuation bet'],
      [column(view, 'River'), 'C-bet —', 'River continuation bet'],
      [within(view).getByRole('group', { name: 'Showdown and totals' }), 'AFq —', 'Aggression frequency, postflop'],
      [within(view).getByRole('group', { name: 'Showdown and totals' }), 'WTSD —', 'Went to showdown'],
    ]
    for (const [group, tile, name] of named) {
      await userEvent.hover(within(group).getByRole('button', { name: tile }))
      expect(within(screen.getByRole('tooltip')).getByText(name)).toBeTruthy()
      await userEvent.unhover(within(group).getByRole('button', { name: tile }))
    }
  })

  it('names them in full in Spanish too', async () => {
    const view = renderStats(stats, 'es')

    const named: [HTMLElement, string, string][] = [
      [within(view).getByRole('group', { name: 'Preflop' }), 'Squeeze —', 'Resube una subida que ya han pagado'],
      [column(view, 'Flop'), 'Fold to C-bet —', 'Se retira ante una apuesta de continuación en el flop'],
      [column(view, 'Turn'), 'C-bet —', 'Apuesta de continuación en el turn'],
      [column(view, 'River'), 'Fold to C-bet —', 'Se retira ante una apuesta de continuación en el river'],
      [within(view).getByRole('group', { name: 'Showdown y totales' }), 'W$SD —', 'Gana dinero en el showdown'],
    ]
    for (const [group, tile, name] of named) {
      await userEvent.hover(within(group).getByRole('button', { name: tile }))
      expect(within(screen.getByRole('tooltip')).getByText(name)).toBeTruthy()
      await userEvent.unhover(within(group).getByRole('button', { name: tile }))
    }
  })

  it('gives AFq’s count in Actions, more than the Hands it covers', async () => {
    renderStats({ ...stats, stats: { ...stats.stats, afq: { opportunities: 2450, taken: 980 } } })

    await userEvent.hover(screen.getByRole('button', { name: 'AFq 40.0%' }))

    expect(within(screen.getByRole('tooltip')).getByText('980 / 2,450')).toBeTruthy()
  })

  it('says there was no chance rather than “0 / 0”', async () => {
    renderStats({ ...stats, hands: 1, stats: { ...stats.stats, pfr: { opportunities: 0, taken: 0 } } })

    await userEvent.hover(screen.getByRole('button', { name: 'PFR —' }))

    expect(within(screen.getByRole('tooltip')).getByText('No opportunities')).toBeTruthy()
  })

  it('links to the Hands behind the opportunities and behind the times taken', async () => {
    renderStats()

    await userEvent.hover(screen.getByRole('button', { name: 'VPIP 22.4%' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByRole('link', { name: 'Opportunities (1,838)' }).getAttribute('href')).toBe('/library?stat=vpip:opportunity')
    expect(within(tip).getByRole('link', { name: 'You did it (412)' }).getAttribute('href')).toBe('/library?stat=vpip:taken')
  })

  it('links a Street’s Stat to its own Hands', async () => {
    const view = renderStats({
      ...stats,
      stats: { ...stats.stats, 'cbet-turn': { opportunities: 131, taken: 61 } },
      handsWith: { ...stats.handsWith, 'cbet-turn': { opportunity: 131, taken: 61 } },
    })

    await userEvent.hover(within(column(view, 'Turn')).getByRole('button', { name: 'C-bet 46.6%' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByRole('link', { name: 'Opportunities (131)' }).getAttribute('href')).toBe('/library?stat=cbet-turn:opportunity')
    expect(within(tip).getByRole('link', { name: 'You did it (61)' }).getAttribute('href')).toBe('/library?stat=cbet-turn:taken')
  })

  it('counts AFq’s links in Hands, as Manos will list them, not in Actions', async () => {
    renderStats({
      ...stats,
      stats: { ...stats.stats, afq: { opportunities: 2450, taken: 980 } },
      handsWith: { ...stats.handsWith, afq: { opportunity: 610, taken: 402 } },
    })

    await userEvent.hover(screen.getByRole('button', { name: 'AFq 40.0%' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('980 / 2,450')).toBeTruthy()
    expect(within(tip).getByRole('link', { name: 'Opportunities (610)' }).getAttribute('href')).toBe('/library?stat=afq:opportunity')
    expect(within(tip).getByRole('link', { name: 'You did it (402)' }).getAttribute('href')).toBe('/library?stat=afq:taken')
  })

  it('names the links in the person’s language', async () => {
    renderStats(stats, 'es')

    await userEvent.hover(screen.getByRole('button', { name: 'PFR 18,3 %' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByRole('link', { name: 'Oportunidades (1830)' }).getAttribute('href')).toBe('/library?stat=pfr:opportunity')
    expect(within(tip).getByRole('link', { name: 'Lo hiciste (334)' }).getAttribute('href')).toBe('/library?stat=pfr:taken')
  })

  it('keeps the tooltip open while the keyboard moves on to its links', async () => {
    renderStats()

    // Past Editar, to the first tile, then on to its first link.
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()

    expect(document.activeElement).toBe(within(screen.getByRole('tooltip')).getByRole('link', { name: 'Opportunities (1,838)' }))
    await userEvent.tab()
    expect(document.activeElement?.textContent).toBe('You did it (412)')
  })

  it('has no links where there was no chance', async () => {
    renderStats({ ...stats, hands: 1, stats: { ...stats.stats, pfr: { opportunities: 0, taken: 0 } } })

    await userEvent.hover(screen.getByRole('button', { name: 'PFR —' }))

    expect(within(screen.getByRole('tooltip')).queryByRole('link')).toBeNull()
  })
})

describe('StatsView, AF', () => {
  /** AF on every Street and in total, shown, with 45 bets and raises against 19 calls on the flop. */
  function renderAf(af: Partial<LibraryStats['stats']>, locale: Locale = 'en') {
    return renderStats(
      {
        ...stats,
        stats: { ...stats.stats, ...af },
        handsWith: { ...stats.handsWith, 'af-flop': { opportunity: 52, taken: 38 } },
      },
      locale,
      ['cbet-flop', 'check-raise-flop', 'af-flop', 'af-turn', 'af-river', 'wsd', 'af', 'afq'],
    )
  }
  const flop = { 'af-flop': { ratio: true, aggressive: 45, calls: 19 } } as const

  it('is hidden by default', () => {
    const view = renderStats()

    expect(within(view).queryByRole('button', { name: /^AF / })).toBeNull()
  })

  it('sits last in each Street column and before AFq in the totals, as a ratio to one decimal with no percent sign', () => {
    const view = renderAf({ ...flop, af: { ratio: true, aggressive: 120, calls: 50 } })

    expect(tilesOf(column(view, 'Flop'))).toEqual(['C-bet —', 'Check-raise —', 'AF 2.4'])
    expect(tilesOf(column(view, 'Turn'))).toEqual(['AF —'])
    expect(tilesOf(column(view, 'River'))).toEqual(['AF —'])
    expect(tilesOf(within(view).getByRole('group', { name: 'Showdown and totals' }))).toEqual(['W$SD —', 'AF 2.4', 'AFq —'])
  })

  it('writes the ratio the way the language does', () => {
    const view = renderAf(flop, 'es')

    expect(within(column(view, 'Flop')).getByRole('button', { name: 'AF 2,4' })).toBeTruthy()
  })

  it('reads “∞” with aggressive Actions and no calls, and “—” with neither', () => {
    const view = renderAf({
      'af-turn': { ratio: true, aggressive: 7, calls: 0 },
      'af-river': { ratio: true, aggressive: 0, calls: 0 },
    })

    expect(tilesOf(column(view, 'Turn'))).toEqual(['AF ∞'])
    expect(tilesOf(column(view, 'River'))).toEqual(['AF —'])
  })

  it('reads 0.0 with calls and no aggressive Action', () => {
    const view = renderAf({ 'af-turn': { ratio: true, aggressive: 0, calls: 4 } })

    expect(tilesOf(column(view, 'Turn'))).toEqual(['AF 0.0'])
  })

  it('gives its bets and raises against its calls, and links to the Hands with action and the aggressive ones', async () => {
    const view = renderAf(flop)

    await userEvent.hover(within(column(view, 'Flop')).getByRole('button', { name: 'AF 2.4' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Aggression factor on the flop')).toBeTruthy()
    expect(within(tip).getByText('45 bets and raises / 19 calls')).toBeTruthy()
    expect(within(tip).getByRole('link', { name: 'With action (52)' }).getAttribute('href')).toBe('/library?stat=af-flop:opportunity')
    expect(within(tip).getByRole('link', { name: 'Aggressive (38)' }).getAttribute('href')).toBe('/library?stat=af-flop:taken')
  })

  it('says it in Spanish', async () => {
    const view = renderAf(flop, 'es')

    await userEvent.hover(within(column(view, 'Flop')).getByRole('button', { name: 'AF 2,4' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Factor de agresión en el flop')).toBeTruthy()
    expect(within(tip).getByText('45 bets y raises / 19 calls')).toBeTruthy()
    expect(within(tip).getByRole('link', { name: 'Con acción (52)' })).toBeTruthy()
    expect(within(tip).getByRole('link', { name: 'Agresivas (38)' })).toBeTruthy()
  })

  it('still links to its Hands when there were no calls', async () => {
    renderAf({ af: { ratio: true, aggressive: 3, calls: 0 } })

    await userEvent.hover(screen.getByRole('button', { name: 'AF ∞' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('3 bets and raises / 0 calls')).toBeTruthy()
    expect(within(tip).getAllByRole('link')).toHaveLength(2)
  })

  it('says there was no action rather than “0 / 0”, with no links', async () => {
    const view = renderAf({})

    await userEvent.hover(within(column(view, 'River')).getByRole('button', { name: 'AF —' }))

    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('No bets, raises or calls')).toBeTruthy()
    expect(within(tip).queryByRole('link')).toBeNull()
  })
})

describe('StatsView, choosing which Stats one sees', () => {
  it('shows only the chosen Stats, in the catalogue’s order whatever order they were chosen in', () => {
    const view = renderStats(stats, 'en', ['pfr', 'cbet-turn', 'vpip', 'wsd'])

    expect(tilesOf(within(view).getByRole('group', { name: 'Preflop' }))).toEqual(['VPIP 22.4%', 'PFR 18.3%'])
    expect(tilesOf(column(view, 'Turn'))).toEqual(['C-bet —'])
    expect(tilesOf(within(view).getByRole('group', { name: 'Showdown and totals' }))).toEqual(['W$SD —'])
  })

  it('draws no band, nor Street column, with nothing chosen in it', () => {
    const view = renderStats(stats, 'en', ['vpip', 'cbet-river'])

    expect(within(view).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Preflop', 'Postflop'])
    const postflop = within(view).getByRole('group', { name: 'Postflop' })
    expect(within(postflop).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['River'])
  })

  it('keeps the Hand count whatever is chosen', () => {
    const view = renderStats(stats, 'en', ['wsd'])

    expect(within(view).getByText('1,860 hands')).toBeTruthy()
  })

  it('opens editing from Editar, every Stat of the catalogue shown with its value, the chosen ones marked', async () => {
    const view = renderStats(stats, 'en', ['vpip'])

    await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

    expect(within(view).getByText('Choose which Stats you see: one click adds or removes each. The faded ones are hidden.')).toBeTruthy()
    const preflop = within(view).getByRole('group', { name: 'Preflop' })
    expect(within(preflop).getByRole('button', { name: 'VPIP 22.4%', pressed: true })).toBeTruthy()
    // A hidden Stat shows its value too, to tell whether it is worth adding.
    expect(within(preflop).getByRole('button', { name: 'PFR 18.3%', pressed: false })).toBeTruthy()
    expect(within(column(view, 'River')).getByRole('button', { name: 'Fold to C-bet —', pressed: false })).toBeTruthy()
    expect(within(view).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Preflop',
      'Postflop',
      'Showdown and totals',
    ])
  })

  it('shows or hides a Stat with one click, kept at once, in the catalogue’s order', async () => {
    const view = renderStats(stats, 'en', ['wsd', 'vpip'])
    await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

    await userEvent.click(within(view).getByRole('button', { name: 'PFR 18.3%' }))

    expect(changes).toEqual([{ shownStats: ['vpip', 'pfr', 'wsd'] }])
    expect(within(view).getByRole('button', { name: 'PFR 18.3%', pressed: true })).toBeTruthy()

    await userEvent.click(within(view).getByRole('button', { name: 'VPIP 22.4%' }))

    expect(changes.at(-1)).toEqual({ shownStats: ['pfr', 'wsd'] })
    expect(within(view).getByRole('button', { name: 'VPIP 22.4%', pressed: false })).toBeTruthy()
  })

  it('starts a first choice from the default', async () => {
    const view = renderStats()
    await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

    await userEvent.click(within(view).getByRole('button', { name: 'VPIP 22.4%' }))

    // Today's 21, less VPIP: the Stats the catalogue added later stay hidden.
    expect(changes).toEqual([
      {
        shownStats: [
          'pfr',
          'steal',
          'three-bet',
          'fold-to-three-bet',
          'squeeze',
          'cold-call',
          'four-bet',
          'fold-to-four-bet',
          'fold-bb-to-steal',
          'cbet-flop',
          'fold-to-cbet-flop',
          'check-raise-flop',
          'cbet-turn',
          'fold-to-cbet-turn',
          'cbet-river',
          'fold-to-cbet-river',
          'wwsf',
          'wtsd',
          'wsd',
          'afq',
        ],
      },
    ])
  })

  it('offers the newer preflop Stats in editing, hidden until added, each in its place', async () => {
    const view = renderStats(stats, 'en', ['vpip'])
    await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

    expect(tilesOf(within(view).getByRole('group', { name: 'Preflop' }))).toEqual([
      'VPIP 22.4%',
      'PFR 18.3%',
      'RFI —',
      'ATS —',
      'Limp —',
      'Limp-fold —',
      'Limp-call —',
      'Limp-raise —',
      'Isolate —',
      '3-bet —',
      'Fold to 3-bet —',
      'Squeeze —',
      'Fold to Squeeze —',
      'Cold Call —',
      '4-bet —',
      'Fold to 4-bet —',
      '5-bet+ —',
      'Fold to 5-bet+ —',
      'Fold SB to Steal —',
      'Fold BB to Steal —',
      'Resteal —',
      'Fold to Resteal —',
    ])

    await userEvent.click(within(view).getByRole('button', { name: 'Resteal —', pressed: false }))

    expect(changes).toEqual([{ shownStats: ['vpip', 'resteal'] }])
  })

  it.each([
    ['en', [
      ['RFI —', 'Raise first in'],
      ['Limp-raise —', 'Re-raise a raise after your limp'],
      ['5-bet+ —', 'Re-raise a 4-bet'],
      ['Fold SB to Steal —', 'Fold small blind to steal'],
      ['Fold to Resteal —', 'Fold to a re-raise of your steal'],
    ]],
    ['es', [
      ['RFI —', 'Abre subiendo cuando nadie ha entrado antes'],
      ['Limp-raise —', 'Resube una subida tras su limp'],
      ['5-bet+ —', 'Resube un 4-bet'],
      ['Fold SB to Steal —', 'Se retira en la ciega pequeña ante un robo'],
      ['Fold to Resteal —', 'Se retira ante una resubida a su robo'],
    ]],
  ] as const)('names the newer preflop Stats in full once added (%s)', async (locale, named) => {
    const view = renderStats(stats, locale, ['rfi', 'limp-raise', 'five-bet', 'fold-sb-to-steal', 'fold-to-resteal'])

    for (const [tile, name] of named) {
      await userEvent.hover(within(view).getByRole('button', { name: tile }))
      expect(within(screen.getByRole('tooltip')).getByText(name)).toBeTruthy()
      await userEvent.unhover(within(view).getByRole('button', { name: tile }))
    }
  })

  it('has no tooltips nor links while editing', async () => {
    const view = renderStats(stats, 'en', ['vpip'])
    await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

    await userEvent.hover(within(view).getByRole('button', { name: 'VPIP 22.4%' }))
    await userEvent.tab()

    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('goes back to the default with Restablecer, and out of editing with Listo', async () => {
    const view = renderStats(stats, 'en', ['vpip'])
    await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

    await userEvent.click(within(view).getByRole('button', { name: 'Reset' }))

    expect(changes).toEqual([{ shownStats: null }])
    expect(within(view).getByRole('button', { name: 'PFR 18.3%', pressed: true })).toBeTruthy()

    await userEvent.click(within(view).getByRole('button', { name: 'Done' }))

    expect(within(view).getByText('1,860 hands')).toBeTruthy()
    expect(within(view).getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(tilesOf(within(view).getByRole('group', { name: 'Showdown and totals' }))).toEqual(['WWSF —', 'WTSD —', 'W$SD —', 'AFq —'])
    await userEvent.hover(within(view).getByRole('button', { name: 'VPIP 22.4%' }))
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })

  it('says so when nothing is chosen, and offers Editar', async () => {
    const view = renderStats(stats, 'en', [])

    expect(within(view).queryAllByRole('group')).toEqual([])
    expect(within(view).getByText('No Stats to show. Choose which ones you see with Edit.')).toBeTruthy()
    await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

    expect(within(view).getByRole('button', { name: 'VPIP 22.4%', pressed: false })).toBeTruthy()
  })

  it('speaks Spanish', async () => {
    const view = renderStats(stats, 'es', ['vpip'])

    await userEvent.click(within(view).getByRole('button', { name: 'Editar' }))

    expect(within(view).getByText('Elige qué estadísticas ves: un clic pone o quita cada una. Las atenuadas están ocultas.')).toBeTruthy()
    expect(within(view).getByRole('button', { name: 'Restablecer' })).toBeTruthy()
    expect(within(view).getByRole('button', { name: 'Listo' })).toBeTruthy()
  })

  it('says so when a change can’t be kept', async () => {
    render(
      <I18nProvider initialLocale="en">
        <SessionContext.Provider value={fakeSession({}, { changePreferences: async () => Promise.reject(new Error('offline')) })}>
          <StatsView stats={stats} statHref={statHref} />
        </SessionContext.Provider>
      </I18nProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    await userEvent.click(screen.getByRole('button', { name: 'VPIP 22.4%' }))

    expect(screen.getByRole('alert').textContent).toBe("The change was not saved. We couldn't reach the server. Try again.")
  })

  it('says it in Spanish when nothing is chosen', () => {
    const view = renderStats(stats, 'es', [])

    expect(within(view).getByText('No hay estadísticas que mostrar. Elige cuáles ves con Editar.')).toBeTruthy()
  })

  describe('at phone width', () => {
    /** The screen's width, as `matchMedia` answers the 760 px breakpoint; changing it tells whoever listens. */
    let narrow: boolean
    const listeners = new Set<() => void>()

    beforeEach(() => {
      narrow = true
      listeners.clear()
      vi.stubGlobal('matchMedia', (query: string) => ({
        get matches() {
          return query === '(max-width: 760px)' && narrow
        },
        addEventListener: (_: string, changed: () => void) => listeners.add(changed),
        removeEventListener: (_: string, changed: () => void) => listeners.delete(changed),
      }))
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('shows the chosen Stats, with no Editar and a line saying they are chosen on a computer', () => {
      const view = renderStats(stats, 'en', ['vpip', 'cbet-turn'])

      expect(tilesOf(within(view).getByRole('group', { name: 'Preflop' }))).toEqual(['VPIP 22.4%'])
      expect(tilesOf(column(view, 'Turn'))).toEqual(['C-bet —'])
      expect(within(view).queryByRole('button', { name: 'Edit' })).toBeNull()
      expect(within(view).getByText('Choose which Stats you see on a computer.')).toBeTruthy()
    })

    it('says it in Spanish', () => {
      const view = renderStats(stats, 'es')

      expect(within(view).queryByRole('button', { name: 'Editar' })).toBeNull()
      expect(within(view).getByText('Elige qué estadísticas ves desde el ordenador.')).toBeTruthy()
    })

    it('says nothing is shown without offering Editar', () => {
      const view = renderStats(stats, 'en', [])

      expect(within(view).getByText('No Stats to show.')).toBeTruthy()
      expect(within(view).queryByRole('button', { name: 'Edit' })).toBeNull()
      expect(within(view).getByText('Choose which Stats you see on a computer.')).toBeTruthy()
    })

    it('leaves editing when the window narrows to a phone', async () => {
      narrow = false
      const view = renderStats(stats, 'en', ['vpip'])
      await userEvent.click(within(view).getByRole('button', { name: 'Edit' }))

      act(() => {
        narrow = true
        listeners.forEach((changed) => changed())
      })

      expect(within(view).queryByRole('button', { name: 'PFR 18.3%' })).toBeNull()
      expect(within(view).getByText('1,860 hands')).toBeTruthy()
    })
  })
})
