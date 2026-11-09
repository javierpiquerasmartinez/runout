/** "12 / 80": how much of a field's room is taken. */
export function LengthCount({ length, max, className, besideError = false }: { length: number; max: number; className?: string; besideError?: boolean }) {
  return (
    <span className={['ro-length-count ro-mono', className].filter(Boolean).join(' ')} data-beside-error={besideError || undefined}>
      {`${length} / ${max}`}
    </span>
  )
}
