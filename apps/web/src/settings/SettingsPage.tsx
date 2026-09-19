import { useState, type FormEvent } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import type { Identity } from '../identity/identity'
import { formatScreenNames, parseScreenNames } from '../identity/screenNames'
import { followLink, navigate } from '../routing'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import './SettingsPage.css'

export const settingsPath = '/settings'

/**
 * The "Ajustes y perfil" board, so far only its "Perfil y juego" card with the
 * Screen Names a person plays under. The rest of the board is issue 17.
 */
export function SettingsPage() {
  const { t } = useI18n()
  return (
    <div className="settings">
      <header className="settings__header">
        <a href="/" className="settings__brand" aria-label={t('room.home')} onClick={followLink}>
          <BrandMark size={22} />
          <span className="ro-serif">{t('brand.wordmark')}</span>
        </a>
        <span className="settings__spacer" />
        <Button variant="ghost" size="compact" onClick={() => (history.length > 1 ? history.back() : navigate('/'))}>
          <Icon name="chevron" size={14} className="settings__back-icon" />
          {t('settings.back')}
        </Button>
      </header>
      <main className="settings__main">
        <div className="settings__column">
          <div className="settings__intro">
            <h1 className="settings__title ro-serif">{t('settings.title')}</h1>
            <p className="settings__subtitle">{t('settings.subtitle')}</p>
          </div>
          <ScreenNamesCard />
        </div>
      </main>
    </div>
  )
}

function ScreenNamesCard() {
  const { t } = useI18n()
  const { token, identity, rememberScreenNames } = useSession()
  const [text, setText] = useState(formatScreenNames(identity.screenNames))
  const [state, setState] = useState<
    { state: 'editing' } | { state: 'saving' } | { state: 'saved' } | { state: 'failed'; reason: FailureReason }
  >({ state: 'editing' })
  const unchanged = formatScreenNames(parseScreenNames(text)) === formatScreenNames(identity.screenNames)

  function save(event: FormEvent) {
    event.preventDefault()
    setState({ state: 'saving' })
    api<Identity>('/identities/me/screen-names', {
      token,
      method: 'PUT',
      body: { screenNames: parseScreenNames(text) },
    })
      .then(({ screenNames }) => {
        rememberScreenNames(screenNames)
        setText(formatScreenNames(screenNames))
        setState({ state: 'saved' })
      })
      .catch((error: unknown) => setState({ state: 'failed', reason: reasonOf(error) }))
  }

  return (
    <form className="settings-card" onSubmit={save} noValidate>
      <TextField
        label={t('settings.screenNames.label')}
        className="settings-card__screen-names"
        value={text}
        placeholder="Javier_PS, JaviPQ88"
        spellCheck={false}
        autoComplete="off"
        aria-describedby="settings-screen-names-hint"
        error={state.state === 'failed' ? t(`reason.${state.reason}`) : undefined}
        onChange={(event) => {
          setText(event.target.value)
          setState({ state: 'editing' })
        }}
      />
      <p id="settings-screen-names-hint" className="settings-card__hint">
        {t('settings.screenNames.hint')}
      </p>
      <div className="settings-card__actions">
        <p className="settings-card__status" role="status">
          {state.state === 'saved' && t('settings.saved')}
        </p>
        <Button
          type="submit"
          variant="primary"
          size="compact"
          disabledReason={
            state.state === 'saving' ? t('settings.saving') : unchanged ? t('settings.unchanged') : undefined
          }
        >
          {t('settings.save')}
        </Button>
      </div>
    </form>
  )
}
