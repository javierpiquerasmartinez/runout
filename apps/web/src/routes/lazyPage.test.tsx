import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { lazyPage } from './lazyPage'

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
