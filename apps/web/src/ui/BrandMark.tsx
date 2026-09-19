/** The Runout wave: the one brass drawing in the brand. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ro-brand-mark">
      <path
        d="M3 17c3.4 0 3.4-10 6.8-10S13.2 17 16.6 17 20 11.5 21 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
