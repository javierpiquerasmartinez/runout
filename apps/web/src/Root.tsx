import { StrictMode } from 'react'
import App from './App.tsx'
import { I18nProvider, type Locale } from './i18n'

/**
 * The whole app, as the browser mounts it and as the build renders it ahead
 * for the Landing's documents: one tree for both, so the app can take the
 * markup in the document over as its own.
 */
export function Root({ locale }: { locale: Locale }) {
  return (
    <StrictMode>
      <I18nProvider initialLocale={locale}>
        <App />
      </I18nProvider>
    </StrictMode>
  )
}
