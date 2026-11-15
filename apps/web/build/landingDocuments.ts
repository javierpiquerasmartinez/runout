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

/** The picture a link to Runout previews with: a capture of the scene, made with its stills by `pnpm capture:landing`, at the size a large preview expects. */
const PREVIEW = { file: 'src/landing/preview.jpg', width: 1200, height: 630 }

/** The variable the build reads the site's address from. */
const SITE = 'VITE_SITE_URL'

/**
 * What each language's document says of itself in its head, beyond what
 * `index.html` says for all of them: its title and description, which say
 * what Runout is to someone searching for it, the language as a link's
 * preview names it, and what its preview's picture shows.
 */
const heads: Record<string, { title: string; description: string; locale: string; pictureSays: string }> = {
  es: {
    title: 'Runout: estudia tus manos de póker, a solas o con tu grupo',
    description:
      'Guarda los historiales de tu tracker, mira en tu gráfica si estás ganando y repasa cada mano, a solas o con tu grupo en una sala. Solo por invitación.',
    locale: 'es_ES',
    pictureSays: 'Una mesa de póker a oscuras, con el borde iluminado: as y rey de picas en mano y el color completo en el river.',
  },
  en: {
    title: 'Runout: study your poker hands, alone or with your group',
    description:
      "Keep the hand histories from your tracker, see on your graph whether you're winning and go through every hand, alone or with your group in a room. Invitation only.",
    locale: 'en_US',
    pictureSays: 'A poker table in the dark, its rim lit: ace and king of spades in the hole and the flush made on the river.',
  },
}

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
      const site = siteAddress(config.env[SITE])
      const landings = await renderLandings(config.root)
      const picture = this.emitFile({ type: 'asset', name: 'landing-preview.jpg', source: readFileSync(join(config.root, PREVIEW.file)) })
      const found = { site, landings, picture: `${site}/${this.getFileName(picture)}` }
      for (const landing of landings) {
        const source = documentFor(app, landing, found)
        if (landing.path === '/') built.source = source
        else this.emitFile({ type: 'asset', fileName: `${landing.path.slice(1)}/index.html`, source })
      }
      // The app is behind the Sign-in: nothing of it is for a search engine's results.
      this.emitFile({ type: 'asset', fileName: APP_DOCUMENT, source: app.replace('</head>', '<meta name="robots" content="noindex"></head>') })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: crawlFile(found) })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: map(found) })
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

/** What a document, the crawl file and the map are written from: where the site is, the Landing in each language, and the preview picture's address. */
interface Found {
  site: string
  landings: LandingDocument[]
  picture: string
}

/**
 * The site's address, as the build is told it: its scheme and host and no
 * more, since the Landing's own address, the other language's and the
 * preview picture's must each be written whole. The build fails without it
 * rather than write pages a search engine can't place.
 */
function siteAddress(told: string | undefined): string {
  const address = URL.parse(told ?? '')
  if (!address || !/^https?:$/.test(address.protocol) || address.pathname !== '/' || address.search || address.hash) {
    throw new Error(
      `${SITE} ${told ? `is "${told}", which is not` : 'is not set: it must be'} the address the site is served at, as https://host with no path. ` +
        "The Landing's canonical address, its link preview, robots.txt and sitemap.xml are written from it. " +
        "Set it in apps/web/.env.local or in the build's environment (see the README, \"Deploying\").",
    )
  }
  return address.origin
}

const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The links from the Landing to itself in each language, and to the one a reader of neither is given: the same on every one, as a search engine asks. */
function alternates({ site, landings }: Found, link: (language: string, address: string) => string): string {
  const spoken = landings.map(({ locale, path }) => link(locale, site + path))
  return [...spoken, link('x-default', `${site}/`)].join('')
}

/** What one language's document says of itself in its head. */
function headFor({ locale, path }: LandingDocument, found: Found): string {
  const head = heads[locale]
  if (!head) throw new Error(`The Landing in "${locale}" has no title or description: build/landingDocuments.ts`)
  const address = found.site + path
  const meta = (key: 'name' | 'property', name: string, content: string | number) => `<meta ${key}="${name}" content="${escaped(String(content))}">`
  return [
    `<title>${escaped(head.title)}</title>`,
    meta('name', 'description', head.description),
    `<link rel="canonical" href="${address}">`,
    alternates(found, (language, href) => `<link rel="alternate" hreflang="${language}" href="${href}">`),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'Runout'),
    meta('property', 'og:locale', head.locale),
    meta('property', 'og:url', address),
    meta('property', 'og:title', head.title),
    meta('property', 'og:description', head.description),
    meta('property', 'og:image', found.picture),
    meta('property', 'og:image:width', PREVIEW.width),
    meta('property', 'og:image:height', PREVIEW.height),
    meta('property', 'og:image:alt', head.pictureSays),
    // The large picture; the title, the description and the picture are read from the ones above.
    meta('name', 'twitter:card', 'summary_large_image'),
  ].join('')
}

/**
 * What crawlers are told: the Landing's addresses and what a browser needs
 * to draw them may be fetched, and nothing else, which is the app behind the
 * Sign-in and the API. The longest rule that matches a path decides, and `$`
 * ends a path, so `/en` is allowed and `/english` is not.
 */
function crawlFile({ site, landings }: Found): string {
  return [
    'User-agent: *',
    ...landings.map(({ path }) => `Allow: ${path}$`),
    'Allow: /assets/',
    'Allow: /favicon.svg',
    'Disallow: /',
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ].join('\n')
}

/** The map of the site for search engines: the Landing's address in each language, each with its alternates. */
function map(found: Found): string {
  const links = alternates(found, (language, href) => `\n    <xhtml:link rel="alternate" hreflang="${language}" href="${href}"/>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...found.landings.map(({ path }) => `  <url>\n    <loc>${found.site}${path}</loc>${links}\n  </url>`),
    '</urlset>',
    '',
  ].join('\n')
}

/** The app's document with one language's Landing in it, and in its head what that language says of itself in place of the app's bare title. */
function documentFor(app: string, landing: LandingDocument, found: Found): string {
  const root = '<div id="root"></div>'
  const title = /<title>[^<]*<\/title>\s*/
  if (!app.includes(root) || !app.includes('</head>') || !title.test(app)) {
    throw new Error('index.html has no title, or no empty #root to render the Landing into')
  }
  return app
    .replace(/<html lang="[^"]*"/, `<html lang="${landing.locale}"`)
    .replace(title, '')
    .replace('</head>', () => `${headFor(landing, found)}</head>`)
    .replace(root, () => `<div id="root">${landing.markup}</div>`)
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
