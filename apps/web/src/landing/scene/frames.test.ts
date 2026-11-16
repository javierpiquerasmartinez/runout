import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drawWhileVisible } from './frames'

/** The frames the browser has been asked for and not yet given. */
let asked: Map<number, FrameRequestCallback>
let visibility: DocumentVisibilityState

/** Gives the browser's next frame, at `now` milliseconds, to whoever asked for it. */
function frameAt(now: number) {
  const waiting = [...asked.values()]
  asked.clear()
  waiting.forEach((callback) => callback(now))
}

function becomes(state: DocumentVisibilityState) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  asked = new Map()
  visibility = 'visible'
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    asked.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => asked.delete(frame))
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the scene's frames", () => {
  it('draws one for each of the browser, with the time the scene has been playing', () => {
    const drawn: number[] = []
    drawWhileVisible((time) => drawn.push(time))

    frameAt(1000)
    frameAt(1016)
    frameAt(1032)

    expect(drawn).toEqual([1000, 1016, 1032])
  })

  it('draws nothing while the page is hidden, and asks the browser for no frame', () => {
    const drawn: number[] = []
    drawWhileVisible((time) => drawn.push(time))
    frameAt(1000)

    becomes('hidden')
    expect(asked.size).toBe(0)
    frameAt(1016)

    expect(drawn).toEqual([1000])
  })

  it('resumes where it was: the time away is no time of the scene', () => {
    const drawn: number[] = []
    drawWhileVisible((time) => drawn.push(time))
    frameAt(1000)
    frameAt(1016)

    becomes('hidden')
    becomes('visible')
    frameAt(61_000)
    frameAt(61_016)

    expect(drawn).toEqual([1000, 1016, 1016, 1032])
  })

  it('waits for a page that opens hidden to be seen', () => {
    visibility = 'hidden'
    const drawn: number[] = []
    drawWhileVisible((time) => drawn.push(time))
    expect(asked.size).toBe(0)

    becomes('visible')
    frameAt(5000)

    expect(drawn).toHaveLength(1)
  })

  it('draws no more once stopped, hidden or seen', () => {
    const drawn: number[] = []
    const stop = drawWhileVisible((time) => drawn.push(time))
    frameAt(1000)

    stop()
    frameAt(1016)
    becomes('hidden')
    becomes('visible')
    frameAt(1032)

    expect(drawn).toEqual([1000])
  })
})
