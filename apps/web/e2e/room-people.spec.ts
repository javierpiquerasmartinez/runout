import { expect, test, type Browser, type Page } from '@playwright/test'
import { seeded, VIEWPORTS } from './seeded'

/*
 * Who is in the Room opens from the header on hover. Whether the pointer can
 * cross from the avatars to the panel, and whether the panel fits a phone,
 * depends on real layout, which jsdom does not have.
 */
for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('the pointer can travel from the avatars into the panel', async ({ page }) => {
      await openRoom(page, viewport.name)
      const from = centreOf(await box(trigger(page)))

      await page.mouse.move(from.x, from.y)
      await expect(panel(page)).toBeVisible()

      // Dawdling over the gap between them, for longer than it takes the panel to close.
      const landing = await box(panel(page))
      await page.mouse.move(from.x, landing.y - 4, { steps: 5 })
      await page.waitForTimeout(400)
      await expect(panel(page)).toBeVisible()

      await page.mouse.move(from.x, landing.y + 20, { steps: 5 })
      await page.waitForTimeout(400)
      await expect(panel(page)).toBeVisible()

      await page.mouse.move(40, viewport.height - 40, { steps: 5 })
      await expect(panel(page)).toBeHidden()
    })
  })
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true })

  test('a tap opens the panel, which fits within the screen, and another closes it', async ({ page }) => {
    await openRoom(page, '1000x900')

    const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth)
    const widthClosed = await pageWidth()

    await trigger(page).tap()
    await expect(panel(page)).toBeVisible()

    const shown = await box(panel(page))
    expect(shown.x).toBeGreaterThanOrEqual(0)
    expect(shown.x + shown.width).toBeLessThanOrEqual(390)
    expect(await pageWidth()).toBe(widthClosed)

    await trigger(page).tap()
    await expect(panel(page)).toBeHidden()
  })
})

/* Below 760 px the header wraps, and the avatars can land on any of its rows. */
for (const width of [700, 390]) {
  test.describe(`at ${width} px wide with a mouse`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('the way from the avatars to the panel never leaves them', async ({ page }) => {
      await openRoom(page, '1000x900')
      const from = centreOf(await box(trigger(page)))

      await page.mouse.move(from.x, from.y)
      await expect(panel(page)).toBeVisible()

      // Slower than the panel's grace at every step: only a continuous way keeps it open.
      const end = (await box(panel(page))).y + 20
      for (let y = from.y; y < end; y += 4) {
        await page.mouse.move(from.x, y)
        await page.waitForTimeout(200)
        await expect(panel(page), `with the pointer at y=${y}`).toBeVisible()
      }
    })
  })
}

test.describe('with a keyboard', () => {
  test.use({ viewport: { width: 1440, height: 760 } })

  test('cancelling a Kick leaves focus on the avatars and the panel closed', async ({ page, browser }) => {
    await openRoom(page, 'keyboard-kick')
    await joinAsTesterB(browser, 'keyboard-kick')

    await trigger(page).focus()
    await page.getByRole('button', { name: 'Expulsar a Tester B' }).focus()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(panel(page)).toBeHidden()

    await dialog.getByRole('button', { name: 'Cancelar' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()

    await expect(trigger(page)).toBeFocused()
    await page.waitForTimeout(300)
    await expect(panel(page)).toBeHidden()

    // The dialog hands focus back as React commits, when it listens to no events, so
    // that return opens nothing; this test is what holds it if React ever changes.
    // Arriving at the avatars later still opens the panel.
    await page.keyboard.press('Tab')
    await expect(trigger(page)).not.toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(trigger(page)).toBeFocused()
    await expect(panel(page)).toBeVisible()
  })

  test('handing over the role leaves focus somewhere Esc can close the panel from', async ({ page, browser }) => {
    await openRoom(page, 'keyboard-hand-over')
    await joinAsTesterB(browser, 'keyboard-hand-over')

    await trigger(page).focus()
    const handOver = page.getByRole('button', { name: 'Pasar el mando a Tester B' })
    await handOver.focus()
    await page.keyboard.press('Enter')
    await expect(handOver).toBeHidden()

    await expect(trigger(page)).toBeFocused()
    await expect(panel(page)).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden()
    await expect(trigger(page)).toBeFocused()
  })
})

/** Tester B, in a browser of their own, comes into the Room and stays. */
async function joinAsTesterB(browser: Browser, roomName: string) {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/login')
  await page.getByRole('button', { name: 'Tester B' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto(`/room/${seeded().rooms[roomName]}`)
  await page.getByRole('button', { name: /en la sala/ }).waitFor()
}

function trigger(page: Page) {
  return page.getByRole('button', { name: /en la sala/ })
}

function panel(page: Page) {
  return page.getByRole('group', { name: 'En la sala' })
}

async function box(locator: ReturnType<Page['locator']>) {
  const found = await locator.boundingBox()
  if (!found) throw new Error('Not on screen')
  return found
}

function centreOf(area: { x: number; y: number; width: number; height: number }) {
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 }
}

async function openRoom(page: Page, viewportName: string) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Tester A' }).click()
  await expect(page).not.toHaveURL(/\/login/)

  await page.goto(`/room/${seeded().rooms[viewportName]}`)
  await trigger(page).waitFor()
}
