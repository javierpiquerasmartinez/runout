import { expect, test } from '@playwright/test'
import { signInAs } from './seeded'

/*
 * Every screen arrives in a chunk of its own. An Account shouldn't notice:
 * moving between its sections shows the next one with nothing blank in
 * between, which only a real browser, frame by frame, can tell.
 */
test.use({ viewport: { width: 1440, height: 900 } })

const sections = [
  { link: 'Biblioteca', path: /\/library$/ },
  { link: 'Salas', path: /\/rooms$/ },
  { link: 'Laboratorio', path: /\/lab\/analysis$/ },
  { link: 'Calendario', path: /\/calendar\/month\// },
  { link: 'Objetivos', path: /\/goals$/ },
  { link: 'Inicio', path: /\/$/ },
]

test('an Account moves between its sections with no blank screen in between', async ({ page }) => {
  await signInAs(page, 'Tester A')
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible()
  // Its screens are asked for once it is in and the browser is idle.
  await page.waitForLoadState('networkidle')

  // Counts, frame by frame, the longest run of frames with no header on screen.
  await page.evaluate(() => {
    const seen = ((window as unknown as { blank: { longest: number } }).blank = { longest: 0 })
    let run = 0
    const look = () => {
      run = document.querySelector('header.app-header') ? 0 : run + 1
      seen.longest = Math.max(seen.longest, run)
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })

  const nav = page.getByRole('navigation', { name: 'Secciones' })
  for (const { link, path } of sections) {
    await nav.getByRole('link', { name: link, exact: true }).click()
    await expect(page).toHaveURL(path)
    await expect(nav.getByRole('link', { name: link, exact: true })).toHaveAttribute('aria-current', 'page')
  }

  const longest = await page.evaluate(() => (window as unknown as { blank: { longest: number } }).blank.longest)
  expect(longest, 'frames in a row with no screen showing').toBeLessThanOrEqual(2)
})
