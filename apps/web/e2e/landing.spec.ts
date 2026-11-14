import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './seeded'

/*
 * The Landing, as a Visitor meets it: one Hand played stop by stop behind the
 * copy, one gesture a stop, and Sign in and the Room Code link in a bar that
 * never leaves the top. The tests read the page (which caption shows, the
 * stop reached, addresses), never the scene's pixels.
 */
const titles = {
  opening: 'Tus manos. Tus números. Tu mesa.',
  library: 'Todo acaba aquí.',
  results: 'Tu gráfica no miente.',
  rooms: 'Una mesa. Todo el grupo. La misma mano.',
}

/** The caption on screen at each of the story's seven stops; the dive has none. */
const captionAtStop = [
  titles.opening,
  titles.library,
  titles.library,
  titles.library,
  null,
  titles.results,
  titles.rooms,
]
const lastStop = captionAtStop.length - 1

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 360, height: 640 }
/** Where the story is played through: a smaller window, so a browser with no graphics card keeps up. */
const WINDOW = { width: 1024, height: 640 }

test.describe('a Visitor', () => {
  test.use({ viewport: WINDOW })

  for (const path of ['/', '/no-such-place', '/landing-lab']) {
    test(`sees the Landing at ${path}`, async ({ page }) => {
      await page.goto(path)

      await expect(page.getByRole('heading', { level: 1, name: titles.opening })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
      await expect(page.getByRole('link', { name: '¿Tienes un código de sala?' })).toBeVisible()
      await rests(page, 0)
    })
  }

  test('moves one stop with one notch of the wheel, and back with one', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)
    await page.mouse.move(500, 300)

    await page.mouse.wheel(0, 100)
    await restsOnly(page, 1)

    await page.mouse.wheel(0, -100)
    await restsOnly(page, 0)
  })

  test('moves one stop with each key, and to the ends with Home and End', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    let stop = 0
    for (const [key, by] of [
      ['ArrowDown', 1],
      ['PageDown', 1],
      ['Space', 1],
      ['ArrowUp', -1],
      ['PageUp', -1],
      ['Shift+Space', -1],
    ] as const) {
      await page.keyboard.press(key)
      stop += by
      await restsOnly(page, stop)
    }

    await page.keyboard.press('End')
    await rests(page, lastStop)
    await page.keyboard.press('Home')
    await rests(page, 0)
  })

  test('keeps the keys working once focus is on one of the two ways on', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    await page.keyboard.press('Tab')
    await page.keyboard.press('ArrowDown')

    await restsOnly(page, 1)
  })

  test('leaves pinch to zoom to the browser', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    // A trackpad's pinch arrives as a wheel event with the control key held.
    const taken = await page.evaluate(() => {
      const pinch = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true, bubbles: true })
      document.body.dispatchEvent(pinch)
      return pinch.defaultPrevented
    })
    expect(taken).toBe(false)
    // A finger may pinch, though it can't drag the page.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('pinch-zoom')

    await page.waitForTimeout(1000)
    await rests(page, 0)
  })

  test('shows one caption at a time, the right one at each stop, and none during the dive', async ({ page }) => {
    await page.goto('/')

    for (const [stop, caption] of captionAtStop.entries()) {
      if (stop > 0) await page.keyboard.press('ArrowDown')
      await rests(page, stop)
      expect(await captionsShowing(page), `at stop ${stop}`).toEqual(caption ? [caption] : [])
    }
  })

  test('glides between stops, and takes no tier from the address', async ({ page }) => {
    await page.goto('/?tier=still')
    await rests(page, 0)
    await recordScrolling(page)

    await page.keyboard.press('ArrowDown')
    await rests(page, 1)

    expect((await scrolledThrough(page)).length).toBeGreaterThan(1)
    // The prototype's readout of the story's progress.
    await expect(page.getByText(/\d\s?%/)).toHaveCount(0)
  })

  test('reads as headings and paragraphs in the story\'s order, the scene left out', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    // Every caption is there for a screen reader, whichever one is showing.
    await expect(page.getByRole('heading')).toHaveText([titles.opening, titles.library, titles.results, titles.rooms])
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles.opening)
    for (const line of [
      'Tu historial de póker, por fin en un sitio donde estudiarlo.',
      'Los historiales de tu tracker, guardados y tuyos. Mano a mano.',
      'Importa tus manos y mira, sin adornos, si estás ganando.',
      'Repasad cada acción sincronizados, cada uno en su pantalla. Sin compartir pantalla.',
      'Solo por invitación.',
    ]) {
      await expect(page.getByRole('paragraph').filter({ hasText: line })).toHaveCount(1)
    }

    await expect(page.locator('canvas')).toHaveAttribute('aria-hidden', 'true')
    // The Results Graph's figures are part of the picture, not of the copy.
    await expect(page.getByRole('listitem')).toHaveCount(0)
  })

  test('finds the two ways on first with the keyboard, and sees where focus is', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    for (const name of ['¿Tienes un código de sala?', 'Iniciar sesión']) {
      await page.keyboard.press('Tab')
      const link = page.getByRole('link', { name })
      await expect(link).toBeFocused()
      const outline = await link.evaluate((element) => {
        const style = getComputedStyle(element)
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
      })
      expect(outline.style).not.toBe('none')
      expect(outline.width).toBeGreaterThanOrEqual(2)
    }
  })

  test.describe('whose system is in the light Theme', () => {
    test.use({ colorScheme: 'light' })

    test('sees the Landing dark', async ({ page }) => {
      await page.goto('/')
      await rests(page, 0)

      const colours = await page.evaluate(() => ({
        page: getComputedStyle(document.body).backgroundColor,
        title: getComputedStyle(document.querySelector('h1')!).color,
      }))
      expect(lightness(colours.page)).toBeLessThan(20)
      expect(lightness(colours.title)).toBeGreaterThan(200)
    })
  })

  test.describe('who asked for less motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('steps from stop to stop without gliding', async ({ page }) => {
      await page.goto('/')
      await rests(page, 0)
      await recordScrolling(page)

      await page.keyboard.press('ArrowDown')
      await rests(page, 1)
      // The caption is there at once, not after the stretch has played.
      expect(await captionsShowing(page)).toEqual([titles.library])

      // One jump: the page was never anywhere between the two stops.
      expect(await scrolledThrough(page)).toEqual([WINDOW.height])
    })
  })
})

for (const [name, viewport] of [
  ['a desktop', DESKTOP],
  ['a 360-pixel-wide phone', PHONE],
] as const) {
  test.describe(`a Visitor on ${name}`, () => {
    // Stepping at once keeps the walk through every stop short.
    test.use({ viewport, reducedMotion: 'reduce' })

    test('has both ways on in reach at every stop', async ({ page }) => {
      await page.goto('/')
      const code = page.getByRole('link', { name: '¿Tienes un código de sala?' })
      const signIn = page.getByRole('link', { name: 'Iniciar sesión' })

      for (let stop = 0; stop <= lastStop; stop++) {
        if (stop > 0) await page.keyboard.press('ArrowDown')
        await rests(page, stop)
        await expect(code).toBeInViewport({ ratio: 1 })
        await expect(signIn).toBeInViewport({ ratio: 1 })
        // Each is where a pointer or a finger finds it, with nothing lying over it.
        for (const link of [code, signIn]) {
          expect(await link.evaluate(onTop), `at stop ${stop}`).toBe(true)
        }
        const [codeBox, signInBox] = [(await code.boundingBox())!, (await signIn.boundingBox())!]
        const apart =
          codeBox.x + codeBox.width <= signInBox.x ||
          signInBox.y + signInBox.height <= codeBox.y ||
          codeBox.y + codeBox.height <= signInBox.y
        expect(apart, `at stop ${stop}: ${JSON.stringify({ codeBox, signInBox })}`).toBe(true)
      }
    })

    test('is taken to the Room Code page by its link, from the last stop', async ({ page }) => {
      await page.goto('/')
      await page.keyboard.press('End')
      await rests(page, lastStop)

      await page.getByRole('link', { name: '¿Tienes un código de sala?' }).click()

      await expect(page).toHaveURL(/\/room$/)
    })

    test('is taken to the Sign-in page by Sign in, from the last stop', async ({ page }) => {
      await page.goto('/')
      await page.keyboard.press('End')
      await rests(page, lastStop)

      await page.getByRole('link', { name: 'Iniciar sesión' }).click()

      await expect(page).toHaveURL(/\/login$/)
    })
  })
}

test.describe('a Visitor with a finger on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

  test('moves one stop with one short swipe, and back with one', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    await swipe(page, { from: 420, to: 340 })
    await restsOnly(page, 1)

    await swipe(page, { from: 340, to: 420 })
    await restsOnly(page, 0)
  })

  test('stays where it is while two fingers pinch', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    const touch = await page.context().newCDPSession(page)
    const fingers = (apart: number) => [
      { x: 180, y: 320 - apart },
      { x: 180, y: 320 + apart },
    ]
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(40) })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(120) })
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    await page.waitForTimeout(1000)
    await rests(page, 0)
  })
})

test.describe('an Account', () => {
  test.use({ viewport: DESKTOP })

  test('goes Home at /, and is never shown the Landing', async ({ page }) => {
    await signInAs(page, 'Tester A')
    // Notes the Landing's headline if it is ever in the page, however briefly.
    await page.addInitScript((headline) => {
      const look = () => {
        if (document.body?.textContent?.includes(headline)) sessionStorage.setItem('saw-landing', 'true')
      }
      new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true })
    }, titles.opening)

    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('saw-landing'))).toBeNull()
  })
})

/** Waits for the story to have played up to a stop and come to rest there. */
async function rests(page: Page, stop: number) {
  // A browser with no graphics card draws the scene slowly, and the story with it: it is given time.
  await expect(async () => {
    await expect(page.getByRole('main')).toHaveAttribute('data-stop', String(stop), { timeout: 1000 })
    expect(await page.evaluate(() => window.scrollY / window.innerHeight)).toBeCloseTo(stop, 1)
  }).toPass({ timeout: 60_000 })
}

/** As `rests`, and the story is still there once a gesture's echoes have died down: it moved one stop, not more. */
async function restsOnly(page: Page, stop: number) {
  await rests(page, stop)
  await page.waitForTimeout(900)
  await rests(page, stop)
}

/** The titles of the captions on screen: those nothing has faded out. */
function captionsShowing(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('h1, h2')]
      .filter((heading) => {
        let opacity = 1
        for (let element: Element | null = heading; element; element = element.parentElement) {
          opacity *= Number(getComputedStyle(element).opacity)
        }
        if (opacity > 0 && opacity < 1) throw new Error(`"${heading.textContent}" is half-faded at a stop: ${opacity}`)
        return opacity === 1
      })
      .map((heading) => heading.textContent),
  )
}

/** Starts noting every place the page is scrolled to. */
function recordScrolling(page: Page) {
  return page.evaluate(() => {
    const places = ((window as unknown as { scrolledThrough: number[] }).scrolledThrough = [] as number[])
    window.addEventListener('scroll', () => places.push(Math.round(window.scrollY)))
  })
}

/** The distinct places the page has been scrolled to since `recordScrolling`, in order. */
function scrolledThrough(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { scrolledThrough: number[] }).scrolledThrough.filter(
      (place, index, places) => place !== places[index - 1],
    ),
  )
}

/** Whether an element is what a tap in its middle would land on. */
function onTop(element: Element) {
  const box = element.getBoundingClientRect()
  const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
  return !!hit && element.contains(hit)
}

/** One finger down at `from`, dragged to `to` and lifted, in pixels from the top. */
async function swipe(page: Page, { from, to }: { from: number; to: number }) {
  const touch = await page.context().newCDPSession(page)
  const at = (y: number) => [{ x: 180, y }]
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) })
  for (let step = 1; step <= 4; step++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(from + ((to - from) * step) / 4) })
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await touch.detach()
}

/** The mean of an `rgb()` colour's three channels, 0 to 255. */
function lightness(colour: string) {
  const channels = colour.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number)
  return (channels[0] + channels[1] + channels[2]) / 3
}
