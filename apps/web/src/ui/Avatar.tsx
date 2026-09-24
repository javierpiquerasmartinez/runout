const PALETTE_SIZE = 4

/** Up to two initials: the first letter of the first two words, or the first two letters. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2)
  return letters.toUpperCase()
}

/** The same person always gets the same colour. */
function paletteIndex(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (hash % PALETTE_SIZE) + 1
}

export function Avatar({ name, seed, size = 26 }: { name: string; seed: string; size?: 18 | 20 | 24 | 26 | 28 | 56 }) {
  return (
    <span className={`ro-avatar ro-avatar--${size}`} data-palette={paletteIndex(seed)} aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}
