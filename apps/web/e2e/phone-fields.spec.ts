import { expect, test, type Page } from '@playwright/test'
import { seeded, signInAs } from './seeded'

/*
 * Safari on an iPhone zooms the page in on any field whose text is under 16px
 * as soon as it is tapped, and leaves it zoomed: the app stops fitting the
 * screen. On a touch screen every field the keyboard types into is 16px or
 * more. jsdom computes no styles, so only a real browser can check this.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

/** The least font size Safari on iOS leaves a focused field at, unzoomed. */
const LEAST = 16

test('the sign-in page’s fields are not zoomed into on a phone', async ({ page }) => {
  await page.goto('/login')
  await expectFieldsUnzoomed(page, '/login')
})

test('an Account’s screens’ fields are not zoomed into on a phone', async ({ page }) => {
  await signInAs(page, 'Tester A')
  const { handIds, rooms } = seeded()
  for (const path of [
    '/library',
    `/library/hands/${handIds[0]}`,
    `/room/${Object.values(rooms)[0]}`,
    '/lab/analysis',
    '/lab/ranges',
    '/settings',
  ]) {
    await page.goto(path)
    await expectFieldsUnzoomed(page, path)
  }

  // A dialog's fields: a new Goal's.
  await page.goto('/goals')
  await page.getByRole('button', { name: 'Nuevo objetivo' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Nuevo objetivo' })).toBeVisible()
  await expectFieldsUnzoomed(page, 'the new Goal dialog')
})

async function expectFieldsUnzoomed(page: Page, where: string) {
  const fields = page.locator(
    'input:not([type=checkbox], [type=radio], [type=range], [type=hidden]), textarea, select, [contenteditable=true]',
  )
  await expect(fields.first(), `${where}: no fields to check`).toBeAttached()
  const small = await fields.evaluateAll(
    (all, least) =>
      all
        .map((el) => ({
          field: `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''}`,
          size: parseFloat(getComputedStyle(el).fontSize),
        }))
        .filter(({ size }) => size < least)
        .map(({ field, size }) => `${field}: ${size}px`),
    LEAST,
  )
  expect(small, `${where}: fields Safari zooms into when tapped`).toEqual([])
}
