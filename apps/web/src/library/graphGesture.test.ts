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
    expect(graphGesture({ press: 120, release: 121, moved: 4 })).not.toEqual({ kind: 'open', hand: 120 })
  })

  it('zooms into the stretch dragged across, left to right', () => {
    expect(graphGesture({ press: 120, release: 180, moved: 60 })).toEqual({ kind: 'zoom', from: 120, to: 180 })
  })

  it('zooms into the same stretch when dragged right to left', () => {
    expect(graphGesture({ press: 180, release: 120, moved: 60 })).toEqual({ kind: 'zoom', from: 120, to: 180 })
  })

  it('zooms into two neighbouring Hands, the smallest stretch', () => {
    expect(graphGesture({ press: 120, release: 121, moved: 4 })).toEqual({ kind: 'zoom', from: 120, to: 121 })
  })

  it('does nothing for a drag that stays on one Hand', () => {
    expect(graphGesture({ press: 120, release: 120, moved: 30 })).toEqual({ kind: 'nothing' })
  })

  it('does nothing for a drag that starts or ends where no Hand stands', () => {
    expect(graphGesture({ press: null, release: 40, moved: 50 })).toEqual({ kind: 'nothing' })
    expect(graphGesture({ press: 40, release: null, moved: 50 })).toEqual({ kind: 'nothing' })
  })
})
