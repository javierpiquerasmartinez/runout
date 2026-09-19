import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from './I18nProvider'
import { useI18n } from './useI18n'

function Probe() {
  const { t, formatNumber, setLocale } = useI18n()
  return (
    <>
      <p>{t('design.buttons.createRoom')}</p>
      <p>{formatNumber(1500.5)}</p>
      <button type="button" onClick={() => setLocale('en')}>en</button>
    </>
  )
}

describe('I18nProvider', () => {
  it('speaks Spanish by default', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(screen.getByText('Crear sala')).toBeDefined()
    expect(screen.getByText('1500,5')).toBeDefined()
    expect(document.documentElement.lang).toBe('es')
  })

  it('switches the whole UI to English', async () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'en' }))
    expect(screen.getByText('Create room')).toBeDefined()
    expect(screen.getByText('1,500.5')).toBeDefined()
    expect(document.documentElement.lang).toBe('en')
  })
})
