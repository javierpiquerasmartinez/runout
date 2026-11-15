import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The messages as the app has them, not as a test does: none at first, each
 * language's arriving when it is asked for, the first load's part before
 * the whole.
 */
const i18n = async () => {
  const catalogue = await import('./catalogue')
  const { createTranslator } = await import('./translator')
  return { ...catalogue, createTranslator }
}

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('./held')
})

describe('the message catalogue', () => {
  it("has the Landing's messages, in the language asked for, once they have arrived", async () => {
    const { messagesFor, hasMessagesFor, createTranslator } = await i18n()
    expect(hasMessagesFor('en')).toBe(false)

    await messagesFor('en')

    expect(hasMessagesFor('en')).toBe(true)
    expect(hasMessagesFor('es')).toBe(false)
    expect(createTranslator('en').t('landing.signIn')).toBe('Sign in')
  })

  it('has no message of any other screen until the whole catalogue is asked for, and says which was read too soon', async () => {
    const { messagesFor, wholeCatalogue, hasWholeCatalogue, createTranslator } = await i18n()
    await messagesFor('es')
    const { t } = createTranslator('es')

    expect(hasWholeCatalogue()).toBe(false)
    expect(() => t('login.or')).toThrow('"login.or"')

    await wholeCatalogue()

    expect(hasWholeCatalogue()).toBe(true)
    expect(t('login.or')).toBe('o')
    expect(t('landing.signIn')).toBe('Iniciar sesión')
  })

  it('needs the whole of a language asked for once any other screen has been', async () => {
    const { messagesFor, wholeCatalogue, hasMessagesFor, createTranslator } = await i18n()
    await messagesFor('es')
    await wholeCatalogue()
    // The Landing's messages in English are here, and are not enough any more.
    await import('./messages/first/en')
    expect(hasMessagesFor('en')).toBe(false)

    await messagesFor('en')

    expect(createTranslator('en').t('login.or')).toBe('or')
  })

  it('switches language once the new one has arrived, and not before', async () => {
    const { messagesFor } = await i18n()
    const { I18nProvider } = await import('./I18nProvider')
    const { useI18n } = await import('./useI18n')
    await messagesFor('es')
    function Probe() {
      const { t, setLocale } = useI18n()
      return (
        <button type="button" onClick={() => setLocale('en')}>
          {t('landing.signIn')}
        </button>
      )
    }
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Iniciar sesión')).toBeTruthy()

    expect(await screen.findByText('Sign in')).toBeTruthy()
  })
})
