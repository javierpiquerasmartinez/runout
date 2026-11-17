import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SessionContext } from '../identity/context'
import { ImportDialog } from './ImportDialog'
import type { ImportDestination, ImportPreview } from './importBatch'
import type { Identity } from '../identity/identity'
import { fakeSession } from '../test/fakeSession'

const hand = (board: string[], hero = 'Marta88', heroMatched = true) => ({
  hero,
  heroNamed: true,
  author: heroMatched ? { identityId: 'id-marta', displayName: 'Marta' } : { identityId: 'me', displayName: 'Javier' },
  heroMatched,
  playedAt: '2026-09-18T12:34:30.000Z',
  stake: { limit: 'no-limit' as const, smallBlind: 5, bigBlind: 10, currency: 'EUR' },
  board,
  overview: { positions: ['BTN', 'BB'], finalPot: 105, finalStreet: 'river' as const, showdown: true },
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
  'mine.txt': {
    id: 'p-mine',
    format: 'pokerstars',
    tried: ['pokerstars'],
    hands: [{ ...hand([], 'iMapleAA'), author: undefined, heroMatched: undefined }],
    discarded: [{ text: 'a hand already kept', reason: 'duplicate' }],
  },
  'kept.txt': {
    id: 'p-kept',
    format: 'pokerstars',
    tried: ['pokerstars'],
    hands: [{ ...hand([]), inLibrary: true }, { ...hand([]), inLibrary: false }],
    discarded: [],
  },
  'forum.txt': { id: 'p-forum', format: null, tried: ['pokerstars'], hands: [], discarded: [] },
  'fifty.txt': many('p-fifty', 50),
  'one.txt': many('p-one', 1),
  'big.txt': many('p-big', 1240),
}

function many(id: string, count: number): ImportPreview {
  return { id, format: 'pokerstars', tried: ['pokerstars'], hands: Array.from({ length: count }, () => hand([])), discarded: [] }
}

/** What the server answers a confirm with; a pending one leaves the dialog confirming. */
let confirmed: () => Promise<Response>

let requests: { url: string; body: FormData | string }[]

/** What the server answers a preview of the file named with; a pending one leaves it reading. */
let previewed: (name: string) => Promise<Response>

beforeEach(() => {
  requests = []
  confirmed = async () => Response.json({ imported: 3 }, { status: 201 })
  previewed = async (name) => Response.json(previews[name], { status: 201 })
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
        return previewed(file.name)
      }
      return confirmed()
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDialog(
  destination: ImportDestination = { kind: 'room', code: 'ABCD2345', name: 'Martes NL10' },
  identity: Partial<Identity> = {},
) {
  const onClose = vi.fn()
  const onImported = vi.fn()
  const session = fakeSession({ screenNames: ['Javier_PS'], ...identity })
  const { unmount } = render(
    <I18nProvider initialLocale="en">
      <SessionContext.Provider value={session}>
        <ImportDialog destination={destination} onClose={onClose} onImported={onImported} />
      </SessionContext.Provider>
    </I18nProvider>,
  )
  return { onClose, onImported, session, unmount }
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

  it('reads the files one at a time, so that the server reads one export at once', async () => {
    const answers = new Map<string, (response: Response) => void>()
    previewed = (name) => new Promise((resolve) => answers.set(name, resolve))
    const previewsSent = () => requests.filter((request) => request.url.endsWith('/previews')).map((request) => (request.body as FormData).get('file') as File).map((file) => file.name)
    renderDialog()

    await choose('session.txt', 'other.txt')

    await waitFor(() => expect(previewsSent()).toEqual(['session.txt']))
    answers.get('session.txt')!(Response.json(previews['session.txt'], { status: 201 }))
    await waitFor(() => expect(previewsSent()).toEqual(['session.txt', 'other.txt']))
    answers.get('other.txt')!(Response.json(previews['other.txt'], { status: 201 }))
    expect(await screen.findByText('3 hands ready to add')).toBeTruthy()
  })

  it('reads no more of the files once it is closed', async () => {
    const answers = new Map<string, (response: Response) => void>()
    previewed = (name) => new Promise((resolve) => answers.set(name, resolve))
    const { unmount } = renderDialog()

    await choose('session.txt', 'other.txt')
    await waitFor(() => expect(answers.has('session.txt')).toBe(true))
    unmount()
    answers.get('session.txt')!(Response.json(previews['session.txt'], { status: 201 }))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(requests.filter((request) => request.url.endsWith('/previews'))).toHaveLength(1)
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

  it('tells which Hands are already in the Importer’s Library, as confirming queues those', async () => {
    renderDialog()

    await choose('kept.txt')

    expect(await screen.findByText('PokerStars · 2 hands · 1 from your library')).toBeTruthy()
    const preview = screen.getByRole('region', { name: 'Preview · hand 1 of 2' })
    expect(within(preview).getByText('In your library')).toBeTruthy()

    await userEvent.click(within(preview).getByRole('button', { name: 'Step through the 2 hands' }))

    const next = screen.getByRole('region', { name: 'Preview · hand 2 of 2' })
    expect(within(next).queryByText('In your library')).toBeNull()
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

  describe('from the Library', () => {
    afterEach(() => {
      window.history.pushState(null, '', '/')
    })

    it('sends an Account to pick Hands of their Library for the Room', async () => {
      renderDialog()

      await userEvent.click(screen.getByRole('tab', { name: 'From my library' }))
      await userEvent.click(screen.getByRole('button', { name: 'Choose from my library' }))

      expect(window.location.pathname).toBe('/room/ABCD2345/library')
    })

    it('offers nothing of the kind to an anonymous Participant, who has no Library', () => {
      renderDialog(undefined, { account: null, room: { code: 'ABCD2345' } })

      expect(screen.queryByRole('tab', { name: 'From my library' })).toBeNull()
    })

    it('offers nothing of the kind when importing into the Library itself', () => {
      renderDialog({ kind: 'library' })

      expect(screen.queryByRole('tab', { name: 'From my library' })).toBeNull()
    })
  })

  describe('into the Library', () => {
    const library: ImportDestination = { kind: 'library' }

    it('reads into a Library preview and confirms into the Library', async () => {
      const { onImported } = renderDialog(library)

      expect(screen.getByRole('heading', { name: 'Import hands into your library' })).toBeTruthy()
      await choose('mine.txt')

      expect(await screen.findByText('PokerStars · 1 hand · 1 already in your library')).toBeTruthy()
      expect(requests[0].url).toBe('/api/library/imports/previews')
      await userEvent.click(screen.getByRole('button', { name: 'Add 1 hand to your library' }))

      expect(requests.at(-1)!.url).toBe('/api/library/imports')
      expect(JSON.parse(requests.at(-1)!.body as string)).toEqual({ previews: ['p-mine'] })
      expect(onImported).toHaveBeenCalledWith(3, 1)
    })

    it('names the Hero, with no Author and no Screen Name offer', async () => {
      renderDialog(library)

      await choose('mine.txt')

      const preview = await screen.findByRole('region', { name: 'Preview · hand 1 of 1' })
      expect(within(preview).getByText('iMapleAA')).toBeTruthy()
      expect(within(preview).queryByText('Author')).toBeNull()
      expect(screen.queryByText('Hero detected')).toBeNull()
    })
  })

  describe('how many Hands one import takes', () => {
    it('blocks confirming more than 50 Hands into a Room, and says why', async () => {
      renderDialog()

      await choose('fifty.txt', 'one.txt')

      expect(await screen.findByText('This import has 51 hands; a room takes at most 50')).toBeTruthy()
      await userEvent.click(screen.getByRole('button', { name: 'This import has 51 hands; a room takes at most 50' }))
      expect(requests.filter((request) => request.url.endsWith('/imports'))).toEqual([])
    })

    it('confirms 50 Hands into a Room', async () => {
      renderDialog()

      await choose('fifty.txt')
      await userEvent.click(await screen.findByRole('button', { name: 'Add 50 hands to the queue' }))

      expect(requests.at(-1)!.url).toBe('/api/rooms/ABCD2345/imports')
    })

    it('explains a Library its Plan cannot let hold the Hands, with how many it holds and how many it adds', async () => {
      confirmed = async () =>
        Response.json({ reason: 'library-full', hands: 1_500, held: 19_200, limit: 20_000, plan: 'beta' }, { status: 409 })
      renderDialog({ kind: 'library' })

      await choose('mine.txt')
      await userEvent.click(await screen.findByRole('button', { name: 'Add 1 hand to your library' }))

      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        'Your Beta plan holds up to 20,000 hands in your library. You have 19,200 and this import adds 1,500.',
      )
    })

    it('explains a Library no Plan limits that cannot hold the Hands', async () => {
      confirmed = async () =>
        Response.json({ reason: 'library-full', hands: 3, held: 9_999_999, limit: 10_000_000, plan: null }, { status: 409 })
      renderDialog({ kind: 'library' })

      await choose('mine.txt')
      await userEvent.click(await screen.findByRole('button', { name: 'Add 1 hand to your library' }))

      expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Your library cannot hold more than 10 million hands.')
    })
  })

  describe('while Hands are being saved', () => {
    let finish: (response: Response) => void

    beforeEach(() => {
      confirmed = () => new Promise((resolve) => (finish = resolve))
    })

    async function startConfirming() {
      const rendered = renderDialog({ kind: 'library' })
      await choose('big.txt')
      await userEvent.click(await screen.findByRole('button', { name: 'Add 1240 hands to your library' }))
      return rendered
    }

    it('says how many Hands it is importing', async () => {
      await startConfirming()

      expect(screen.getByText('Importing 1,240 hands…')).toBeTruthy()
    })

    it('says so of a single Hand too', async () => {
      confirmed = () => new Promise(() => {})
      renderDialog({ kind: 'library' })
      await choose('one.txt')
      await userEvent.click(await screen.findByRole('button', { name: 'Add 1 hand to your library' }))

      expect(screen.getByText('Importing 1 hand…')).toBeTruthy()
    })

    it('opens again if the browser closes it anyway', async () => {
      const { onClose } = await startConfirming()
      const dialog = screen.getByRole('dialog') as HTMLDialogElement

      dialog.close()

      await waitFor(() => expect(dialog.open).toBe(true))
      expect(onClose).not.toHaveBeenCalled()
    })

    it('cannot be closed from its buttons or Escape', async () => {
      const { onClose } = await startConfirming()

      await userEvent.click(screen.getByRole('button', { name: /^Close/ }))
      await userEvent.click(screen.getByRole('button', { name: /^Cancel/ }))
      pressEscape()

      expect(onClose).not.toHaveBeenCalled()
    })

    it('warns before leaving the page, and only then', async () => {
      await startConfirming()

      expect(leaving().defaultPrevented).toBe(true)

      finish(Response.json({ reason: 'network' }, { status: 503 }))
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(leaving().defaultPrevented).toBe(false)
    })

    it('closes again once confirming fails', async () => {
      const { onClose } = await startConfirming()

      finish(Response.json({ reason: 'preview-not-found' }, { status: 404 }))
      await screen.findByRole('alert')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(onClose).toHaveBeenCalled()
    })

    it('closes as before while files are read or previewed', async () => {
      const { onClose } = renderDialog({ kind: 'library' })
      expect(leaving().defaultPrevented).toBe(false)

      await choose('big.txt')
      await screen.findByText('PokerStars · 1240 hands')
      expect(leaving().defaultPrevented).toBe(false)
      pressEscape()

      expect(onClose).toHaveBeenCalled()
    })
  })
})

/** Escape on a modal dialog, which the browser turns into its `cancel` event (jsdom does not). */
function pressEscape() {
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
}

/** Asks to leave the page, as closing or reloading the tab does. */
function leaving(): Event {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}
