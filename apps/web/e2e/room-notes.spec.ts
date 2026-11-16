import { expect, test, type Page } from '@playwright/test'
import { goToSeededRoom, VIEWPORTS } from './seeded'

/*
 * A Hand's Notes stay readable to its end, however little height the screen
 * has, and the field to write one is never pushed out of sight. jsdom lays
 * nothing out, so only a real browser can tell.
 */
for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('the Notes are as readable at the end of a Hand as at its start', async ({ page }) => {
      await openHandInRoom(page, viewport.name)
      await page.getByRole('tab', { name: /^Notas/ }).click()

      await writeNote(page, `A read of this Hand at ${viewport.name}`)

      const atStart = await noteHeights(page)
      expect(atStart.shown, `at the start: ${JSON.stringify(atStart)}`).toBeGreaterThanOrEqual(atStart.note)

      await page.locator('.poker-table').click({ position: { x: 1, y: 1 } })
      const next = page.locator('.playback-bar__controls button').nth(2)
      while ((await next.getAttribute('aria-disabled')) !== 'true') {
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(50)
      }
      // The Payout has arrived, in the tab that is not showing.
      await expect(page.locator('.room-payout')).toBeAttached()

      const atEnd = await noteHeights(page)
      expect(atEnd.shown, `at the end: ${JSON.stringify(atEnd)}`).toBeGreaterThanOrEqual(atEnd.note)
    })

    test('the field to write stays in view as the Notes outgrow the list', async ({ page }) => {
      await openHandInRoom(page, viewport.name)
      await page.getByRole('tab', { name: /^Notas/ }).click()

      for (let written = 0; written < 12; written++) {
        await writeNote(page, `Note ${written} of a long discussion at ${viewport.name}`)
      }

      const list = page.locator('.room-notes__list')
      const overflows = await list.evaluate((element) => element.scrollHeight > element.clientHeight)
      expect(overflows).toBe(true)
      await list.evaluate((element) => element.scrollTo(0, element.scrollHeight))

      await expect(page.locator('.room-notes__field')).toBeInViewport({ ratio: 1 })
      await expect(page.locator('.room-notes__save')).toBeInViewport({ ratio: 1 })
    })
  })
}

test.describe('below 760 px wide, where the Notes are a sheet over the table', () => {
  test.use({ viewport: { width: 600, height: 800 } })

  test('the Notes scroll by themselves inside the sheet, and the field is always in reach', async ({ page }) => {
    await goToSeededRoom(page, '1000x900')
    const bar = page.getByRole('navigation', { name: 'Paneles de la sala' })
    await bar.getByRole('button', { name: /^Cola/ }).click()
    await page.locator('.queue-entry__load').first().click()
    await page.locator('.poker-table').waitFor()
    // Loading a Hand closes the Queue's sheet, so the table shows it.
    await expect(page.locator('#room-queue')).toBeHidden()
    await bar.getByRole('button', { name: /^Notas/ }).click()

    for (let written = 0; written < 12; written++) {
      await writeNote(page, `Note ${written} of a long discussion on a narrow screen`)
    }

    const list = page.locator('.room-notes__list')
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)

    await page.locator('#room-side').evaluate((sheet) => sheet.scrollTo(0, sheet.scrollHeight))
    await expect(page.locator('.room-notes__field')).toBeInViewport({ ratio: 1 })
    await expect(page.locator('.room-notes__save')).toBeInViewport({ ratio: 1 })
    // The page itself never scrolls: the sheet does.
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight)).toBe(800)
  })
})

async function openHandInRoom(page: Page, viewportName: string) {
  await goToSeededRoom(page, viewportName)
  await page.locator('.queue-entry__load').first().click()
  await page.locator('.poker-table').waitFor()
}

async function writeNote(page: Page, body: string) {
  await page.locator('.room-notes__field').fill(body)
  await page.locator('.room-notes__save').click()
  await expect(page.locator('.room-notes__body', { hasText: body })).toBeAttached()
}

/** How tall the first Note is, and how much of it the list leaves room to show. */
function noteHeights(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('.room-notes__list')!
    const note = list.querySelector('.room-notes__note')!
    return { note: note.getBoundingClientRect().height, shown: list.clientHeight }
  })
}
