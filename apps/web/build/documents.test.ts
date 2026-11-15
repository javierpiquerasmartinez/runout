// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

/*
 * The documents the build writes: the Landing's copy is in the page before
 * any script runs, in Spanish at `/` and in English at `/en`, and every
 * other path is served a document with nothing in it but the app. Read from
 * the build itself, as text, the way a search engine reads them.
 */

const web = fileURLToPath(new URL('..', import.meta.url))

const landings = [
  {
    language: 'es',
    address: '/',
    fileName: 'index.html',
    headline: 'Tus manos. Tus números. Tu mesa.',
    captions: [
      'Tu historial de póker, por fin en un sitio donde estudiarlo.',
      'Todo acaba aquí.',
      'Los historiales de tu tracker, guardados y tuyos. Mano a mano.',
      'Tu gráfica no miente.',
      'Importa tus manos y mira, sin adornos, si estás ganando.',
      'Una mesa. Todo el grupo. La misma mano.',
      'Repasad cada acción sincronizados, cada uno en su pantalla. Sin compartir pantalla.',
      'Solo por invitación.',
    ],
    signIn: 'Iniciar sesión',
    haveCode: '¿Tienes un código de sala?',
    locale: 'es_ES',
    title: 'Runout: estudia tus manos de póker, a solas o con tu grupo',
    pictureSays: 'Una mesa de póker a oscuras, con el borde iluminado: as y rey de picas en mano y el color completo en el river.',
    description:
      'Guarda los historiales de tu tracker, mira en tu gráfica si estás ganando y repasa cada mano, a solas o con tu grupo en una sala. Solo por invitación.',
  },
  {
    language: 'en',
    address: '/en',
    fileName: 'en/index.html',
    headline: 'Your hands. Your numbers. Your table.',
    captions: [
      'Your poker history, finally somewhere to study it.',
      'It all ends up here.',
      'The hand histories from your tracker, kept and yours. Hand by hand.',
      "Your graph doesn't lie.",
      "Import your hands and see, plainly, whether you're winning.",
      'One table. The whole group. The same hand.',
      'Go through every action in sync, each on your own screen. No screen sharing.',
      'Invitation only.',
    ],
    signIn: 'Sign in',
    haveCode: 'Have a room code?',
    locale: 'en_US',
    title: 'Runout: study your poker hands, alone or with your group',
    pictureSays: 'A poker table in the dark, its rim lit: ace and king of spades in the hole and the flush made on the river.',
    description:
      "Keep the hand histories from your tracker, see on your graph whether you're winning and go through every hand, alone or with your group in a room. Invitation only.",
  },
]

/** The site's address the build is told, as `VITE_SITE_URL` (see `vite.config.ts`). */
const site = 'https://runout.test'

/** Every file the build wrote, by its name. */
let files: Map<string, Buffer>
/** Each document among them. */
let documents: Map<string, string>

/** Builds the app as `pnpm build` builds it, in memory. */
async function built(): Promise<Map<string, Buffer>> {
  // vitest's own NODE_ENV would bundle React's development build.
  const env = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const result = await build({ root: web, mode: 'production', logLevel: 'silent', build: { write: false } })
    const { output } = Array.isArray(result) ? result[0] : (result as { output: unknown[] })
    return new Map(
      (output as { fileName: string; source?: string | Uint8Array; code?: string }[]).map((file) => [
        file.fileName,
        Buffer.from(file.source ?? file.code ?? ''),
      ]),
    )
  } finally {
    process.env.NODE_ENV = env
  }
}

beforeAll(async () => {
  files = await built()
  documents = new Map([...files].filter(([name]) => name.endsWith('.html')).map(([name, content]) => [name, content.toString()]))
}, 120_000)

/** What is inside the app's root in a document. */
const rootOf = (document: string) => /<div id="root">(.*)<\/div>\s*<\/body>/s.exec(document)?.[1] ?? ''

/** Text as a browser shows it, from text as HTML writes it. */
const shown = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** The attributes and the text of every element of one of `tags` in the Landing a document holds, in the document's order. */
function elementsOf(document: string, tags: string) {
  return [...rootOf(document).matchAll(new RegExp(`<(?:${tags})\\b([^>]*)>([^<]*)</(?:${tags})>`, 'g'))].map(([, attributes, text]) => ({
    attributes,
    text: shown(text),
  }))
}

/** What is inside a document's head. */
const headOf = (document: string) => /<head>(.*)<\/head>/s.exec(document)?.[1] ?? ''

/** The value of one attribute among an element's. */
function attribute(attributes: string, name: string) {
  const value = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1]
  return value === undefined ? undefined : shown(value)
}

/** What a document's head says under each name: the contents of its `<meta>` elements, by their `name` or `property`. */
function metaOf(document: string): Record<string, string[]> {
  const said: Record<string, string[]> = {}
  for (const [, attributes] of headOf(document).matchAll(/<meta\b([^>]*)>/g)) {
    const name = attribute(attributes, 'name') ?? attribute(attributes, 'property')
    if (name) (said[name] ??= []).push(attribute(attributes, 'content') ?? '')
  }
  return said
}

/** The titles in a document's head. */
const titlesOf = (document: string) => [...headOf(document).matchAll(/<title>([^<]*)<\/title>/g)].map(([, title]) => shown(title))

/** The links of one `rel` in a document's head: each one's language, where it has one, and its address. */
const linksOf = (document: string, rel: string) =>
  [...headOf(document).matchAll(/<link\b([^>]*)>/g)]
    .filter(([, attributes]) => attribute(attributes, 'rel') === rel)
    .map(([, attributes]) => [attribute(attributes, 'hreflang'), attribute(attributes, 'href')])

/** The width and height a JPEG says it has, from its frame header. */
function jpegSize(picture: Buffer): [width: number, height: number] | undefined {
  if (picture.readUInt16BE(0) !== 0xffd8) return undefined
  for (let at = 2; at + 9 < picture.length; ) {
    const marker = picture.readUInt16BE(at)
    // SOF0 to SOF15 hold the size; DHT, JPG and DAC, numbered among them, don't.
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return [picture.readUInt16BE(at + 7), picture.readUInt16BE(at + 5)]
    }
    at += 2 + picture.readUInt16BE(at + 2)
  }
  return undefined
}

/**
 * Whether the crawl file lets any crawler fetch `path`, by the rules crawlers
 * read it by (RFC 9309): the longest rule that matches decides, allowing
 * where two are as long, `*` standing for anything and `$` for the end.
 */
function mayCrawl(robots: string, path: string): boolean {
  const lines = robots.split('\n').map((line) => line.split(':').map((part) => part.trim()))
  const everyone = lines.findIndex(([field, value]) => field.toLowerCase() === 'user-agent' && value === '*')
  let decides = { allows: true, length: -1 }
  for (const [field, ...rest] of lines.slice(everyone + 1)) {
    const kind = field.toLowerCase()
    if (kind === 'user-agent') break
    if (kind !== 'allow' && kind !== 'disallow') continue
    const rule = rest.join(':')
    const pattern = rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    if (!rule || !new RegExp(`^${pattern}`).test(path)) continue
    const allows = kind === 'allow'
    if (rule.length > decides.length || (rule.length === decides.length && allows)) decides = { allows, length: rule.length }
  }
  return decides.allows
}

/** The scripts and styles a document asks for: the site's own files, not the addresses its head names. */
const askedBy = (document: string) =>
  [...document.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]*)"/g)].map(([, address]) => address).filter((address) => address.startsWith('/'))

describe.each(landings)("the Landing's document at $address", ({ language, locale, address, fileName, headline, captions, signIn, haveCode, title, description, pictureSays }) => {
  it('says its language', () => {
    expect(documents.get(fileName)).toContain(`<html lang="${language}">`)
  })

  it('holds the headline, as the one top-level heading', () => {
    expect(elementsOf(documents.get(fileName)!, 'h1').map(({ text }) => text)).toEqual([headline])
  })

  it('holds every caption, in the order of the story', () => {
    const copy = elementsOf(documents.get(fileName)!, 'h2|p')
      .map(({ text }) => text)
      .filter((text) => captions.includes(text))
    expect(copy).toEqual(captions)
  })

  it('holds both ways on, each leading where it says', () => {
    const links = elementsOf(documents.get(fileName)!, 'a').map(({ attributes, text }) => [text, /href="([^"]*)"/.exec(attributes)?.[1]])
    expect(links).toEqual([
      [haveCode, '/room'],
      [signIn, '/login'],
    ])
  })

  it('has one title, which says what Runout is', () => {
    expect(titlesOf(documents.get(fileName)!)).toEqual([title])
  })

  it('has one description, in its language', () => {
    expect(metaOf(documents.get(fileName)!).description).toEqual([description])
  })

  it('says its one address, on the site the build was told', () => {
    expect(linksOf(documents.get(fileName)!, 'canonical')).toEqual([[undefined, site + address]])
  })

  it('links to both languages and to a default, itself among them', () => {
    expect(linksOf(documents.get(fileName)!, 'alternate')).toEqual([
      ['es', `${site}/`],
      ['en', `${site}/en`],
      ['x-default', `${site}/`],
    ])
  })

  it('previews as a link with its title, its description and its address', () => {
    const meta = metaOf(documents.get(fileName)!)
    expect(meta['og:title']).toEqual([title])
    expect(meta['og:description']).toEqual([description])
    expect(meta['og:url']).toEqual([site + address])
    expect(meta['og:type']).toEqual(['website'])
    expect(meta['og:site_name']).toEqual(['Runout'])
    expect(meta['og:locale']).toEqual([locale])
  })

  it('previews with a picture of the scene, at an absolute address, the size a large preview expects', () => {
    const meta = metaOf(documents.get(fileName)!)
    const [picture] = meta['og:image']
    expect(meta['og:image']).toHaveLength(1)
    expect(picture.startsWith(`${site}/`)).toBe(true)
    // The picture is among what the build wrote, and is as large as the document says: 1200 by 630, at 1.91 to 1.
    expect(jpegSize(files.get(picture.slice(site.length + 1))!)).toEqual([1200, 630])
    expect([meta['og:image:width'], meta['og:image:height']]).toEqual([['1200'], ['630']])
    expect(meta['og:image:alt']).toEqual([pictureSays])
    expect(meta['twitter:card']).toEqual(['summary_large_image'])
  })

  it('may be indexed', () => {
    expect(metaOf(documents.get(fileName)!).robots).toBeUndefined()
  })

  it("asks ahead for the headline's font", () => {
    expect(documents.get(fileName)).toMatch(/<link rel="preload" as="font" type="font\/woff2" href="\/assets\/instrument-serif-latin-400-normal-[\w-]+\.woff2" crossorigin>/)
  })

  it('asks for the same scripts and styles as the document of every other path, but for the messages, which are its own language\'s', () => {
    const messages = (address: string) => [...files.keys()].some((name) => `/${name}` === address && /^assets\/(?:es|en)-/.test(name))
    const asked = askedBy(documents.get(fileName)!)
    expect(asked.filter((address) => !messages(address))).not.toEqual([])
    expect(asked.filter((address) => !messages(address))).toEqual(askedBy(documents.get('app.html')!).filter((address) => !messages(address)))

    // One chunk of messages, asked for ahead: the first load's, in this document's language and no other.
    const [own, ...others] = asked.filter(messages)
    expect(others).toEqual([])
    const chunk = files.get(own.slice(1))!.toString()
    expect(chunk).toContain(signIn)
    expect(chunk).not.toContain(landings.find((other) => other.language !== language)!.haveCode)
    // And not the rest of the catalogue, which arrives with the first screen that isn't the Landing.
    expect(chunk.length).toBeLessThan(4000)
    expect(documents.get(fileName)).toContain(`<link rel="modulepreload" crossorigin href="${own}">`)
  })
})

describe('the document of every other path', () => {
  it('holds nothing of the Landing: only the Landing is rendered ahead', () => {
    expect(documents.get('app.html')).toContain('<div id="root"></div>')
  })

  it('is the only other document', () => {
    expect([...documents.keys()].toSorted()).toEqual(['app.html', 'en/index.html', 'index.html'])
  })

  it('asks not to be indexed: it is the app, behind the Sign-in', () => {
    expect(metaOf(documents.get('app.html')!).robots).toEqual(['noindex'])
  })

  it("has the brand's name alone as its title, and nothing of a link's preview", () => {
    const app = documents.get('app.html')!
    expect(titlesOf(app)).toEqual(['Runout'])
    expect(Object.keys(metaOf(app)).filter((name) => name === 'description' || name.startsWith('og:'))).toEqual([])
    expect([...linksOf(app, 'canonical'), ...linksOf(app, 'alternate')]).toEqual([])
  })
})

describe('the crawl file', () => {
  const robots = () => files.get('robots.txt')!.toString()

  it("lets crawlers fetch the Landing's two addresses, and what they need to draw it", () => {
    const drawnWith = askedBy(documents.get('index.html')!)
    const picture = metaOf(documents.get('index.html')!)['og:image'][0].slice(site.length)
    expect(drawnWith).not.toEqual([])
    for (const path of ['/', '/en', picture, ...drawnWith]) expect([path, mayCrawl(robots(), path)]).toEqual([path, true])
  })

  it("keeps them out of the app's pages and the API", () => {
    const behind = ['/login', '/room', '/room/ABCD', '/library', '/library/hands/1', '/results', '/settings', '/admin', '/app.html', '/api/health', '/ws', '/english']
    for (const path of behind) expect([path, mayCrawl(robots(), path)]).toEqual([path, false])
  })

  it('points to the map, at its absolute address', () => {
    expect(robots().split('\n').filter((line) => /^sitemap:/i.test(line))).toEqual([`Sitemap: ${site}/sitemap.xml`])
  })
})

describe('the map', () => {
  it("lists the Landing's two addresses and no other, each with both languages and the default as its alternates", () => {
    const map = files.get('sitemap.xml')!.toString()
    expect(map).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">')
    const listed = [...map.matchAll(/<url>(.*?)<\/url>/gs)].map(([, url]) => ({
      address: /<loc>([^<]*)<\/loc>/.exec(url)?.[1],
      alternates: [...url.matchAll(/<xhtml:link\b([^>]*)\/>/g)].map(([, attributes]) => [
        attribute(attributes, 'rel'),
        attribute(attributes, 'hreflang'),
        attribute(attributes, 'href'),
      ]),
    }))
    const alternates = [
      ['alternate', 'es', `${site}/`],
      ['alternate', 'en', `${site}/en`],
      ['alternate', 'x-default', `${site}/`],
    ]
    expect(listed).toEqual([
      { address: `${site}/`, alternates },
      { address: `${site}/en`, alternates },
    ])
  })
})

describe("the site's address", () => {
  it('is whatever the build is told, with nothing of it typed into the pages', async () => {
    const told = process.env.VITE_SITE_URL
    process.env.VITE_SITE_URL = 'https://elsewhere.test/'
    try {
      const elsewhere = await built()
      expect(linksOf(elsewhere.get('en/index.html')!.toString(), 'canonical')).toEqual([[undefined, 'https://elsewhere.test/en']])
      expect(elsewhere.get('robots.txt')!.toString()).toContain('Sitemap: https://elsewhere.test/sitemap.xml')
      for (const name of ['index.html', 'en/index.html', 'app.html', 'robots.txt', 'sitemap.xml']) {
        expect([name, elsewhere.get(name)!.toString().includes('runout.test')]).toEqual([name, false])
      }
    } finally {
      process.env.VITE_SITE_URL = told
    }
  }, 120_000)

  it.each([
    ['is missing', undefined],
    ['is no address', 'runout'],
    ['is more than a site', 'https://runout.test/poker'],
  ])('fails the build, naming the variable, when it %s', async (_, value) => {
    const told = process.env.VITE_SITE_URL
    if (value === undefined) delete process.env.VITE_SITE_URL
    else process.env.VITE_SITE_URL = value
    try {
      await expect(built()).rejects.toThrow(/VITE_SITE_URL/)
    } finally {
      process.env.VITE_SITE_URL = told
    }
  }, 120_000)
})
