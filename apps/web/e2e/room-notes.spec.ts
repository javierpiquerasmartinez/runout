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

test.describe('below 760 px wide, where the page scrolls', () => {
  test.use({ viewport: { width: 600, height: 800 } })

  test('the Notes scroll by themselves, and the field is one screen away from them at most', async ({ page }) => {
    await openHandInRoom(page, '1000x900')
    await page.getByRole('tab', { name: /^Notas/ }).click()

    for (let written = 0; written < 12; written++) {
      await writeNote(page, `Note ${written} of a long discussion on a narrow screen`)
    }

    const list = page.locator('.room-notes__list')
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)

    const listBox = await list.boundingBox()
    const fieldBox = await page.locator('.room-notes__save').boundingBox()
    expect(fieldBox!.y + fieldBox!.height - listBox!.y).toBeLessThanOrEqual(800)
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
