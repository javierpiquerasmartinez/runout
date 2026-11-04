import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { DEV_PERSONAS, type DevPersona } from './devPersonas'
import './DevSignIn.css'

/** One button per test persona; drawn only in local development (see `devPersonas`). */
export function DevSignIn({ onSignIn }: { onSignIn: (persona: DevPersona) => void }) {
  const { t } = useI18n()
  return (
    <div className="dev-sign-in" role="group" aria-label={t('identity.devSignIn.title')}>
      <p className="dev-sign-in__title">{t('identity.devSignIn.title')}</p>
      <div className="dev-sign-in__personas">
        {DEV_PERSONAS.map((persona) => (
          <Button key={persona} size="compact" onClick={() => onSignIn(persona)}>
            {t(`identity.devSignIn.${persona}`)}
          </Button>
        ))}
      </div>
    </div>
  )
}
