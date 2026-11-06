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

  it('shows the C-bet Stats in the Postflop group, named in full', async () => {
    const cbets: LibraryStats = {
      hands: 1860,
      stats: {
        ...stats.stats,
        'cbet-flop': { opportunities: 268, taken: 152 },
        'fold-to-cbet-flop': { opportunities: 221, taken: 96 },
        'cbet-turn': { opportunities: 131, taken: 61 },
        'fold-to-cbet-turn': { opportunities: 88, taken: 39 },
        'cbet-river': { opportunities: 48, taken: 22 },
      },
    }
    const view = renderStats(cbets)

    const postflop = within(view).getByRole('group', { name: 'Postflop' })
    for (const name of [
      'Flop C-bet 56.7%',
      'Fold to Flop C-bet 43.4%',
      'Turn C-bet 46.6%',
      'Fold to Turn C-bet 44.3%',
      'River C-bet 45.8%',
      'Fold to River C-bet —',
    ]) {
      expect(within(postflop).getByRole('button', { name })).toBeTruthy()
    }
    await userEvent.hover(screen.getByRole('button', { name: 'Fold to Turn C-bet 44.3%' }))
    expect(within(screen.getByRole('tooltip')).getByText('Fold to turn continuation bet')).toBeTruthy()
  })

  it('names each C-bet Stat in Spanish', async () => {
    renderStats(stats, 'es')

    for (const [abbreviation, name] of [
      ['Flop C-bet', 'Apuesta de continuación en el flop'],
      ['Fold to Flop C-bet', 'Se retira ante una apuesta de continuación en el flop'],
      ['Turn C-bet', 'Apuesta de continuación en el turn'],
      ['Fold to Turn C-bet', 'Se retira ante una apuesta de continuación en el turn'],
      ['River C-bet', 'Apuesta de continuación en el river'],
      ['Fold to River C-bet', 'Se retira ante una apuesta de continuación en el river'],
    ]) {
      const tile = screen.getByRole('button', { name: `${abbreviation} —` })
      await userEvent.hover(tile)
      expect(within(screen.getByRole('tooltip')).getByText(name)).toBeTruthy()
      await userEvent.unhover(tile)
    }
  })

  it('says there was no chance rather than “0 / 0”', async () => {
    renderStats({ hands: 1, stats: { ...stats.stats, pfr: { opportunities: 0, taken: 0 } } })

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

  it('names the links in the person’s language', async () => {
    renderStats(stats, 'es')

    await userEvent.hover(screen.getByRole('button', { name: 'PFR 18,3\u00a0%' }))

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
    renderStats({ hands: 1, stats: { ...stats.stats, pfr: { opportunities: 0, taken: 0 } } })

    await userEvent.hover(screen.getByRole('button', { name: 'PFR —' }))

    expect(within(screen.getByRole('tooltip')).queryByRole('link')).toBeNull()
  })
})
