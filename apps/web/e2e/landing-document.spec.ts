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

    test('is shown nothing of the Landing in Spanish while on the way there', async ({ page }) => {
      await noteWhatShows(page, spanish.headline)
      // `/en` takes a moment to answer, and the app's script has arrived and run at `/` well before it does.
      let appArrived = () => {}
      const arrived = new Promise<void>((resolve) => (appArrived = resolve))
      page.on('requestfinished', (request) => /\/assets\/index-.*\.js$/.test(request.url()) && appArrived())
      await page.route(/\/en$/, async (route) => {
        await arrived
        await new Promise((ran) => setTimeout(ran, 500))
        await route.continue()
      })

      await page.goto('/')

      await expect(page).toHaveURL(/\/en$/)
      await rests(page)
      expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBeNull()
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
    expect(await page.evaluate(() => localStorage.getItem('runout.account'))).toBe('1')

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
    expect(await page.evaluate(() => localStorage.getItem('runout.account'))).toBeNull()
    await page.evaluate(() => sessionStorage.removeItem('shown'))
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: spanish.headline })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBe('true')
  })
})

test.describe('someone in a Room without an Account', () => {
  test('is shown the Landing in the document at /, which stays on screen while the app finds out who they are', async ({ page, request }) => {
    const signedIn = await request.post(`${BUILT_URL}/api/sessions/google`, { data: { idToken: 'dev-sign-in|tester-a' } })
    const account = (await signedIn.json()) as { token: string }
    const created = await request.post(`${BUILT_URL}/api/rooms`, {
      headers: { Authorization: `Bearer ${account.token}` },
      data: { name: 'A Room for a guest', displayName: 'Tester A' },
    })
    const { code } = (await created.json()) as { code: string }
    const joined = await request.post(`${BUILT_URL}/api/rooms/${code}/guests`, { data: { displayName: 'Marta' } })
    const guest = (await joined.json()) as { token: string }
    await page.goto('/app.html')
    await page.evaluate((token) => localStorage.setItem('runout.identityToken', token), guest.token)

    // Notes every frame in which no Landing is on screen, from the first one that had it.
    await page.addInitScript((headline) => {
      let seen = false
      const look = () => {
        const showing = !!document.querySelector('.landing')?.checkVisibility() && document.querySelector('h1')?.textContent === headline
        seen ||= showing
        if (seen && !showing) sessionStorage.setItem('went', 'true')
        if (showing) sessionStorage.setItem('shown', 'true')
        requestAnimationFrame(look)
      }
      look()
    }, spanish.headline)
    await slowScripts(page)
    // The server takes a moment to say whose the token is.
    await page.route(/\/api\/identities\/me$/, async (route) => {
      await new Promise((answered) => setTimeout(answered, 600))
      await route.continue()
    })

    await page.goto('/')
    await rests(page)

    expect(await page.evaluate(() => sessionStorage.getItem('shown'))).toBe('true')
    expect(await page.evaluate(() => sessionStorage.getItem('went'))).toBeNull()
    // Being recognised leaves no marker: it is not an Account's session.
    expect(await page.evaluate(() => localStorage.getItem('runout.account'))).toBeNull()
  })
})

test.describe('a tab left open across a deploy', () => {
  /** Answers for the Sign-in page's chunk as a server does once a newer build has replaced it, for as long as `gone` says. */
  async function withoutSignInChunk(page: Page, gone: () => boolean) {
    await page.route(/\/assets\/LoginPage-[\w-]+\.js$/, (route) =>
      gone() ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }) : route.continue(),
    )
  }

  test('is answered not found for a file of the build that is gone, not with the app', async ({ request }) => {
    for (const accept of ['*/*', 'text/html,*/*']) {
      const gone = await request.get('/assets/LibraryPage-0ld.js', { headers: { accept } })
      expect(gone.status(), accept).toBe(404)
    }
  })

  test('reloads once for a screen whose chunk is gone, and is shown the screen by the build that is there now', async ({ page }) => {
    // The chunk is gone until the page is loaded again.
    let loads = 0
    page.on('request', (request) => request.isNavigationRequest() && loads++)
    await withoutSignInChunk(page, () => loads < 2)
    await page.goto('/')
    await rests(page)

    await page.getByRole('link', { name: spanish.signIn }).click()

    await expect(page.getByRole('main', { name: 'Iniciar sesión' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    expect(loads).toBe(2)
  })

  test('is told when reloading did not bring the screen, and has it on trying again', async ({ page }) => {
    let gone = true
    let loads = 0
    page.on('request', (request) => request.isNavigationRequest() && loads++)
    await withoutSignInChunk(page, () => gone)
    await page.goto('/')
    await rests(page)

    await page.getByRole('link', { name: spanish.signIn }).click()

    await expect(page.getByRole('alert')).toHaveText('No hemos podido cargar esta pantalla. Comprueba tu conexión y vuelve a intentarlo.')
    // Reloaded once, and not again.
    expect(loads).toBe(2)

    gone = false
    await page.getByRole('button', { name: 'Reintentar' }).click()

    await expect(page.getByRole('main', { name: 'Iniciar sesión' })).toBeVisible()
    expect(loads).toBe(2)
  })
})

test.describe('what a crawler or a link preview asks for', () => {
  test('is served as itself, not as the app: the crawl file, the map and the preview picture', async ({ page, request }) => {
    const robots = await request.get('/robots.txt', { headers: { accept: 'text/html,*/*' } })
    expect(robots.headers()['content-type']).toContain('text/plain')
    expect(await robots.text()).toContain('Disallow: /')

    const map = await request.get('/sitemap.xml', { headers: { accept: 'text/html,*/*' } })
    expect(map.headers()['content-type']).toContain('xml')
    expect(await map.text()).toContain('<urlset')

    // The picture's address is on the site the build was told; here the build is served elsewhere.
    await page.goto('/en')
    const picture = await page.locator('meta[property="og:image"]').getAttribute('content')
    const served = await request.get(new URL(picture!).pathname)
    expect(served.headers()['content-type']).toBe('image/jpeg')
  })

  test('a page of the app asks not to be indexed, and the Landing does not', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await page.goto('/')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
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
