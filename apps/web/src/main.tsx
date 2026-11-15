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
import { holdsSession } from './identity/identity'
import { landingLocaleAt } from './landing/address'
import { Root } from './Root'
import { IconSprite } from './ui/Icon'

// The icons' drawings sit beside the app rather than in it, in the page before any screen that points at one: the Landing's documents needn't carry them.
flushSync(() => createRoot(document.body.appendChild(document.createElement('div'))).render(<IconSprite />))

const root = document.getElementById('root')!
const app = <Root locale={landingLocaleAt(window.location.pathname)} />

/*
 * At the Landing's addresses the document arrives with the Landing already
 * in it (`build/landingDocuments.ts`). A Visitor's first draw is that same
 * Landing, so the app takes the markup over as it is and nothing is drawn
 * twice. A browser that holds a session draws something else first, while
 * it is recognised, so the markup goes.
 *
 * The script in the document's head (`index.html`) has run before anything
 * was painted, and kept the Landing out of sight (`data-landing="hidden"`)
 * in two cases. One is a browser that holds a session, told by the marker a
 * session leaves (`identity/identity.ts`): an Account at `/` is on its way
 * Home. The other is a Visitor at `/` who reads in English, by the language
 * an identity last read in here (`rememberLanguage`) or else by what the
 * browser asks for, who is being taken to `/en`; a crawler is left where it
 * is. Now that the app draws the page, it is shown again.
 */
if (root.hasChildNodes() && !holdsSession()) {
  hydrateRoot(root, app)
} else {
  root.replaceChildren()
  createRoot(root).render(app)
}
delete document.documentElement.dataset.landing
