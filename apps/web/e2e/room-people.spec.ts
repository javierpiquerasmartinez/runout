import { expect, test, type Page } from '@playwright/test'
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
