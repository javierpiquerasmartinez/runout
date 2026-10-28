import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import { SessionContext } from '../identity/context'
import { fakeSession } from '../test/fakeSession'
import { HAND_CLASSES } from './range'
import { LabRangesPage } from './LabRangesPage'

afterEach(() => window.history.replaceState(null, '', '/'))

function renderLab(locale: Locale = 'en') {
  window.history.replaceState(null, '', '/lab/ranges')
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <LabRangesPage />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

const matrix = () => screen.getByRole('group', { name: 'Range matrix' })
const cell = (name: string) => within(matrix()).getByRole('button', { name })
const stats = () => screen.getByRole('region', { name: 'Range stats' })
/** The stats as one line of text, as read block by block, spaces collapsed. */
const textOf = (region: HTMLElement) =>
  Array.from(region.querySelectorAll('p, dt, dd'), (block) => block.textContent!.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
const statsText = () => textOf(stats())

describe('LabRangesPage · entering the Lab', () => {
  it('shows an empty matrix of every Hand Class, aces top-left', () => {
    renderLab()

    const cells = within(matrix()).getAllByRole('button')
    expect(cells.map((button) => button.textContent)).toEqual(HAND_CLASSES.map((handClass) => handClass.name))
    expect(cells.slice(0, 3).map((button) => button.textContent)).toEqual(['AA', 'AKs', 'AQs'])
    expect(cells.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('offers a new Range in the side column', () => {
    renderLab()

    expect(screen.getByRole('button', { name: 'New range' })).toBeTruthy()
  })

  it('starts the stats at nothing', () => {
    renderLab()

    expect(statsText()).toBe(
      '0.0 % of all combos 0.0 of 1326 combos ' +
        'Pairs 0.0 / 78 — Suited 0.0 / 312 — Offsuit 0.0 / 936 —',
    )
  })
})

describe('LabRangesPage · toggling cells', () => {
  it('puts a cell in the Range at 100 % with a click, and takes it out with another', async () => {
    renderLab()

    await userEvent.click(cell('AKs'))
    expect(cell('AKs').getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(cell('AKs'))
    expect(cell('AKs').getAttribute('aria-pressed')).toBe('false')
  })

  it('updates the stats on every change', async () => {
    renderLab()

    await userEvent.click(cell('AA'))
    await userEvent.click(cell('AKs'))
    await userEvent.click(cell('AKo'))

    // 6 + 4 + 12 = 22 Combos, 1.659… % of 1326.
    expect(statsText()).toBe(
      '1.7 % of all combos 22.0 of 1326 combos ' +
        'Pairs 6.0 / 78 27.3 % of the range Suited 4.0 / 312 18.2 % of the range Offsuit 12.0 / 936 54.5 % of the range',
    )

    await userEvent.click(cell('AKo'))
    expect(statsText()).toContain('10.0 of 1326 combos')
    expect(statsText()).toContain('Offsuit 0.0 / 936 0.0 % of the range')
  })

  it('empties the matrix with Clear', async () => {
    renderLab()
    await userEvent.click(cell('AA'))
    await userEvent.click(cell('72o'))

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(within(matrix()).getAllByRole('button').some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(false)
    expect(statsText()).toContain('0.0 of 1326 combos')
  })
})

describe('LabRangesPage · in Spanish', () => {
  it('names the controls and the stats in Spanish', async () => {
    renderLab('es')

    await userEvent.click(within(screen.getByRole('group', { name: 'Matriz del rango' })).getByRole('button', { name: 'AA' }))

    expect(screen.getByRole('button', { name: 'Nuevo rango' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeTruthy()
    const text = textOf(screen.getByRole('region', { name: 'Estadísticas del rango' }))
    expect(text).toContain('0,5 % del total')
    expect(text).toContain('6,0 de 1326 combos')
    expect(text).toContain('Parejas 6,0 / 78 100,0 % del rango')
  })
})
