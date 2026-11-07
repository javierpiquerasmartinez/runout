import { describe, expect, it } from 'vitest'
import { isDragging, milestoneDrop } from './milestoneDrag'

describe('a press on a Milestone', () => {
  it('stays a press while the pointer barely moved', () => {
    expect(isDragging(0, 0)).toBe(false)
    expect(isDragging(2, -2)).toBe(false)
  })

  it('becomes a drag once the pointer moved a few pixels, any way', () => {
    expect(isDragging(4, 0)).toBe(true)
    expect(isDragging(0, -4)).toBe(true)
    expect(isDragging(3, 3)).toBe(true)
  })
})

describe('dropping a dragged Milestone', () => {
  it('moves it to another day', () => {
    expect(milestoneDrop({ from: '2026-11-10', over: '2026-11-12' })).toEqual({ kind: 'move', to: '2026-11-12' })
  })

  it('changes nothing on its own day', () => {
    expect(milestoneDrop({ from: '2026-11-10', over: '2026-11-10' })).toEqual({ kind: 'nothing' })
  })

  it('changes nothing outside any day', () => {
    expect(milestoneDrop({ from: '2026-11-10', over: null })).toEqual({ kind: 'nothing' })
  })
})
