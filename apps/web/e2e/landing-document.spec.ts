import { expect, test, type Page } from '@playwright/test'
import { BUILT_URL } from './seeded'

/*
 * The Landing's copy in the document: rendered when the app is built, in
 * Spanish at `/` and in English at `/en`, so it is read before any script
 * runs and without running any. These tests open the app as built and
 * served by the rules it is deployed with, not Vite's development server,
 * which renders nothing ahead.
 */
test.use({ baseURL: BUILT_URL, viewport: { width: 1280, height: 720 } })

const landings = [
  {
    address: '/',
    headline: 'Tus manos. Tus números. Tu mesa.',
    captions: [
      'Tu historial de póker, por fin en un sitio donde estudiarlo.',
      'Todo acaba aquí.',
      'Los historiales de tu tracker, guardados y tuyos. Mano a mano.',
      'Tu gráfica no miente.',
      'Importa tus manos y mira, sin adornos, si estás ganando.',
      'Una mesa. Todo el grupo. La misma mano.',
      'Repasad cada acción sincronizados, cada uno en su pantalla. Sin compartir pantalla.',
      'Solo por invitación.',
    ],
    signIn: 'Iniciar sesión',
    haveCode: '¿Tienes un código de sala?',
  },
  {
    address: '/en',
    headline: 'Your hands. Your numbers. Your table.',
    captions: [
      'Your poker history, finally somewhere to study it.',
      'It all ends up here.',
      'The hand histories from your tracker, kept and yours. Hand by hand.',
      "Your graph doesn't lie.",
      "Import your hands and see, plainly, whether you're winning.",
      'One table. The whole group. The same hand.',
      'Go through every action in sync, each on your own screen. No screen sharing.',
      'Invitation only.',
    ],
    signIn: 'Sign in',
    haveCode: 'Have a room code?',
  },
]
const [spanish, english] = landings

/** A browser that asks for English first. */
const ENGLISH_BROWSER = { locale: 'en-US' }
const CRAWLER = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

test.describe('with scripts disabled', () => {
  test.use({ javaScriptEnabled: false })

  for (const { address, headline, captions, signIn, haveCode } of landings) {
    test(`${address} shows the bar, the headline, every caption and both ways on`, async ({ page }) => {
      await page.goto(address)

      await expect(page.getByText('RUNOUT', { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: headline })).toBeVisible()
      for (const caption of captions) await expect(page.getByText(caption, { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: signIn })).toHaveAttribute('href', '/login')
      await expect(page.getByRole('link', { name: haveCode })).toHaveAttribute('href', '/room')

      // One under another: no caption lies over the one before it, nor under the bar.
      const boxes = await page.locator('.landing__bar, .landing__caption').evaluateAll((elements) =>
        elements.map((element) => {
          const { top, bottom } = element.getBoundingClientRect()
          return { top: top + window.scrollY, bottom: bottom + window.scrollY }
        }),
      )
      expect(boxes).toHaveLength(5)
      boxes.slice(1).forEach((box, index) => expect(box.top).toBeGreaterThanOrEqual(boxes[index].bottom))
    })
  }

  test('a path that is not the Landing is served nothing of it', async ({ page }) => {
    await page.goto('/login')

    await expect(page.locator('#root')).toBeEmpty()
  })
})

test.describe('the language', () => {
  test('is English at /en, whatever the browser asks for', async ({ page }) => {
    await page.goto('/en')

    await expect(page.getByRole('heading', { level: 1, name: english.headline })).toBeVisible()
    await rests(page)
    await expect(page).toHaveURL(/\/en$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.headline)
    await expect(page.getByRole('link', { name: english.signIn })).toBeVisible()
  })

  test('is Spanish at /, for a browser that asks for Spanish', async ({ page }) => {
    await page.goto('/')

    await rests(page)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(spanish.headline)
  })

  test.describe('for a browser that asks for English', () => {
    test.use(ENGLISH_BROWSER)

    test('a Visitor with no language chosen is taken from / to /en', async ({ page }) => {
      await page.goto('/')

      await expect(page).toHaveURL(/\/en$/)
      await rests(page)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(english.headline)
    })

    test('keeps what follows the address on the way', async ({ page }) => {
      await page.goto('/?from=a-friend#top')

      await expect(page).toHaveURL(/\/en\?from=a-friend#top$/)
    })

    test('someone who chose Spanish here before stays at /', async ({ page }) => {
      await page.goto('/app.html')
      await page.evaluate(() => localStorage.setItem('runout.language', 'es'))

      await page.goto('/')

      await rests(page)
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(spanish.headline)
    })

    test.describe('that is a search engine’s crawler', () => {
      test.use({ userAgent: CRAWLER })

      test('is not redirected: / is the Landing in Spanish', async ({ page }) => {
        await page.goto('/')

        await rests(page)
        await expect(page).toHaveURL(/\/$/)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(spanish.headline)
      })
    })
  })

  test.describe('for a browser that asks for neither language', () => {
    test.use({ locale: 'fr-FR' })

    test('a Visitor stays at /, in Spanish', async ({ page }) => {
      await page.goto('/')

      await rests(page)
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(spanish.headline)
    })
  })
})

test.describe('when the app loads over the Landing in the document', () => {
  for (const { address, headline } of landings) {
    test(`at ${address} nothing moves and nothing is drawn twice`, async ({ page, browser }) => {
      // The page as it is before the app has arrived: its scripts never do.
      const before = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'es-ES', baseURL: BUILT_URL })
      await before.route(/\/assets\/.*\.js$/, (route) => route.abort())
      await before.goto(address)
      await expect(before.getByRole('heading', { level: 1, name: headline })).toBeVisible()
      await before.evaluate(() => document.fonts.ready)
      const placesBefore = await places(before)
      await before.close()

      const complaints: string[] = []
      page.on('console', (message) => message.type() === 'error' && complaints.push(message.text()))
      page.on('pageerror', (error) => complaints.push(error.message))
      // Keeps the headline the document arrived with, to tell it from one drawn again.
      await page.addInitScript(() => {
        const holder = window as unknown as { arrivedWith?: Element }
        new MutationObserver(() => (holder.arrivedWith ??= document.querySelector('h1') ?? undefined)).observe(document, {
          childList: true,
          subtree: true,
        })
      })
      await noteWhatShows(page, headline)

      await page.goto(address)
      await rests(page)
      await page.evaluate(() => document.fonts.ready)

      // The app is running the page: the scene it asks for has arrived.
      await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 })
      expect(await page.evaluate(() => (window as unknown as { arrivedWith?: Element }).arrivedWith === document.querySelector('h1'))).toBe(true)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('main')).toHaveCount(1)
      expect(await places(page)).toEqual(placesBefore)
      expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBe('true')
      expect(complaints).toEqual([])
    })
  }
})

test.describe('an Account', () => {
  test('is never shown the Landing in the document on its way Home, and is shown it again once signed out', async ({ page, request }) => {
    // A session from before the marker existed: the token alone.
    const response = await request.post(`${BUILT_URL}/api/sessions/google`, { data: { idToken: 'dev-sign-in|tester-a' } })
    const { token } = (await response.json()) as { token: string }
    await page.goto('/app.html')
    await page.evaluate((token) => localStorage.setItem('runout.identityToken', token), token)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()

    // Being recognised left the marker, which says nothing of whose the session is.
    expect(await page.evaluate(() => localStorage.getItem('runout.signedIn'))).toBe('1')

    await noteWhatShows(page)
    await slowScripts(page)
    for (const address of ['/', '/en']) {
      await page.goto(address)

      await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
      await expect(page).toHaveURL(/\/$/)
      expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBeNull()
    }

    await page.unrouteAll()
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()

    await expect(page.getByRole('heading', { level: 1, name: spanish.headline })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('runout.signedIn'))).toBeNull()
    await page.evaluate(() => sessionStorage.removeItem('shown'))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: spanish.headline })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBe('true')
  })
})

/** Waits for the app to be running the Landing, at rest on its first stop. */
async function rests(page: Page) {
  await expect(page.getByRole('main')).toHaveAttribute('data-stop', '0', { timeout: 60_000 })
}

/**
 * Notes, in every page opened from now on, whether a Landing is ever on
 * screen: looked for at every frame, before it is painted. With `headline`,
 * only a Landing with that headline counts.
 */
async function noteWhatShows(page: Page, headline?: string) {
  await page.addInitScript((headline) => {
    const look = () => {
      const landing = document.querySelector('.landing')
      if (landing?.checkVisibility() && (!headline || landing.querySelector('h1')?.textContent === headline)) sessionStorage.setItem('shown', 'true')
      requestAnimationFrame(look)
    }
    look()
  }, headline)
}

/** Has the app's scripts take a moment to arrive, as on a slow connection: time enough for what the document holds to be painted. */
async function slowScripts(page: Page) {
  await page.route(/\/assets\/.*\.js$/, async (route) => {
    await new Promise((arrived) => setTimeout(arrived, 400))
    await route.continue()
  })
}

/** Where the bar, the two ways on and the opening caption's pieces are on screen. */
function places(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.landing__bar, .landing__bar a, .landing__brand, [data-caption="opening"] > *')].map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return [x, y, width, height].map((length) => Math.round(length * 10) / 10)
    }),
  )
}
