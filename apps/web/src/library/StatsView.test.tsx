import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import { STAT_KEYS, type LibraryStats } from './stats'
import { StatsView } from './StatsView'

/** 1,860 Hands where the Hero put money in 412 times out of 1,838 and raised 334 times out of 1,830; nothing else counted. */
const stats: LibraryStats = {
  hands: 1860,
  stats: {
    ...Object.fromEntries(STAT_KEYS.map((key) => [key, { opportunities: 0, taken: 0 }])),
    vpip: { opportunities: 1838, taken: 412 },
    pfr: { opportunities: 1830, taken: 334 },
  } as LibraryStats['stats'],
}

function renderStats(of: LibraryStats = stats, locale: Locale = 'en') {
  render(
    <I18nProvider initialLocale={locale}>
      <StatsView stats={of} />
    </I18nProvider>,
  )
  return screen.getByRole('region', { name: locale === 'en' ? 'Stats' : 'Estadísticas' })
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
    expect(within(preflop).getByRole('button', { name: 'VPIP 22,4\u00a0%' })).toBeTruthy()
  })

  it('shows “—” for a Stat the Hero never had the chance at', () => {
    renderStats({
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

  it('ends Preflop with Cold Call, Fold BB to Steal and Attempt to Steal, each named in full', async () => {
    renderStats({
      hands: 1860,
      stats: {
        ...stats.stats,
        'cold-call': { opportunities: 690, taken: 58 },
        'fold-bb-to-steal': { opportunities: 214, taken: 88 },
        steal: { opportunities: 432, taken: 171 },
      },
    })

    const preflop = screen.getByRole('group', { name: 'Preflop' })
    const tiles = within(preflop).getAllByRole('button').map((tile) => tile.textContent)
    expect(tiles.slice(-3)).toEqual(['Cold Call 8.4%', 'Fold BB to Steal 41.1%', 'ATS 39.6%'])
    const named = [
      ['Cold Call 8.4%', 'Cold call'],
      ['Fold BB to Steal 41.1%', 'Fold big blind to steal'],
      ['ATS 39.6%', 'Attempt to steal'],
    ]
    for (const [tile, fullName] of named) {
      await userEvent.hover(within(preflop).getByRole('button', { name: tile }))
      expect(within(screen.getByRole('tooltip')).getByText(fullName)).toBeTruthy()
      await userEvent.unhover(within(preflop).getByRole('button', { name: tile }))
    }
  })

  it('says there was no chance rather than “0 / 0”', async () => {
    renderStats({ hands: 1, stats: { ...stats.stats, pfr: { opportunities: 0, taken: 0 } } })

    await userEvent.hover(screen.getByRole('button', { name: 'PFR —' }))

    expect(within(screen.getByRole('tooltip')).getByText('No opportunities')).toBeTruthy()
  })
})
