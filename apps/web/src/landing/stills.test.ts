import { describe, expect, it } from 'vitest'
import { stops } from './scene/choreography'
import { stillOf } from './stills'

const shapes = [
  ['wide', false],
  ['tall', true],
] as const

describe('the stills of the scene', () => {
  it.each(shapes)('has a %s picture of every stop, each its own', (_shape, portrait) => {
    const addresses = stops.map((_, stop) => stillOf(stop, portrait))
    for (const address of addresses) expect(address).toMatch(/\.webp$/)
    expect(new Set(addresses).size).toBe(stops.length)
  })

  it('has different pictures for a wide screen and a tall one', () => {
    expect(stillOf(0, true)).not.toBe(stillOf(0, false))
  })
})
