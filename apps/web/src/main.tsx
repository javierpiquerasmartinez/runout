import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/500.css'
import '@fontsource/instrument-sans/600.css'
import '@fontsource/instrument-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './styles/tokens.css'
import './styles/base.css'
import './ui/ui.css'
import './status.css'
import { flushSync } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { messagesFor, wholeCatalogue } from './i18n'
import { holdsAccount, holdsSession, loadSession } from './identity/identity'
import { landingLocaleAt } from './landing/address'
import { firstDraw } from './landing/firstDraw'
import { Root } from './Root'
import { shouldReload } from './routes/recovery'
import { IconSprite } from './ui/Icon'

const page = document.documentElement
const root = document.getElementById('root')!
const locale = landingLocaleAt(window.location.pathname)
const app = <Root locale={locale} />

/** Draws the app in place of whatever the document holds. */
function drawAfresh() {
  root.replaceChildren()
  createRoot(root).render(app)
}

/** The same in one go, where the document's Landing was on screen: no frame shows the page empty in between. */
function drawOver() {
  root.replaceChildren()
  flushSync(() => createRoot(root).render(app))
}

/*
 * At the Landing's addresses the document arrives with the Landing already
 * in it (`build/landingDocuments.ts`), and the script in its head
 * (`index.html`) has run before anything was painted. It keeps the Landing
 * out of sight (`data-landing`) in two cases. One is a browser signed in to
 * an Account, told by the marker its session leaves (`identity/identity.ts`):
 * an Account at `/` is on its way Home. The other is a Visitor at `/` who
 * reads in English, by the language an identity last read in here
 * (`rememberLanguage`) or else by what the browser asks for, who is being
 * taken to `/en`; a crawler is left where it is.
 *
 * `firstDraw` says what the app does with that Landing. Once the app draws
 * the page it is shown again; while the browser is on its way to `/en`
 * nothing is, and the app draws nothing.
 */
const first = firstDraw({
  leaving: page.dataset.landing === 'leaving',
  landingInDocument: root.hasChildNodes(),
  holdsSession: holdsSession(),
  holdsAccount: holdsAccount(),
})
if (first !== 'nothing') {
  // The messages in the page's language come in a chunk of their own, which the document asks for ahead (`build/landingDocuments.ts`).
  messagesFor(locale).then(
    () => {
      // The icons' drawings sit beside the app rather than in it, in the page before any screen that points at one: the Landing's documents needn't carry them.
      flushSync(() => createRoot(document.body.appendChild(document.createElement('div'))).render(<IconSprite />))
      if (first === 'take-over') hydrateRoot(root, app)
      // Whatever the server answers, or if it doesn't: the app says so itself. What an identity is shown reads from the whole catalogue.
      else if (first === 'once-recognised') {
        void loadSession()
          .then((session) => session && wholeCatalogue())
          .then(drawOver, drawOver)
      } else drawAfresh()
      delete page.dataset.landing
    },
    // They didn't arrive, as when the build this document names is gone: the page is reloaded once for the one that is there now.
    () => shouldReload() && window.location.reload(),
  )
}
