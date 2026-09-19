import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { ImportDialog } from './ImportDialog'
import type { ImportPreview } from './importBatch'

const hand = (board: string[], hero = 'Marta88', heroMatched = true) => ({
  hero,
  author: heroMatched ? { identityId: 'id-marta', displayName: 'Marta' } : { identityId: 'me', displayName: 'Javier' },
  heroMatched,
  playedAt: '2026-09-18T12:34:30.000Z',
  stake: { limit: 'no-limit' as const, smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  board,
  summary: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river' as const, showdown: true },
})

const previews: Record<string, ImportPreview> = {
  'session.txt': {
    id: 'p-session',
    format: 'pokerstars',
    tried: ['pokerstars'],
    hands: [hand(['2c', '10h', '4c', 'Qs', '8c']), hand([])],
    discarded: [{ text: 'not a hand history', reason: 'unrecognised-format' }],
  },
  'other.txt': {
    id: 'p-other',
    format: 'pokerstars',
    tried: ['pokerstars'],
    hands: [hand([])],
    discarded: [],
  },
  'unmatched.txt': {
    id: 'p-unmatched',
    format: 'pokerstars',
    tried: ['pokerstars'],
    hands: [hand([], 'iMapleAA', false)],
    discarded: [],
  },
  'forum.txt': { id: 'p-forum', format: null, tried: ['pokerstars'], hands: [], discarded: [] },
}

let requests: { url: string; body: FormData | string }[]

beforeEach(() => {
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: init.body as FormData | string })
      if (url.endsWith('/screen-names')) {
        const { screenNames } = JSON.parse(init.body as string)
        return Response.json({ id: 'me', displayName: 'Javier', screenNames })
      }
      if (url.endsWith('/imports/previews')) {
        const file = (init.body as FormData).get('file') as File
        return Response.json(previews[file.name], { status: 201 })
      }
      return Response.json({ imported: 3 }, { status: 201 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDialog() {
  const onClose = vi.fn()
  const onImported = vi.fn()
  const session = {
    token: 'token',
    identity: { id: 'me', displayName: 'Javier', screenNames: ['Javier_PS'] },
    rememberDisplayName: () => {},
    rememberScreenNames: vi.fn(),
  }
  render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <ImportDialog room={{ code: 'ABCD2345', name: 'Martes NL10' }} onClose={onClose} onImported={onImported} />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return { onClose, onImported, session }
}

async function choose(...names: string[]) {
  await userEvent.upload(
    screen.getByLabelText('Choose files'),
    names.map((name) => new File(['text'], name, { type: 'text/plain' })),
  )
}

describe('ImportDialog', () => {
  it('shows what each file gave, then confirms only the files kept', async () => {
    const { onImported, onClose } = renderDialog()

    await choose('session.txt', 'other.txt')

    const session = await screen.findByText('PokerStars · 2 hands · 1 discarded')
    expect(session).toBeTruthy()
    expect(await screen.findByText('PokerStars · 1 hand')).toBeTruthy()
    expect(screen.getByText('3 hands ready to add')).toBeTruthy()
    expect(screen.getByText('1 will be left out')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Remove other.txt' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 hands to the queue' }))

    expect(JSON.parse(requests.at(-1)!.body as string)).toEqual({ previews: ['p-session'] })
    expect(requests.at(-1)!.url).toBe('/api/rooms/ABCD2345/imports')
    expect(onImported).toHaveBeenCalledWith(3, 1)
    expect(onClose).toHaveBeenCalled()
  })

  it('previews each Hand’s board, Positions, final pot, Final Street and date', async () => {
    renderDialog()

    await choose('session.txt')

    const preview = await screen.findByRole('region', { name: 'Preview · hand 1 of 2' })
    expect(within(preview).getAllByRole('img').map((card) => card.getAttribute('aria-label'))).toHaveLength(5)
    expect(within(preview).getByText('BTN vs BB')).toBeTruthy()
    expect(within(preview).getByText('Pot 10.5 BB')).toBeTruthy()
    expect(within(preview).getByText('SHOWDOWN')).toBeTruthy()

    await userEvent.click(within(preview).getByRole('button', { name: 'Step through the 2 hands' }))

    expect(screen.getByRole('region', { name: 'Preview · hand 2 of 2' })).toBeTruthy()
    expect(screen.getByText('No flop')).toBeTruthy()
  })

  it('names each Hand’s Hero and Author', async () => {
    renderDialog()

    await choose('session.txt')

    const preview = await screen.findByRole('region', { name: 'Preview · hand 1 of 2' })
    expect(within(preview).getByText('Marta88')).toBeTruthy()
    expect(within(preview).getByText('Marta')).toBeTruthy()
  })

  it('offers to add a Hero nobody is recognised as to the Importer’s Screen Names', async () => {
    const { session } = renderDialog()
    await choose('unmatched.txt', 'session.txt')

    expect(await screen.findByText('Nobody in the room plays as iMapleAA, so those hands are yours.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Add iMapleAA to my screen names' }))

    expect(requests.at(-1)!.url).toBe('/api/identities/me/screen-names')
    expect(JSON.parse(requests.at(-1)!.body as string)).toEqual({ screenNames: ['Javier_PS', 'iMapleAA'] })
    expect(await screen.findByText('iMapleAA added to your screen names')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add iMapleAA to my screen names' })).toBeNull()
    expect(session.rememberScreenNames).toHaveBeenCalledWith(['Javier_PS', 'iMapleAA'])
  })

  it('opens a discarded Hand’s original text and reason', async () => {
    renderDialog()
    await choose('session.txt')

    await userEvent.click(await screen.findByRole('button', { name: 'See the discarded one' }))

    const discarded = screen.getByRole('region', { name: 'Discarded from session.txt' })
    expect(within(discarded).getByText('Format not recognised')).toBeTruthy()
    expect(within(discarded).getByText('not a hand history')).toBeTruthy()
  })

  it('says which formats were tried when none was recognised, and reads the file again in the one picked', async () => {
    renderDialog()
    await choose('forum.txt')

    expect(await screen.findByText('Format not recognised · tried: PokerStars')).toBeTruthy()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Choose the format of forum.txt' }), 'pokerstars')

    const reread = requests.at(-1)!.body as FormData
    expect(reread.get('format')).toBe('pokerstars')
    expect((reread.get('file') as File).name).toBe('forum.txt')
  })

  it('refuses a file over 20 MB without sending it', async () => {
    renderDialog()
    const huge = new File(['x'], 'huge.zip')
    Object.defineProperty(huge, 'size', { value: 20 * 1024 * 1024 + 1 })

    await userEvent.upload(screen.getByLabelText('Choose files'), huge)

    expect(await screen.findByText('The file is over 20 MB.')).toBeTruthy()
    expect(requests).toEqual([])
  })
})
