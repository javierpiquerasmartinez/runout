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
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { I18nProvider } from './i18n'
import { IconSprite } from './ui/Icon'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <IconSprite />
      <App />
    </I18nProvider>
  </StrictMode>,
)
