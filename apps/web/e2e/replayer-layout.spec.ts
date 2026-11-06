import { expect, test, type Page } from '@playwright/test'
import { seeded, VIEWPORTS } from './seeded'

/*
 * The replayer fits a laptop screen as one picture: the page never scrolls,
 * the transport bar stays on screen, and at every Action of every Hand nothing
 * on the table covers anything else (bets over board cards or seats, the pot
 * over the dealer button...). jsdom lays nothing out, so only a real browser
 * can check this. Both screens that draw the table are covered: a Library
 * Hand, and a Room's loaded Hand.
 */

/** Pieces of the table that must never cover one another. */
const PIECES = [
  '.poker-table__bet',
  '.poker-table__board .ro-card',
  '.poker-table__pot-label',
  '.poker-table__pot-value',
  '.poker-table__pot-detail',
  '.poker-table__side-pot',
  '.poker-table__dealer',
  '.seat__plate',
  '.seat__cards',
  '.seat__status',
  '.seat__outcome',
  // A Library Hand's top bar floats over the stage's top corners.
  '.library-hand__bar > *',
]

/** Overlaps up to this many px a side are antialiasing and rounding, not a collision. */
const TOLERANCE = 1

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test.beforeEach(async ({ page }) => {
      await signInAsTesterA(page)
    })

    test('a Library Hand fits without overlaps at every Action', async ({ page }) => {
      for (const handId of seeded().handIds) {
        await page.goto(`/library/hands/${handId}`)
        await stepThroughHand(page, `Library Hand ${handId}`)
      }
    })

    test('a Room’s Hand fits without overlaps at every Action', async ({ page }) => {
      const { rooms, handIds } = seeded()
      await page.goto(`/room/${rooms[viewport.name]}`)
      const entries = page.locator('.queue-entry__load')
      await expect(entries).toHaveCount(handIds.length)
      for (let i = 0; i < handIds.length; i++) {
        await entries.nth(i).click()
        await expect(page.locator('.queue-entry').nth(i)).toHaveAttribute('aria-current', 'true')
        // The click leaves focus on the entry; the shortcuts listen on the page.
        await page.locator('.poker-table').click({ position: { x: 1, y: 1 } })
        await stepThroughHand(page, `Room Hand ${i + 1}`)
      }
    })
  })
}

async function signInAsTesterA(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Tester A' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/**
 * From wherever the Hand opens, presses → until "next" locks at the end,
 * checking the layout at every step. A step that deals a Street keeps the
 * Action counter where it was, so a step is told by the table changing.
 */
async function stepThroughHand(page: Page, hand: string) {
  const counter = page.locator('.playback-bar__counter')
  const next = page.locator('.playback-bar__controls button').nth(2)
  await expect(counter).toHaveText(/\d+\D+\d+/)
  await page.locator('.poker-table').waitFor()

  for (let step = 0; ; step++) {
    await expectLaidOut(page, `${hand}, step ${step} (${await counter.textContent()})`)
    if ((await next.getAttribute('aria-disabled')) === 'true') break
    const before = await tableState(page)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => tableState(page), { message: `${hand}: → did nothing at step ${step}` }).not.toBe(before)
  }
}

/** What the table and the transport bar show, to tell one step from the next. */
function tableState(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      `${document.querySelector('.playback-bar__said')?.textContent}|${document.querySelector('.poker-table')?.innerHTML}`,
  )
}

async function expectLaidOut(page: Page, where: string) {
  await settled(page)
  const layout = await page.evaluate(
    ({ pieces, tolerance }) => {
      const scroll = document.scrollingElement!
      const bar = document.querySelector('.playback-bar')?.getBoundingClientRect()

      const found = pieces.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter((el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
          .map((el) => ({ el, selector, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && rect.height > 0),
      )
      const describe = ({ el, selector }: (typeof found)[number]) => {
        const seat = el.closest('.seat')
        const text = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 30)
        const seatName = seat?.querySelector('.seat__plate')?.textContent?.trim().slice(0, 20)
        return `${selector}${text ? ` "${text}"` : ''}${seat ? ` (seat ${seatName})` : ''}`
      }

      const overlaps: string[] = []
      for (let i = 0; i < found.length; i++) {
        for (let j = i + 1; j < found.length; j++) {
          const a = found[i]
          const b = found[j]
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue
          const seat = a.el.closest('.seat')
          if (seat && seat === b.el.closest('.seat')) continue
          const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
          const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
          if (width > tolerance && height > tolerance) {
            overlaps.push(`${describe(a)} × ${describe(b)}: ${width.toFixed(1)}×${height.toFixed(1)}px`)
          }
        }
      }

      return {
        scrollHeight: scroll.scrollHeight,
        innerHeight: window.innerHeight,
        barBottom: bar?.bottom ?? null,
        pieces: found.length,
        overlaps,
      }
    },
    { pieces: PIECES, tolerance: TOLERANCE },
  )

  expect(layout.pieces, `${where}: no table pieces found`).toBeGreaterThan(0)
  expect(layout.scrollHeight, `${where}: the page scrolls`).toBe(layout.innerHeight)
  expect(layout.barBottom, `${where}: no playback bar`).not.toBeNull()
  expect(layout.barBottom!, `${where}: the playback bar ends below the screen`).toBeLessThanOrEqual(layout.innerHeight)
  expect(layout.overlaps, `${where}: pieces of the table overlap`).toEqual([])
}

/** Waits for the table's transitions (chips sliding to the pot, cards dealt) to end. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      const onTable = target instanceof Element && target.closest('.poker-table')
      const endless = animation.effect?.getComputedTiming().iterations === Infinity
      return !onTable || endless || animation.playState !== 'running'
    }),
  )
}
