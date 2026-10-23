import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n'
import { PreferencesContext } from '../preferences/context'
import { DEFAULT_PREFERENCES, type Preferences } from '../preferences/preferences'
import type { Results } from './results'
import { ResultsGraph } from './ResultsGraph'

/**
 * Five Hands at €0.05/€0.10: +€0.31, -€0.30, €0, -€0.10, then +€0.49 at
 * Showdown, an all-in whose All-in EV was +€0.20.
 */
const euros: Results = {
  hands: 5,
  currency: 'EUR',
  totals: {
    bigBlinds: { result: 4, allInEv: 1, showdown: 4.9, nonShowdown: -0.9 },
    amounts: { result: 40, allInEv: 10, showdown: 49, nonShowdown: -9 },
  },
  points: [
    {
      hand: 3,
      bigBlinds: { result: 0.1, allInEv: 0.1, showdown: 0, nonShowdown: 0.1 },
      amounts: { result: 1, allInEv: 1, showdown: 0, nonShowdown: 1 },
    },
    {
      hand: 5,
      bigBlinds: { result: 4, allInEv: 1, showdown: 4.9, nonShowdown: -0.9 },
      amounts: { result: 40, allInEv: 10, showdown: 49, nonShowdown: -9 },
    },
  ],
}

function renderGraph(results: Results, preferences: Preferences = DEFAULT_PREFERENCES) {
  return render(
    <I18nProvider initialLocale="en">
      <PreferencesContext.Provider value={preferences}>
        <ResultsGraph results={results} />
      </PreferencesContext.Provider>
    </I18nProvider>,
  )
}

/** The legend's entry for a line: its toggle and its total. */
function legendEntry(line: string) {
  const legend = screen.getByRole('list', { name: 'Lines' })
  return within(legend).getByRole('button', { name: line }).closest('li')!
}

/** A line's Win Rate, as the BB/100 box under the legend shows it. */
function winRate(line: string) {
  const box = screen.getByRole('group', { name: 'BB/100' })
  return within(box).getByText(line).nextElementSibling?.textContent
}

describe('ResultsGraph', () => {
  it('shows the Win Rate of the Result and of All-in EV, in big blinds per 100 Hands whatever the unit', async () => {
    renderGraph(euros, { ...DEFAULT_PREFERENCES, displayUnit: 'amount' })

    // +4 BB and +1 BB over 5 Hands, to a tenth even when whole.
    expect(winRate('Result')).toBe('+80.0')
    expect(winRate('All-in EV')).toBe('+20.0')

    await userEvent.click(screen.getByRole('radio', { name: 'Big blinds' }))

    expect(winRate('Result')).toBe('+80.0')
  })

  it('writes the Win Rate to a tenth, signed', () => {
    renderGraph({ ...euros, hands: 3, totals: { ...euros.totals, bigBlinds: { ...euros.totals.bigBlinds, result: -1 } } })

    expect(winRate('Result')).toBe('-33.3')
  })

  it('shows each line’s total in big blinds, and how many Hands it draws', () => {
    renderGraph(euros)

    expect(screen.getByRole('region', { name: 'Results' })).toBeTruthy()
    expect(screen.getByText('5 hands')).toBeTruthy()
    expect(within(legendEntry('Result')).getByText('+4 BB')).toBeTruthy()
    expect(within(legendEntry('All-in EV')).getByText('+1 BB')).toBeTruthy()
    expect(within(legendEntry('Showdown')).getByText('+4.9 BB')).toBeTruthy()
    expect(within(legendEntry('Non-showdown')).getByText('-0.9 BB')).toBeTruthy()
  })

  it('hides and shows each line from the legend', async () => {
    const { container } = renderGraph(euros)
    const drawn = () => [...container.querySelectorAll('.recharts-line')].map((line) => line.getAttribute('class'))
    expect(drawn()).toHaveLength(4)

    await userEvent.click(screen.getByRole('button', { name: 'Showdown' }))

    expect(screen.getByRole('button', { name: 'Showdown' }).getAttribute('aria-pressed')).toBe('false')
    expect(drawn()).toHaveLength(3)
    expect(drawn().some((name) => name?.includes('results__line--showdown'))).toBe(false)
    // Its total stays readable.
    expect(within(legendEntry('Showdown')).getByText('+4.9 BB')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Showdown' }))

    expect(screen.getByRole('button', { name: 'Showdown' }).getAttribute('aria-pressed')).toBe('true')
    expect(drawn()).toHaveLength(4)

    await userEvent.click(screen.getByRole('button', { name: 'All-in EV' }))

    expect(drawn()).toHaveLength(3)
    expect(drawn().some((name) => name?.includes('results__line--allInEv'))).toBe(false)
  })

  describe('unit', () => {
    const unitSwitch = () => screen.getByRole('radiogroup', { name: /^Unit/ })

    it('switches to Amounts when every Hand shares one currency', async () => {
      renderGraph(euros)
      expect(within(unitSwitch()).getByRole('radio', { name: 'Big blinds' }).getAttribute('aria-checked')).toBe('true')

      await userEvent.click(within(unitSwitch()).getByRole('radio', { name: 'Amount' }))

      expect(within(legendEntry('Result')).getByText('+€0.40')).toBeTruthy()
      expect(within(legendEntry('All-in EV')).getByText('+€0.10')).toBeTruthy()
      expect(within(legendEntry('Showdown')).getByText('+€0.49')).toBeTruthy()
      expect(within(legendEntry('Non-showdown')).getByText('-€0.09')).toBeTruthy()

      await userEvent.click(within(unitSwitch()).getByRole('radio', { name: 'Big blinds' }))

      expect(within(legendEntry('Result')).getByText('+4 BB')).toBeTruthy()
    })

    it('starts in Amounts for a reader whose Display Unit is the Amount', () => {
      renderGraph(euros, { ...DEFAULT_PREFERENCES, displayUnit: 'amount' })

      expect(within(unitSwitch()).getByRole('radio', { name: 'Amount' }).getAttribute('aria-checked')).toBe('true')
      expect(within(legendEntry('Result')).getByText('+€0.40')).toBeTruthy()
    })

    it('stays in big blinds, saying why, when the Hands mix currencies', async () => {
      const mixed: Results = {
        ...euros,
        currency: null,
        totals: { ...euros.totals, amounts: null },
        points: euros.points.map((point) => ({ ...point, amounts: null })),
      }
      renderGraph(mixed, { ...DEFAULT_PREFERENCES, displayUnit: 'amount' })

      expect(unitSwitch().getAttribute('aria-label')).toBe('Unit')
      const money = within(unitSwitch()).getByRole('radio', { name: /^Amount/ })
      expect(money.getAttribute('aria-disabled')).toBe('true')
      expect(money.getAttribute('aria-label')).toBe(
        'Amount. These hands are in more than one currency, so they only add up in big blinds',
      )
      await userEvent.click(money)

      expect(within(unitSwitch()).getByRole('radio', { name: /^Big blinds/ }).getAttribute('aria-checked')).toBe('true')
      expect(within(legendEntry('Result')).getByText('+4 BB')).toBeTruthy()
    })
  })
})
