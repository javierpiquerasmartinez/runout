/*
 * Pictures of the Landing's scene at rest on each stop, wide and tall: what a
 * Visitor sees where the scene can't be drawn. They are captures of the scene
 * itself, made by `pnpm capture:landing`. Only their addresses are here; a
 * picture is downloaded when it is shown.
 */
const stills = import.meta.glob<string>('./stills/*.webp', { eager: true, query: '?url', import: 'default' })

/** The address of the picture of a stop, for a screen taller than wide or wider than tall. */
export function stillOf(stop: number, portrait: boolean): string {
  return stills[`./stills/${portrait ? 'tall' : 'wide'}-${stop}.webp`]
}
