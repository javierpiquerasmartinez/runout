import { drawings, type IconName } from './iconDrawings'

export type { IconName } from './iconDrawings'

/** The stroke is compensated as the icon scales, so its optical weight holds. */
function strokeWidthFor(size: number) {
  if (size <= 16) return 2.2
  if (size <= 20) return 1.9
  if (size <= 24) return 1.75
  return 1.5
}

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      strokeWidth={strokeWidthFor(size)}
      className={['ro-icon', className].filter(Boolean).join(' ')}
    >
      <use href={`#ro-${name}`} />
    </svg>
  )
}

/** Mount once near the root; every <Icon> points into it. */
export function IconSprite() {
  return (
    <svg aria-hidden="true" style={{ display: 'none' }}>
      {(Object.keys(drawings) as IconName[]).map((name) => (
        <symbol key={name} id={`ro-${name}`} viewBox="0 0 24 24" fill="none">
          {drawings[name]}
        </symbol>
      ))}
    </svg>
  )
}
