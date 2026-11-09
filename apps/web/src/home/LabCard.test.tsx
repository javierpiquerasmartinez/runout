import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, type Locale } from '../i18n'
import { SessionContext } from '../identity/context'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderHome(locale: Locale = 'en') {
  window.history.replaceState(null, '', '/')
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <Routes />
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

const ranges = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `r${index}`, name: `Range ${index}` }))
const answering = (count: number) => fakeApi({ 'GET /lab/ranges': () => Response.json(ranges(count)) })
const card = (name = 'Lab') => within(screen.getByRole('region', { name }))
const loaded = async (text: string) => within((await within(await screen.findByRole('region', { name: /^(Lab|Laboratorio)$/ })).findByText(text)).closest('section')!)

describe('Home · the Lab card', () => {
  it('shows how many Ranges the Account has, and the ways into the Lab', async () => {
    answering(27)
    renderHome()

    const lab = await loaded('ranges')
    expect(lab.getByText('27')).toBeTruthy()
    expect(lab.getByRole('heading', { name: 'Lab', level: 2 })).toBeTruthy()
    expect(lab.getByRole('link', { name: 'Lab' }).getAttribute('href')).toBe('/lab/analysis')
    expect(lab.getByRole('link', { name: 'Analysis' }).getAttribute('href')).toBe('/lab/analysis')
    expect(lab.getByRole('link', { name: 'Ranges' }).getAttribute('href')).toBe('/lab/ranges')
  })

  it('reads the Account\'s Ranges with its token', async () => {
    const calls = answering(1)
    renderHome()

    await loaded('range')
    expect(calls.filter(({ path }) => path === '/lab/ranges').map(({ token }) => token)).toEqual(['token'])
  })

  it('says "range" of just one', async () => {
    answering(1)
    renderHome()

    expect((await loaded('range')).getByText('1')).toBeTruthy()
  })

  it('leads from its title into the Lab without leaving the app', async () => {
    answering(2)
    renderHome()

    await userEvent.click((await loaded('ranges')).getByRole('link', { name: 'Lab' }))

    expect(window.location.pathname).toBe('/lab/analysis')
  })

  it('says when there are no Ranges and offers to create one', async () => {
    answering(0)
    renderHome()

    const lab = await loaded('No ranges')
    expect(lab.getByText('Build your first range.')).toBeTruthy()
    expect(lab.getByRole('link', { name: 'Create range' }).getAttribute('href')).toBe('/lab/ranges')
    expect(lab.queryByRole('link', { name: 'Analysis' })).toBeNull()
  })

  it('reads in Spanish too', async () => {
    answering(2)
    renderHome('es')

    const lab = await loaded('rangos')
    expect(lab.getByRole('link', { name: 'Laboratorio' })).toBeTruthy()
    expect(lab.getByRole('link', { name: 'Análisis' })).toBeTruthy()
    expect(lab.getByRole('link', { name: 'Rangos' })).toBeTruthy()
  })

  it('offers "Crear rango" in Spanish', async () => {
    answering(0)
    renderHome('es')

    const lab = await loaded('Ningún rango')
    expect(lab.getByText('Construye tu primer rango.')).toBeTruthy()
    expect(lab.getByRole('link', { name: 'Crear rango' })).toBeTruthy()
  })

  it('shows it is loading, title kept, until the read answers', async () => {
    let answer: (response: Response) => void = () => undefined
    fakeApi({ 'GET /lab/ranges': () => new Promise<Response>((resolve) => (answer = resolve)) })
    renderHome()

    const section = await screen.findByRole('region', { name: 'Lab' })
    expect(section.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(card().getByRole('link', { name: 'Lab' })).toBeTruthy()
    expect(card().queryByRole('link', { name: 'Analysis' })).toBeNull()

    answer(Response.json(ranges(3)))

    expect((await loaded('ranges')).getByText('3')).toBeTruthy()
    expect(section.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('shows a failed read with "Retry", which recovers it', async () => {
    let failing = true
    const calls = fakeApi({
      'GET /lab/ranges': () => (failing ? refusal(500, 'internal') : Response.json(ranges(4))),
    })
    renderHome()

    const lab = await loaded("Couldn't load this")
    expect(lab.getByText('The rest of the screen still works.')).toBeTruthy()
    expect(lab.getByRole('link', { name: 'Lab' })).toBeTruthy()
    expect(lab.queryByRole('link', { name: 'Analysis' })).toBeNull()

    failing = false
    await userEvent.click(lab.getByRole('button', { name: 'Retry' }))

    expect((await loaded('ranges')).getByText('4')).toBeTruthy()
    expect(card().queryByText("Couldn't load this")).toBeNull()
    expect(calls.filter(({ path }) => path === '/lab/ranges')).toHaveLength(2)
  })

  it('shows "Reintentar" in Spanish, with the screen still there', async () => {
    fakeApi({ 'GET /lab/ranges': () => refusal(500, 'internal') })
    renderHome('es')

    const lab = await loaded('No se ha podido cargar')
    expect(lab.getByText('El resto de la pantalla sigue funcionando.')).toBeTruthy()
    expect(lab.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Inicio', level: 1 })).toBeTruthy()
  })
})
