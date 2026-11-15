import { expect, test, type Page } from '@playwright/test'
import { clearFor, layoutFor } from '../src/landing/scene/choreography'
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
/** The stop the story rests at with the graph of chips on screen. */
const graphStop = 5

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 360, height: 640 }
/** Where the story is played through: a smaller window, so a browser with no graphics card keeps up. */
const WINDOW = { width: 1024, height: 640 }

/*
 * Headless Chromium draws WebGL in software unless told otherwise, at two or
 * three frames a second for this scene, and the story plays no faster than
 * its frames. With the machine's graphics card a stretch takes its three
 * seconds; without one the flag does nothing and `rests` waits longer.
 */
test.use({ launchOptions: { args: ['--enable-gpu'] } })

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

  test('goes one stop further with a second step in the middle of a stretch, and back to the stop just left with a step back', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    // The second key comes while the page has barely left the first stop.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await restsOnly(page, 2)

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await restsOnly(page, 2)
  })

  test("moves one stop with a trackpad's swipe whose glide outlasts a second", async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)
    await page.mouse.move(500, 300)

    // The fingers, then a glide that dies away over a second and a half, an event a frame.
    for (const delta of [3, 12, 40, 85, 120, 110]) await page.mouse.wheel(0, delta)
    for (let frame = 0; frame < 90; frame++) {
      await page.mouse.wheel(0, Math.max(1, Math.round(100 * (1 - frame / 90) ** 2)))
      await page.waitForTimeout(16)
    }

    await restsOnly(page, 1)
  })

  test('falls to pictures of the scene when the browser takes its graphics context back', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas[data-ready]')).toBeAttached({ timeout: 60_000 })
    await expect(page.getByRole('main').locator('img')).toBeHidden()

    await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('webgl2')
      const lose = context?.getExtension('WEBGL_lose_context')
      // Where the context can't be taken away for real, the browser's own word that it has been.
      if (lose) lose.loseContext()
      else canvas.dispatchEvent(new Event('webglcontextlost'))
    })

    await expect(page.getByRole('main').locator('img')).toBeVisible()
    await expect(page.locator('canvas[data-ready]')).toHaveCount(0)
    // And the story still steps, a picture a stop.
    await page.keyboard.press('ArrowDown')
    await rests(page, 1)
    await expect(page.getByRole('main').locator('img')).toHaveAttribute('src', /wide-1/)
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

  test('is asked for the scene only once the copy has painted', async ({ page }) => {
    // Notes when the headline is painted: it is the largest thing in the page that isn't the scene.
    await page.addInitScript(() => {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { element?: Element; renderTime: number })[]) {
          if (entry.element?.tagName === 'H1') sessionStorage.setItem('headline-painted', String(entry.renderTime))
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })

    await page.goto('/')
    await expect(page.locator('canvas[data-ready]')).toBeAttached({ timeout: 60_000 })

    const { painted, asked } = await page.evaluate(() => ({
      painted: Number(sessionStorage.getItem('headline-painted')),
      asked: performance.getEntriesByType('resource').find((entry) => /LandingScene/.test(entry.name))?.startTime,
    }))
    expect(painted).toBeGreaterThan(0)
    expect(asked).toBeGreaterThan(painted)
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

    test('reads the copy in fallback faces until the fonts arrive, and it stays where it is when they do', async ({ page }) => {
      // The fonts are held back, as a slow connection would.
      let arrive = () => {}
      const held = new Promise<void>((resolve) => (arrive = resolve))
      await page.route(/\.woff2?(\?|$)/, async (route) => {
        await held
        await route.continue()
      })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: titles.opening })).toBeVisible()
      // The fallback faces are cut to the fonts' widths from Georgia and Arial; a machine without them has nothing to check.
      test.skip(!(await hasFonts(page, ['Georgia', 'Arial'])), 'No Georgia or Arial on this machine')
      expect(await page.evaluate(() => document.fonts.check('16px "Instrument Serif"'))).toBe(false)
      const before = await copyBoxes(page)

      arrive()
      await page.evaluate(() =>
        Promise.all(['"Instrument Serif"', '"Instrument Sans"', '"IBM Plex Mono"'].map((font) => document.fonts.load(`16px ${font}`))),
      )
      expect(await page.evaluate(() => document.fonts.check('16px "Instrument Serif"'))).toBe(true)

      expect(await copyBoxes(page)).toEqual(before)
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

test.describe('a Visitor on a 360-pixel-wide phone', () => {
  test.use({ viewport: PHONE })

  test('has all the bar holds, wrapped to two lines, above what the scene keeps clear under it', async ({ page }) => {
    await page.goto('/')
    await rests(page, 0)

    const brand = (await page.locator('header svg').first().boundingBox())!
    const signIn = (await page.getByRole('link', { name: 'Iniciar sesión' }).boundingBox())!
    // Wrapped: Sign in is under the brand, not beside it.
    expect(signIn.y).toBeGreaterThanOrEqual(brand.y + brand.height)
    const clear = clearFor(layoutFor(PHONE.width / PHONE.height)).bar * PHONE.height
    for (const held of await page.locator('header *').all()) {
      const box = (await held.boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(clear)
    }
  })
})

test.describe('a Visitor whose device draws the scene', () => {
  test.use({ viewport: WINDOW, reducedMotion: 'reduce' })

  test('downloads no picture of it, at any stop', async ({ page }) => {
    const pictures = picturesAskedFor(page)
    await page.goto('/')
    await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true')

    for (let stop = 0; stop <= lastStop; stop++) {
      if (stop > 0) await page.keyboard.press('ArrowDown')
      await rests(page, stop)
    }

    await expect(page.getByRole('main').locator('img')).toBeHidden()
    expect(pictures).toEqual([])
  })
})

for (const [name, viewport, shape] of [
  ['a desktop', WINDOW, 'wide'],
  ['a phone held upright', PHONE, 'tall'],
] as const) {
  test.describe(`a Visitor on ${name} whose browser can't draw the scene`, () => {
    test.use({ viewport })

    test.beforeEach(async ({ page }) => {
      // A browser with no WebGL hands out no context to draw with.
      await page.addInitScript(() => {
        const context = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
          return kind.startsWith('webgl') ? null : context.call(this, kind, ...(rest as []))
        } as typeof context
      })
    })

    test(`sees a ${shape} picture of the scene at every stop, each its own, and steps without gliding`, async ({ page }) => {
      const pictures = picturesAskedFor(page)
      await page.goto('/')
      const picture = page.getByRole('main').locator('img')
      const seen: string[] = []

      for (const [stop, caption] of captionAtStop.entries()) {
        if (stop === 1) await recordScrolling(page)
        if (stop > 0) await page.keyboard.press('ArrowDown')
        await rests(page, stop)
        await expect(picture).toBeVisible()
        // The picture for this stop has arrived, in the screen's shape, and is the one showing.
        await expect
          .poll(() =>
            picture.evaluate(
              (img: HTMLImageElement, seen) => img.complete && img.naturalWidth > 0 && !seen.includes(img.currentSrc),
              seen,
            ),
          )
          .toBe(true)
        const { src, width, height } = await picture.evaluate((img: HTMLImageElement) => ({
          src: img.currentSrc,
          width: img.naturalWidth,
          height: img.naturalHeight,
        }))
        expect(shape === 'wide' ? width > height : height > width, `at stop ${stop}: ${width}×${height}`).toBe(true)
        expect(Math.max(width, height)).toBe(1600)
        seen.push(src)
        expect(await captionsShowing(page), `at stop ${stop}`).toEqual(caption ? [caption] : [])
        // The Results Graph's legend and its first Hand are laid over the picture of the graph, under the bar
        // and above the copy, and over no other picture.
        const legend = page.getByText('EV all-in')
        if (stop === graphStop) {
          const clear = clearFor(layoutFor(viewport.width / viewport.height))
          const over = (await legend.boundingBox())!
          const under = (await page.getByText('Mano 1').boundingBox())!
          expect(over.y).toBeGreaterThan(clear.bar * viewport.height)
          expect(under.y + under.height).toBeLessThan(clear.copy * viewport.height)
          expect(over.y + over.height).toBeLessThan(under.y)
          expect(under.x).toBeGreaterThan(0)
          await expect(legend).toBeVisible()
        } else {
          await expect(legend).toBeHidden()
        }
        if (stop === 1) expect(await scrolledThrough(page)).toEqual([viewport.height])
      }

      expect(new Set(seen).size).toBe(captionAtStop.length)
      // One picture a stop, and none for a stop not yet reached.
      expect(pictures.length).toBe(captionAtStop.length)
      // Each a WebP, 1,600 px on its long side, well under 150 kB.
      for (const address of pictures) {
        const picture = await page.request.get(address)
        expect(picture.headers()['content-type']).toBe('image/webp')
        expect((await picture.body()).length, address).toBeLessThan(150_000)
      }
    })

    test('still has both ways on', async ({ page }) => {
      await page.goto('/')
      await rests(page, 0)

      await expect(page.getByRole('link', { name: '¿Tienes un código de sala?' })).toBeVisible()
      await page.getByRole('link', { name: 'Iniciar sesión' }).click()
      await expect(page).toHaveURL(/\/login$/)
    })
  })

  test.describe(`someone signing in on ${name}`, () => {
    test.use({ viewport })

    test(`has a ${shape} still of the scene behind the form`, async ({ page }) => {
      const pictures = picturesAskedFor(page)
      await page.goto('/login')

      await expect(page.getByRole('button', { name: 'Tester A' })).toBeVisible()
      await expect.poll(() => pictures.length).toBe(1)
      const size = await page.evaluate(async (src) => {
        const picture = new Image()
        picture.src = src
        await picture.decode()
        return { width: picture.naturalWidth, height: picture.naturalHeight }
      }, pictures[0])
      expect(shape === 'wide' ? size.width > size.height : size.height > size.width, JSON.stringify(size)).toBe(true)
      // It is the page's background, behind everything on it.
      expect(await page.getByRole('main').evaluate((main) => getComputedStyle(main).backgroundImage)).toContain(
        new URL(pictures[0]).pathname,
      )
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

test.describe('signing in', () => {
  test('leaves a marker in the browser that holds nothing about the Account, and signing out clears it', async ({ page }) => {
    await page.goto('/')
    expect(await page.evaluate(() => localStorage.getItem('runout.account'))).toBeNull()

    await signInAs(page, 'Tester A')

    expect(await page.evaluate(() => localStorage.getItem('runout.account'))).toBe('1')

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()

    await expect(page.getByRole('heading', { level: 1, name: titles.opening })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('runout.account'))).toBeNull()
  })
})

/** The addresses of the pictures of the scene the page asks for, as it asks. */
function picturesAskedFor(page: Page) {
  const asked: string[] = []
  page.on('request', (request) => {
    // In development the page's scripts ask for a module that holds each picture's address: that isn't the picture.
    // The scene's own textures are WebP too: a picture of the scene is named for its shape and its stop.
    const picture = /\/(?:wide|tall)-\d+[\w.-]*\.webp$/.test(new URL(request.url()).pathname)
    if (request.resourceType() === 'image' && picture) asked.push(request.url())
  })
  return asked
}

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

/** Whether the machine has each of `fonts`: text set in one it lacks comes out as wide as in the face after it. */
function hasFonts(page: Page, fonts: string[]) {
  return page.evaluate((fonts) => {
    const context = document.createElement('canvas').getContext('2d')!
    const width = (font: string) => {
      context.font = `40px ${font}`
      return context.measureText('Tus manos. Tus números.').width
    }
    return fonts.every((font) => width(`"${font}", monospace`) !== width('monospace'))
  }, fonts)
}

/** Where every caption's title and line are, and how tall: a line more or less of text moves them. */
function copyBoxes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.landing__title, .landing__line')].map((element) => {
      const box = element.getBoundingClientRect()
      return { text: element.textContent, top: Math.round(box.top), height: Math.round(box.height) }
    }),
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
