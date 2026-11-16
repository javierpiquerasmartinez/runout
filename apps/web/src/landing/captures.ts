/*
 * The pictures taken of the Landing's scene by `pnpm capture:landing`
 * (`scripts/capture-landing.mjs`), as those who use them need to know them:
 * the page that lays the Results Graph's figures over a still (`stills.ts`)
 * and the build that names the preview in the Landing's documents
 * (`build/landingDocuments.ts`). This module imports nothing, so all three can.
 */

/** The window each shape's stills are captured in, in CSS pixels. */
export const stillWindows = {
  wide: { width: 1600, height: 900 },
  tall: { width: 400, height: 800 },
} as const

/**
 * The picture a link to Runout previews with: where it is kept, from the
 * app's folder, and its size, the 1.91 to 1 a large preview is shown at.
 */
export const preview = { file: 'src/landing/preview.jpg', width: 1200, height: 630 } as const

/**
 * The Landing in one language, as the build writes it into a document
 * (`prerender.tsx` draws it): its language and address, the markup the app
 * draws there for a Visitor before any effect has run, and what the
 * document's head says of it, to someone searching and in a link's preview.
 */
export interface LandingDocument<Language extends string = string> {
  locale: Language
  path: string
  markup: string
  title: string
  description: string
  /** What the preview's picture shows, for whoever can't see it. */
  pictureSays: string
}
