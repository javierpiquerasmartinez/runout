import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, type Locale } from '../i18n'
import { SessionContext } from '../identity/context'
import { PreferencesContext } from '../preferences/context'
import { DEFAULT_PREFERENCES, type Preferences } from '../preferences/preferences'
import { Routes } from '../routes/Routes'
import { fakeApi, refusal, type ApiCall } from '../test/fakeApi'
import { fakeSession } from '../test/fakeSession'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

function renderHome(locale: Locale = 'en', preferences: Partial<Preferences> = {}) {
  window.history.replaceState(null, '', '/')
  render(
    <I18nProvider initialLocale={locale}>
      <SessionContext.Provider value={fakeSession()}>
        <PreferencesContext.Provider value={{ ...DEFAULT_PREFERENCES, ...preferences }}>
          <Routes />
        </PreferencesContext.Provider>
      </SessionContext.Provider>
    </I18nProvider>,
  )
}

interface Month {
  hands?: number
  currency?: string | null
  bigBlinds?: number
  amounts?: number | null
  /** Where the Result stood at each point, in big blinds, one point per Hand. */
  line?: number[]
}

function results({ hands = 3482, currency = 'EUR', bigBlinds = 146.5, amounts = 7325, line = [50, 146.5] }: Month = {}) {
  const lines = (result: number) => ({ result, allInEv: result + 9, showdown: result - 7, nonShowdown: 3 })
  return {
    hands,
    currency,
    totals: { bigBlinds: lines(bigBlinds), amounts: amounts === null ? null : lines(amounts) },
    start: { bigBlinds: lines(0), amounts: amounts === null ? null : lines(0) },
    zoom: null,
    rakeGenerated: { bigBlinds: 0, amounts: null },
    points: line.map((value, index) => ({
      hand: Math.round(((index + 1) / line.length) * hands),
      handId: `h${index}`,
      holeCards: [],
      bigBlinds: lines(value),
      amounts: amounts === null ? null : lines(value * 50),
    })),
  }
}

const answering = (month: Month = {}) => fakeApi({ 'GET /library/results': () => Response.json(results(month)) })
const loaded = async (text: string) => within((await screen.findByText(text)).closest('section')!)
const figure = (label: string) => screen.getByText(label).nextElementSibling?.textContent

describe('Home · the Library card', () => {
  it('shows the Hands, Result and Win Rate of the month it names', async () => {
    answering()
    renderHome()

    const library = await loaded('Hands')
    expect(library.getByText('November')).toBeTruthy()
    expect(figure('Hands')).toBe('3,482')
    expect(figure('Result')).toBe('+146.5 BB')
    expect(figure('Win rate')).toBe('4.21')
  })

  it('reads the Hands played this month, in the viewer\'s days', async () => {
    const calls: ApiCall[] = answering()
    renderHome()

    await loaded('Hands')
    const [read] = calls.filter(({ path }) => path === '/library/results')
    const query = new URLSearchParams(read.search)
    expect(query.get('from')).toBe(new Date(2026, 10, 1).toISOString())
    expect(query.get('to')).toBe(new Date(2026, 10, 8).toISOString())
    expect(read.token).toBe('token')
  })

  it('shows the Result as an Amount when that is the Display Unit, and the Win Rate still in big blinds', async () => {
    answering({ amounts: 7325 })
    renderHome('en', { displayUnit: 'amount' })

    const library = await loaded('Hands')
    expect(library.getByText('+€73.25')).toBeTruthy()
    expect(library.getByText('4.21')).toBeTruthy()
  })

  it('shows the Result in big blinds when the month mixes currencies, whatever the Display Unit', async () => {
    answering({ currency: null, amounts: null })
    renderHome('en', { displayUnit: 'amount' })

    expect((await loaded('Hands')).getByText('+146.5 BB')).toBeTruthy()
  })

  it('reads "both" as the Library list does: big blinds, and the Amount beside them', async () => {
    answering()
    renderHome('en', { displayUnit: 'both' })

    const library = await loaded('Hands')
    expect(library.getByText('+146.5 BB')).toBeTruthy()
    expect(library.getByText('+€73.25')).toBeTruthy()
  })

  it('reads "both" as big blinds alone when the month mixes currencies', async () => {
    answering({ currency: null, amounts: null })
    renderHome('en', { displayUnit: 'both' })

    const library = await loaded('Hands')
    expect(figure('Result')).toBe('+146.5 BB')
    expect(library.queryByText(/€/)).toBeNull()
  })

  it('reads in Spanish, month and numbers included', async () => {
    answering()
    renderHome('es')

    const library = await loaded('Manos')
    expect(library.getByText('Noviembre')).toBeTruthy()
    expect(figure('Manos')).toBe('3.482')
    expect(figure('Resultado')).toBe('+146,5 BB')
    expect(figure('Win rate')).toBe('4,21')
  })

  it('leads from its title to the Library on the current month', async () => {
    answering()
    renderHome()

    await userEvent.click((await loaded('Hands')).getByRole('link', { name: 'Library' }))

    expect(window.location.pathname).toBe('/library')
    expect(window.location.search).toBe('?from=2026-11-01&to=2026-11-07')
  })

  it('still names the month while it loads', async () => {
    fakeApi({ 'GET /library/results': () => new Promise<Response>(() => {}) })
    renderHome()

    const library = within(await screen.findByRole('region', { name: 'Library' }))
    expect(library.getByText('November')).toBeTruthy()
    expect(library.queryByText('Hands')).toBeNull()
  })

  describe('with no Hands this month', () => {
    const noneThisMonth = (total: number) =>
      fakeApi({
        'GET /library/results': () => Response.json(results({ hands: 0, currency: null, bigBlinds: 0, amounts: 0, line: [] })),
        'GET /library/hands': () =>
          Response.json({
            total,
            page: 1,
            pageSize: 1,
            hands: [],
            options: { sites: [], heroes: [], stakes: [], tags: [] },
            counts: { all: total, marked: 0 },
          }),
      })

    it('says so when earlier months have some, and leads to the whole Library', async () => {
      noneThisMonth(12)
      renderHome()

      const library = await loaded('No hands in November')
      expect(library.getByText('The hands you played in other months are still in your library.')).toBeTruthy()
      expect(library.getByText('November')).toBeTruthy()
      expect(library.queryByRole('img')).toBeNull()

      await userEvent.click(library.getByRole('link', { name: 'See library' }))

      expect(window.location.pathname).toBe('/library')
      expect(window.location.search).toBe('?period=all')
    })

    it('keeps "Import" in its head when earlier months have some', async () => {
      noneThisMonth(12)
      renderHome()

      expect((await loaded('No hands in November')).getByRole('button', { name: 'Import' })).toBeTruthy()
    })

    it('says so and offers to import when there are no Hands at all', async () => {
      noneThisMonth(0)
      renderHome()

      const library = await loaded('No hands yet')
      expect(library.getByText('Import your hand histories and see how your month is going here: hands, result and graph.')).toBeTruthy()
      expect(library.getByRole('button', { name: 'Import hands' })).toBeTruthy()
      expect(library.queryByRole('button', { name: 'Import' })).toBeNull()
      expect(library.queryByRole('link', { name: 'See library' })).toBeNull()
    })

    it('asks the whole Library, with no period and for as little as it can', async () => {
      const calls = noneThisMonth(12)
      renderHome()

      await loaded('No hands in November')
      const [read] = calls.filter(({ path }) => path === '/library/hands')
      expect(read.search).toBe('?page=1&pageSize=1')
    })

    it('reads in Spanish', async () => {
      noneThisMonth(12)
      renderHome('es')

      const library = await loaded('Sin manos en noviembre')
      expect(library.getByText('Las manos que jugaste otros meses siguen en tu biblioteca.')).toBeTruthy()
      expect(library.getByRole('link', { name: 'Ver biblioteca' })).toBeTruthy()
      expect(library.getByRole('button', { name: 'Importar' })).toBeTruthy()
    })

    it('offers "Importar manos" in Spanish', async () => {
      noneThisMonth(0)
      renderHome('es')

      const library = await loaded('Aún no tienes manos')
      expect(library.getByText('Importa tus historiales y aquí verás cómo te va el mes: manos, resultado y gráfica.')).toBeTruthy()
      expect(library.getByRole('button', { name: 'Importar manos' })).toBeTruthy()
    })
  })

  it('does not ask the whole Library when the month has Hands', async () => {
    const calls = answering()
    renderHome()

    await loaded('Hands')
    expect(calls.some(({ path }) => path === '/library/hands')).toBe(false)
  })

  it('keeps "Import" in its head with Hands to show', async () => {
    answering()
    renderHome()

    expect((await loaded('Hands')).getByRole('button', { name: 'Import' })).toBeTruthy()
  })

  describe('importing from Home', () => {
    const importDialog = () => screen.getByRole('dialog', { name: 'Import hands into your library' })
    const preview = { id: 'p1', format: 'pokerstars', tried: ['pokerstars'], discarded: [], hands: [] as unknown[] }
    const previewHand = {
      hero: 'Marta88',
      heroNamed: true,
      playedAt: '2026-09-18T12:34:30.000Z',
      stake: { limit: 'no-limit', smallBlind: 5, bigBlind: 10, currency: 'EUR' },
      board: [],
      overview: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river', showdown: true },
    }
    const importAnswers = {
      'POST /library/imports/previews': () => Response.json({ ...preview, hands: [previewHand] }, { status: 201 }),
      'POST /library/imports': () => Response.json({ imported: 1 }, { status: 201 }),
    }
    const reads = (calls: ApiCall[]) => calls.filter(({ method, path }) => method === 'GET' && path === '/library/results')

    async function importOneHand() {
      const file = new File(['a hand history'], 'session.txt', { type: 'text/plain' })
      await userEvent.upload(within(importDialog()).getByLabelText('Choose files'), file)
      await userEvent.click(await within(importDialog()).findByRole('button', { name: 'Add 1 hand to your library' }))
    }

    it('opens the Library\'s import dialog from "Import", staying on Home', async () => {
      answering()
      renderHome()

      await userEvent.click((await loaded('Hands')).getByRole('button', { name: 'Import' }))

      expect(within(importDialog()).getByRole('button', { name: 'Choose files' })).toBeTruthy()
      expect(window.location.pathname).toBe('/')
    })

    it('opens it from "Import hands" when the Library is empty', async () => {
      fakeApi({
        'GET /library/results': () => Response.json(results({ hands: 0, line: [] })),
        'GET /library/hands': () => Response.json({ total: 0, hands: [] }),
      })
      renderHome()

      await userEvent.click((await loaded('No hands yet')).getByRole('button', { name: 'Import hands' }))

      expect(importDialog()).toBeTruthy()
      expect(window.location.pathname).toBe('/')
    })

    it('stays on Home when an import finishes, and the card reloads with the new Hands', async () => {
      let month: Month = { hands: 10, bigBlinds: 5, line: [5] }
      const calls = fakeApi({
        'GET /library/results': () => Response.json(results(month)),
        ...importAnswers,
        'POST /library/imports': () => {
          month = { hands: 11, bigBlinds: 8, line: [5, 8] }
          return Response.json({ imported: 1 }, { status: 201 })
        },
      })
      renderHome()

      await userEvent.click((await loaded('Hands')).getByRole('button', { name: 'Import' }))
      await importOneHand()

      await waitFor(() => expect(figure('Hands')).toBe('11'))
      expect(figure('Result')).toBe('+8 BB')
      expect(screen.queryByRole('dialog', { name: 'Import hands into your library' })).toBeNull()
      expect(window.location.pathname).toBe('/')
      expect(reads(calls)).toHaveLength(2)
    })

    it('leaves the month as it was when the imported Hands are from earlier months', async () => {
      const calls = fakeApi({ 'GET /library/results': () => Response.json(results({ hands: 10, bigBlinds: 5, line: [5] })), ...importAnswers })
      renderHome()

      await userEvent.click((await loaded('Hands')).getByRole('button', { name: 'Import' }))
      await importOneHand()

      await waitFor(() => expect(reads(calls)).toHaveLength(2))
      await screen.findByText('Hands')
      expect(figure('Hands')).toBe('10')
      expect(figure('Result')).toBe('+5 BB')
    })

    it('tells a first import of earlier months apart from a Library still empty', async () => {
      let total = 0
      fakeApi({
        'GET /library/results': () => Response.json(results({ hands: 0, line: [] })),
        'GET /library/hands': () => Response.json({ total, hands: [] }),
        ...importAnswers,
        'POST /library/imports': () => {
          total = 1
          return Response.json({ imported: 1 }, { status: 201 })
        },
      })
      renderHome()

      await userEvent.click((await loaded('No hands yet')).getByRole('button', { name: 'Import hands' }))
      await importOneHand()

      expect(await screen.findByText('No hands in November')).toBeTruthy()
      expect(screen.queryByText('No hands yet')).toBeNull()
    })

    it('closes without reading again when cancelled', async () => {
      const calls = answering()
      renderHome()

      await userEvent.click((await loaded('Hands')).getByRole('button', { name: 'Import' }))
      await userEvent.click(within(importDialog()).getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog', { name: 'Import hands into your library' })).toBeNull()
      expect(figure('Hands')).toBe('3,482')
      expect(reads(calls)).toHaveLength(1)
    })
  })

  describe('when a read fails', () => {
    const failed = () => within(screen.getByRole('region', { name: 'Library' }))

    it('offers to retry, leaves the other cards working, and recovers', async () => {
      let refused = true
      fakeApi({
        'GET /library/results': () => (refused ? refusal(500, 'boom') : Response.json(results())),
        'GET /lab/ranges': () => Response.json([{ id: 'r1', name: 'Open' }]),
      })
      renderHome()

      await failed().findByText("Couldn't load this")
      expect(await screen.findByText('range')).toBeTruthy()
      expect(failed().queryByRole('button', { name: 'Import' })).toBeNull()

      refused = false
      await userEvent.click(failed().getByRole('button', { name: 'Retry' }))

      await loaded('Hands')
      expect(figure('Hands')).toBe('3,482')
    })

    it('fails too when it cannot tell whether there are Hands in other months', async () => {
      fakeApi({
        'GET /library/results': () => Response.json(results({ hands: 0, currency: null, bigBlinds: 0, amounts: 0, line: [] })),
        'GET /library/hands': () => refusal(500, 'boom'),
      })
      renderHome()

      await failed().findByText("Couldn't load this")
      expect(failed().queryByText('No hands yet')).toBeNull()
    })
  })

  describe('its small graph', () => {
    const graphOf = async (name: RegExp) => {
      await loaded('Hands')
      return screen.findByRole('img', { name })
    }
    /** The y of each point of the line, from the first to the last. */
    const heights = (graph: HTMLElement) =>
      [...graph.querySelector('path')!.getAttribute('d')!.matchAll(/[\d.]+ ([\d.]+)/g)].map(([, y]) => Number(y))
    const zeroHeight = (graph: HTMLElement) => Number(graph.querySelector('line')!.getAttribute('y1'))

    it('says in words how the month ended', async () => {
      answering()
      renderHome()

      expect(await graphOf(/^November's Result, hand by hand: ends at \+146\.5 BB$/)).toBeTruthy()
    })

    it("is drawn at a phone's own size on a narrow screen, so that its figures aren't shrunk to fit", async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 760px)', addEventListener() {}, removeEventListener() {} }))
      answering({ line: [50, 146.5] })
      renderHome()

      const graph = await graphOf(/Result/)
      expect(graph.getAttribute('viewBox')).toBe('0 0 320 130')
      expect(graph.querySelector('line')!.getAttribute('x2')).toBe('320')
      expect(within(graph).getByText('Hand 1').getAttribute('y')).toBe('126')
      expect(heights(graph).at(-1)).toBe(12)
    })

    it('is drawn at the wide size everywhere else', async () => {
      vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
      answering()
      renderHome()

      expect((await graphOf(/Result/)).getAttribute('viewBox')).toBe('0 0 734 250')
    })

    it('draws the Result alone, from 0 at its start, one step per point', async () => {
      answering({ line: [50, -20, 146.5] })
      renderHome()

      const graph = await graphOf(/Result/)
      expect(graph.querySelectorAll('path')).toHaveLength(1)
      const [start, up, down, end] = heights(graph)
      expect(start).toBe(zeroHeight(graph))
      expect(up).toBeLessThan(start)
      expect(down).toBeGreaterThan(start)
      expect(end).toBeLessThan(up)
    })

    it('runs the line in the colour the person chose for the Result', async () => {
      answering()
      renderHome('en', { resultColour: 'violet' })

      expect((await graphOf(/Result/)).querySelector('path')!.getAttribute('stroke')).toBe('var(--graph-violet)')
    })

    it('says where the Hands start and end, and marks 0 and a round figure', async () => {
      answering()
      renderHome()

      const graph = within(await graphOf(/Result/))
      expect(graph.getByText('Hand 1')).toBeTruthy()
      expect(graph.getByText('3,482')).toBeTruthy()
      expect(graph.getByText('0')).toBeTruthy()
      expect(graph.getByText('+100')).toBeTruthy()
    })

    it('marks a round figure below 0 when the month mostly lost', async () => {
      answering({ bigBlinds: -62, amounts: -3100, line: [10, -62] })
      renderHome()

      expect(within(await graphOf(/-62 BB/)).getByText('-50')).toBeTruthy()
    })

    it('draws the Amounts when the Result reads in them', async () => {
      answering({ bigBlinds: 146.5, amounts: 7325, line: [50, 146.5] })
      renderHome('en', { displayUnit: 'amount' })

      const graph = await graphOf(/ends at \+€73\.25$/)
      expect(within(graph).getByText('+€50')).toBeTruthy()
    })

    it('stays flat on 0 when the month has broken even', async () => {
      answering({ bigBlinds: 0, amounts: 0, line: [0, 0] })
      renderHome()

      const graph = await graphOf(/Result/)
      expect(new Set(heights(graph))).toEqual(new Set([zeroHeight(graph)]))
      expect(graph.querySelectorAll('line')).toHaveLength(1)
    })
  })
})
