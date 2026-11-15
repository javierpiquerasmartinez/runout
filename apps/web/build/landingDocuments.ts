import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type Plugin, type ResolvedConfig } from 'vite'

/** The document served at every path but the Landing's: the app, and nothing drawn ahead. */
const APP_DOCUMENT = 'app.html'

/** The Landing in one language, as `src/landing/prerender.tsx` answers it: its language, its address and the app's markup there. */
interface LandingDocument {
  locale: string
  path: string
  markup: string
}

/**
 * What each language's document says of itself in its head, beyond what
 * `index.html` says for all of them: its title, description, canonical
 * address, the links to the other language and what a link's preview shows
 * go here, as HTML, one entry a language.
 */
const heads: Record<string, string> = { es: '', en: '' }

/**
 * Writes the Landing into the documents the build produces. `index.html` is
 * built as ever, and from it come three: the Landing in Spanish at `/`
 * (`index.html`), in English at `/en` (`en/index.html`), and the app alone
 * (`app.html`) for every other path, which is the one with nothing rendered
 * ahead. `vercel.json` says which path is served which, and `vite preview`
 * serves them by the same rules.
 *
 * The markup is the app's own first draw for a Visitor, rendered here in
 * Node (`src/landing/prerender.tsx`), so the app can take it over.
 */
export function landingDocuments(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'runout:landing-documents',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved
    },

    async generateBundle(_options, bundle) {
      const built = bundle['index.html']
      if (built?.type !== 'asset') return
      const app = String(built.source)
      for (const landing of await renderLandings(config.root)) {
        const source = documentFor(app, landing)
        if (landing.path === '/') built.source = source
        else this.emitFile({ type: 'asset', fileName: `${landing.path.slice(1)}/index.html`, source })
      }
      this.emitFile({ type: 'asset', fileName: APP_DOCUMENT, source: app })
    },

    configurePreviewServer(server) {
      const { rewrites } = JSON.parse(readFileSync(join(server.config.root, 'vercel.json'), 'utf8')) as {
        rewrites: { source: string; destination: string }[]
      }
      const built = join(server.config.root, server.config.build.outDir)
      // As Vercel does: a file that exists is served as itself, and any other path by the first rule it matches.
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        // What isn't a page (the API, the socket) is the proxy's, further on.
        if (request.method !== 'GET' || !request.headers.accept?.includes('text/html')) return next()
        const file = join(built, path)
        if (existsSync(file) && statSync(file).isFile()) return next()
        const rule = rewrites.find(({ source }) => new RegExp(`^${source}$`).test(path))
        if (!rule) return next()
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(readFileSync(join(built, rule.destination)))
      })
    },
  }
}

/** The app's document with one language's Landing in it. */
function documentFor(app: string, { locale, markup }: LandingDocument): string {
  const root = '<div id="root"></div>'
  if (!app.includes(root) || !app.includes('</head>')) throw new Error('index.html has no empty #root to render the Landing into')
  return app
    .replace(/<html lang="[^"]*"/, `<html lang="${locale}"`)
    .replace('</head>', () => `${heads[locale] ?? ''}</head>`)
    .replace(root, () => `<div id="root">${markup}</div>`)
}

/** The Landing in every language, drawn by the app's own modules, loaded in Node through a Vite server that serves nothing. */
async function renderLandings(root: string): Promise<LandingDocument[]> {
  const server = await createServer({
    root,
    mode: 'production',
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    // A cache of its own: sharing the development server's would throw away the dependencies that one has prepared, under its feet.
    cacheDir: join(root, 'node_modules/.vite-landing'),
  })
  try {
    const { renderLandings } = (await server.ssrLoadModule('/src/landing/prerender.tsx')) as { renderLandings(): LandingDocument[] }
    return renderLandings()
  } finally {
    await server.close()
  }
}
