import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import { STAT_KEYS, type LibraryStats } from './stats'
import type { StatCriterion } from './libraryFilter'
import { StatsView } from './StatsView'

/** 1,860 Hands where the Hero put money in 412 times out of 1,838 and raised 334 times out of 1,830; nothing else counted. */
const stats: LibraryStats = {
  hands: 1860,
  stats: {
    ...Object.fromEntries(STAT_KEYS.map((key) => [key, { opportunities: 0, taken: 0 }])),
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

function renderStats(of: LibraryStats = stats, locale: Locale = 'en') {
  render(
    <I18nProvider initialLocale={locale}>
      <StatsView stats={of} statHref={statHref} />
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
