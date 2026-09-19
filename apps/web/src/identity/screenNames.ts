/*
 * Screen Names are typed as one field, separated by commas, and sent to the
 * server as a list. The server trims and drops repeats too; reading them here
 * lets the field show what will be kept.
 */

/** Each name, trimmed, without blanks or repeats in another case. */
export function parseScreenNames(text: string): string[] {
  const names = new Map<string, string>()
  for (const name of text.split(',').map((each) => each.trim())) {
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name)
  }
  return [...names.values()]
}

export function formatScreenNames(names: string[]): string {
  return names.join(', ')
}
