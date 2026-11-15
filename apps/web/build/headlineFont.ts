import type { Plugin } from 'vite'

/** The headline's face, as the build names it: Instrument Serif, Latin, the one weight it has. */
const headlineFont = /(?:^|\/)instrument-serif-latin-400-normal-[\w-]+\.woff2$/

/**
 * Has the built document ask for the headline's font ahead of the styles
 * that name it, so the Landing's headline is seldom seen in its fallback
 * face. No other font is asked for early: each would compete with the
 * scripts the copy waits for.
 */
export function preloadHeadlineFont(): Plugin {
  let base = '/'
  return {
    name: 'runout:preload-headline-font',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        const font = Object.keys(bundle ?? {}).find((fileName) => headlineFont.test(fileName))
        if (!font) throw new Error("The headline's font is not in the build: nothing to preload.")
        return [
          {
            tag: 'link',
            // Fonts are fetched without credentials: without `crossorigin` the preload goes unused.
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${font}`, crossorigin: true },
            injectTo: 'head',
          },
        ]
      },
    },
  }
}
