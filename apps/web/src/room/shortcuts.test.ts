import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { shortcutFor, useShortcuts } from './shortcuts'

/** A keydown as the document sees it, fired at `target` (the page by default). */
function keydown(key: string, init: KeyboardEventInit = {}, target: Element = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...init })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('shortcutFor', () => {
  it('steps Actions with the arrow keys and jumps Streets with Shift + arrow', () => {
    expect(shortcutFor(keydown('ArrowLeft'))).toBe('previous-action')
    expect(shortcutFor(keydown('ArrowRight'))).toBe('next-action')
    expect(shortcutFor(keydown('ArrowLeft', { shiftKey: true }))).toBe('previous-street')
    expect(shortcutFor(keydown('ArrowRight', { shiftKey: true }))).toBe('next-street')
  })

  it('loads the previous or next Hand in the Queue with J and K, in either case', () => {
    expect(shortcutFor(keydown('j'))).toBe('previous-hand')
    expect(shortcutFor(keydown('k'))).toBe('next-hand')
    expect(shortcutFor(keydown('J', { shiftKey: true }))).toBe('previous-hand')
  })

  it('leaves other keys and browser or system combinations alone', () => {
    expect(shortcutFor(keydown('ArrowUp'))).toBeNull()
    expect(shortcutFor(keydown(' '))).toBeNull()
    expect(shortcutFor(keydown('ArrowLeft', { altKey: true }))).toBeNull()
    expect(shortcutFor(keydown('ArrowRight', { metaKey: true }))).toBeNull()
    expect(shortcutFor(keydown('k', { ctrlKey: true }))).toBeNull()
  })

  it('does nothing while focus is in a text field', () => {
    for (const field of ['<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"></div>']) {
      document.body.innerHTML = field
      expect(shortcutFor(keydown('ArrowRight', {}, document.body.firstElementChild!))).toBeNull()
      expect(shortcutFor(keydown('k', {}, document.body.firstElementChild!))).toBeNull()
    }
  })

  it('still works from a focused button, such as the one just clicked', () => {
    document.body.innerHTML = '<button type="button">Next</button>'
    expect(shortcutFor(keydown('ArrowRight', {}, document.body.firstElementChild!))).toBe('next-action')
  })

  it('ignores a key held down, so one press is one step', () => {
    expect(shortcutFor(keydown('ArrowRight', { repeat: true }))).toBeNull()
  })
})

describe('useShortcuts', () => {
  it('runs the handler for a shortcut pressed on the page', async () => {
    const next = vi.fn()
    renderHook(() => useShortcuts(true, { 'next-action': next }))
    await userEvent.keyboard('{ArrowRight}')
    expect(next).toHaveBeenCalledOnce()
  })

  it('is inactive for Guests', async () => {
    const next = vi.fn()
    renderHook(() => useShortcuts(false, { 'next-action': next, 'next-hand': next }))
    await userEvent.keyboard('{ArrowRight}k')
    expect(next).not.toHaveBeenCalled()
  })
})
