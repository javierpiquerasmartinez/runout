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
  },
]

/** Each document the build wrote, by its file's name. */
let documents: Map<string, string>

beforeAll(async () => {
  // As `pnpm build` builds it: vitest's own NODE_ENV would bundle React's development build.
  const env = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const built = await build({ root: web, mode: 'production', logLevel: 'silent', build: { write: false } })
    const { output } = Array.isArray(built) ? built[0] : (built as { output: unknown[] })
    documents = new Map(
      (output as { type: string; fileName: string; source: string | Uint8Array }[])
        .filter((file) => file.type === 'asset' && file.fileName.endsWith('.html'))
        .map((file) => [file.fileName, Buffer.from(file.source).toString()]),
    )
  } finally {
    process.env.NODE_ENV = env
  }
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

/** The scripts and styles a document asks for. */
const askedBy = (document: string) => [...document.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]*)"/g)].map(([, address]) => address)

describe.each(landings)("the Landing's document at $address", ({ language, fileName, headline, captions, signIn, haveCode }) => {
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

  it("asks ahead for the headline's font", () => {
    expect(documents.get(fileName)).toMatch(/<link rel="preload" as="font" type="font\/woff2" href="\/assets\/instrument-serif-latin-400-normal-[\w-]+\.woff2" crossorigin>/)
  })

  it('asks for the same scripts and styles as the document of every other path', () => {
    expect(askedBy(documents.get(fileName)!)).not.toEqual([])
    expect(askedBy(documents.get(fileName)!)).toEqual(askedBy(documents.get('app.html')!))
  })
})

describe('the document of every other path', () => {
  it('holds nothing of the Landing: only the Landing is rendered ahead', () => {
    expect(documents.get('app.html')).toContain('<div id="root"></div>')
  })

  it('is the only other document', () => {
    expect([...documents.keys()].toSorted()).toEqual(['app.html', 'en/index.html', 'index.html'])
  })
})
