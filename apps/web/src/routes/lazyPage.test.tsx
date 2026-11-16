import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { lazyPage } from './lazyPage'
import { ScreenBoundary } from './ScreenBoundary'

function Hello({ name }: { name: string }) {
  return <p>Hello, {name}</p>
}

const shown = (page: ReturnType<typeof lazyPage<{ name: string }>>) => {
  const Page = page
  return render(
    <Suspense fallback={<p>Waiting</p>}>
      <Page name="Ana" />
    </Suspense>,
  )
}

describe('a screen loaded by its route', () => {
  it('shows what stands in for it until its chunk arrives, then the screen', async () => {
    let arrive = (_page: typeof Hello) => {}
    const page = lazyPage(() => new Promise<typeof Hello>((resolve) => (arrive = resolve)))

    shown(page)
    expect(screen.getByText('Waiting')).toBeTruthy()

    await act(async () => arrive(Hello))
    expect(screen.getByText('Hello, Ana')).toBeTruthy()
  })

  it('is on screen in its first render once it has been preloaded', async () => {
    const page = lazyPage(async () => Hello)
    await page.preload()

    shown(page)

    expect(screen.getByText('Hello, Ana')).toBeTruthy()
    expect(screen.queryByText('Waiting')).toBeNull()
  })

  it('asks for its chunk once, however often it is preloaded or shown', async () => {
    let asked = 0
    const page = lazyPage(async () => {
      asked++
      return Hello
    })

    await Promise.all([page.preload(), page.preload()])
    shown(page)

    expect(asked).toBe(1)
  })
})

describe('a screen whose chunk fails to arrive', () => {
  // As after a deploy, in a tab left open: the chunk this build of the app names is no longer there.
  const gone = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
  const reload = vi.fn()

  const shownWithin = (page: ReturnType<typeof lazyPage<{ name: string }>>) => {
    const Page = page
    return render(
      <I18nProvider initialLocale="en">
        <ScreenBoundary reload={reload}>
          <Suspense fallback={<p>Waiting</p>}>
            <Page name="Ana" />
          </Suspense>
        </ScreenBoundary>
      </I18nProvider>,
    )
  }

  beforeEach(() => {
    reload.mockClear()
    window.sessionStorage.clear()
    // React logs what a boundary catches.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reloads the page, once, to pick up the build that is there now', async () => {
    await act(async () => void shownWithin(lazyPage<{ name: string }>(gone)))

    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so when reloading did not help, and shows the screen once trying again finds it', async () => {
    let there = false
    const page = lazyPage<{ name: string }>(() => (there ? Promise.resolve(Hello) : gone()))
    const first = await act(async () => shownWithin(page))
    first.unmount()

    // The page as it is after its reload: the chunk is still not there.
    await act(async () => void shownWithin(page))

    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toBe("We couldn't load this screen. Check your connection and try again.")

    there = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Hello, Ana')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks for the screen again at another path, without being told to', async () => {
    let there = false
    const page = lazyPage<{ name: string }>(() => (there ? Promise.resolve(Hello) : gone()))
    const Page = page
    const at = (path: string) => (
      <I18nProvider initialLocale="en">
        <ScreenBoundary reload={reload} at={path}>
          <Suspense fallback={<p>Waiting</p>}>
            <Page name="Ana" />
          </Suspense>
        </ScreenBoundary>
      </I18nProvider>
    )
    window.sessionStorage.setItem('runout.reloadedForScreen', '1')
    const { rerender } = await act(async () => render(at('/library')))
    expect(screen.getByRole('alert')).toBeTruthy()

    there = true
    await act(async () => rerender(at('/rooms')))

    expect(screen.getByText('Hello, Ana')).toBeTruthy()
  })

  it('reloads again for a later failure, once a screen has arrived in between', async () => {
    const first = await act(async () => shownWithin(lazyPage<{ name: string }>(gone)))
    first.unmount()
    const arrived = await act(async () => shownWithin(lazyPage<{ name: string }>(async () => Hello)))
    arrived.unmount()

    await act(async () => void shownWithin(lazyPage<{ name: string }>(gone)))

    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('leaves any other failure of a screen to whoever is above', () => {
    function Broken(): never {
      throw new Error('a bug in the screen')
    }

    expect(() =>
      render(
        <I18nProvider initialLocale="en">
          <ScreenBoundary reload={reload}>
            <Broken />
          </ScreenBoundary>
        </I18nProvider>,
      ),
    ).toThrow('a bug in the screen')
    expect(reload).not.toHaveBeenCalled()
  })
})
