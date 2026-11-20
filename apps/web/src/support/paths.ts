/** Support's addresses, apart from its screens, so that linking to them loads none of them. */
export const supportPath = '/support'

/** One Support Ticket's page. */
export function supportTicketPath(id: string): string {
  return `${supportPath}/${id}`
}

/** The Support Ticket a path opens, or null when it isn't one. */
export function supportTicketIdFromPath(path: string): string | null {
  const id = path.startsWith(`${supportPath}/`) ? path.slice(supportPath.length + 1) : ''
  return /^[^/]+$/.test(id) ? id : null
}
