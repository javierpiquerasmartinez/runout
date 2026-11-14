import { describe, expect, it } from 'vitest'
import { depthOfFieldFor, paceOf, tierBelow, tierFor } from './quality'

const desktop = { reducedMotion: false, coarsePointer: false, cores: 10, memory: 8 }

describe('tierFor', () => {
  it('starts a desktop on high and a phone on medium', () => {
    expect(tierFor(desktop)).toBe('high')
    expect(tierFor({ ...desktop, coarsePointer: true })).toBe('medium')
  })

  it('starts a machine with few cores or little memory on medium', () => {
    expect(tierFor({ ...desktop, cores: 4 })).toBe('medium')
    expect(tierFor({ ...desktop, memory: 4 })).toBe('medium')
    expect(tierFor({ reducedMotion: false, coarsePointer: false })).toBe('high')
  })

  it('draws stills for a Visitor who asked for less motion, whatever the device', () => {
    expect(tierFor({ ...desktop, reducedMotion: true })).toBe('still')
  })
})

describe('depthOfFieldFor', () => {
  it('gives the high tier a depth of field and the medium tier none', () => {
    expect(depthOfFieldFor('high', desktop)).toBe(true)
    expect(depthOfFieldFor('medium', desktop)).toBe(false)
    expect(depthOfFieldFor('medium', { ...desktop, coarsePointer: true })).toBe(false)
  })

  it('gives a still its depth of field only on a device that would have started on high', () => {
    expect(depthOfFieldFor('still', { ...desktop, reducedMotion: true })).toBe(true)
    expect(depthOfFieldFor('still', { ...desktop, reducedMotion: true, coarsePointer: true })).toBe(false)
    expect(depthOfFieldFor('still', { ...desktop, reducedMotion: true, cores: 4 })).toBe(false)
  })
})

describe('tierBelow', () => {
  it('falls from high to medium to still, and no further', () => {
    expect(tierBelow('high')).toBe('medium')
    expect(tierBelow('medium')).toBe('still')
    expect(tierBelow('still')).toBe('still')
  })
})

describe('paceOf', () => {
  const run = (tier: 'high' | 'medium', milliseconds: number, frames: number) => {
    const pace = paceOf(tier)
    let slow = false
    for (let i = 0; i < frames; i++) slow = pace.frame(milliseconds) || slow
    return slow
  }

  it('lets sixty frames a second be on high, and thirty on medium', () => {
    expect(run('high', 1000 / 60, 600)).toBe(false)
    expect(run('medium', 1000 / 30, 600)).toBe(false)
  })

  it('finds thirty frames a second too slow for high, and twenty for medium', () => {
    expect(run('high', 1000 / 30, 600)).toBe(true)
    expect(run('medium', 1000 / 20, 600)).toBe(true)
  })

  it('says nothing until it has seen enough frames', () => {
    expect(run('high', 100, 100)).toBe(false)
  })

  it('does not count a tab left in the background as slow frames', () => {
    expect(run('high', 1000, 600)).toBe(false)
  })
})
