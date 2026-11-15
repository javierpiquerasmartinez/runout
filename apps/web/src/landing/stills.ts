/*
 * Pictures of the Landing's scene at rest on each stop, wide and tall: what a
 * Visitor sees where the scene can't be drawn. They are captures of the scene
 * itself, made by `pnpm capture:landing`. Only their addresses are here; a
 * picture is downloaded when it is shown.
 */
import { stillWindows } from './captures'
import { graphOnScreen, stops, type GraphOnScreen } from './scene/choreography'

const stills = import.meta.glob<string>('./stills/*.webp', { eager: true, query: '?url', import: 'default' })

/** The address of the picture of a stop, for a screen taller than wide or wider than tall. */
export function stillOf(stop: number, portrait: boolean): string {
  return stills[`./stills/${portrait ? 'tall' : 'wide'}-${stop}.webp`]
}

/**
 * Where the graph of chips is in the picture of a stop, on a screen `width`
 * by `height`, for the Results Graph's figures laid over it: where the scene
 * drew it in the window the picture was captured in, moved with the picture
 * as it is scaled to fill the screen and cut where it isn't the screen's shape.
 */
export function graphInStill(stop: number, width: number, height: number): GraphOnScreen {
  const picture = width < height ? stillWindows.tall : stillWindows.wide
  const graph = graphOnScreen(stops[stop].at, picture.width, picture.height)
  const scale = Math.max(width / picture.width, height / picture.height)
  const across = (x: number) => (x - picture.width / 2) * scale + width / 2
  const down = (y: number) => (y - picture.height / 2) * scale + height / 2
  return {
    showing: graph.showing,
    left: across(graph.left),
    right: across(graph.right),
    zero: down(graph.zero),
    crest: down(graph.crest),
    floor: down(graph.floor),
  }
}
