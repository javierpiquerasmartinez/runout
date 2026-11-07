import type { MouseEvent } from 'react'
import { followLink } from '../routing'
import { Icon } from './Icon'

/** A step back along a breadcrumb: where it leads, and how, when not simply there. */
export interface BreadcrumbLink {
  label: string
  href: string
  /** Goes there some other way (back through history, say); by default the link is followed within the app. */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * Where a page sits: a trail of links back, each followed by a chevron, that
 * ends in the current page, cut short with the whole name on hover.
 */
export function Breadcrumb({ label, trail, current }: { label: string; trail: readonly BreadcrumbLink[]; current: string }) {
  return (
    <nav className="ro-breadcrumb" aria-label={label}>
      <ol className="ro-breadcrumb__trail">
        {trail.map((step) => (
          <li key={step.href + step.label} className="ro-breadcrumb__step">
            <a className="ro-breadcrumb__link" href={step.href} onClick={step.onClick ?? followLink}>
              {step.label}
            </a>
            <Icon name="chevron" size={14} className="ro-breadcrumb__separator" />
          </li>
        ))}
        <li className="ro-breadcrumb__step ro-breadcrumb__step--current">
          <span className="ro-breadcrumb__current" aria-current="page" title={current}>
            {current}
          </span>
        </li>
      </ol>
    </nav>
  )
}
