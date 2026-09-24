/** The Amount beside big blinds, dimmed, for a reader who shows both units. Nothing otherwise. */
export function Secondary({ value }: { value: string | null }) {
  return value && <span className="ro-secondary"> {value}</span>
}
