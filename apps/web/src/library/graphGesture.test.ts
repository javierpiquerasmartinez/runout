import { describe, expect, it } from 'vitest'
import { graphGesture } from './graphGesture'

describe('a mouse gesture on the Results Graph', () => {
  it('opens the Hand under the press when the mouse barely moved', () => {
    expect(graphGesture({ press: 120, release: 120, moved: 0 })).toEqual({ kind: 'open', hand: 120 })
  })

  it('is still a click on the press point when the release lands on a neighbouring Hand', () => {
    expect(graphGesture({ press: 120, release: 121, moved: 3 })).toEqual({ kind: 'open', hand: 120 })
  })

  it('does nothing on the start point, where no Hand stands', () => {
    expect(graphGesture({ press: null, release: null, moved: 0 })).toEqual({ kind: 'nothing' })
  })

  it('is not a click once the mouse moved past the threshold', () => {
    expect(graphGesture({ press: 120, release: 120, moved: 4 })).toEqual({ kind: 'nothing' })
  })
})
