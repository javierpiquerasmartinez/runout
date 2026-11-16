import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(cleanup)

// The app asks for a language's messages as it needs them (`i18n/catalogue`). A test has every language's from the
// start, so nothing it renders waits for one.
vi.mock('../i18n/held', async () => {
  const [{ es }, { en }] = await Promise.all([import('../i18n/messages/es'), import('../i18n/messages/en')])
  return { held: { es, en } }
})

// jsdom has <dialog> but doesn't implement opening it. A test of the build runs in Node, with no page at all.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    // As a browser does, once closed.
    setTimeout(() => this.dispatchEvent(new Event('close')))
  }
}
