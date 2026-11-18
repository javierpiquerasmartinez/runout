import { useNarrowScreen } from '../calendar/narrowScreen'

/**
 * Whether the Library offers building and managing Filters here: Más filtros
 * and its panel, Guardar filtro, renaming and deleting a Saved Filter, and
 * its modified state. At phone width (760 px or less) it doesn't; it only
 * applies and drops Saved Filters, and criteria that arrive in a link. The
 * rule follows the screen's width, never the device, so widening the window
 * brings everything back. Every control that builds or manages a Filter
 * consults this one gate.
 */
export function useBuildsFilters(): boolean {
  return !useNarrowScreen()
}
