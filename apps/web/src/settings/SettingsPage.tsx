import { useState, type FormEvent, type ReactNode } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { locales, useI18n, type MessageKey } from '../i18n'
import { useSession } from '../identity/context'
import { DISPLAY_NAME_MAX_LENGTH, type Identity } from '../identity/identity'
import { formatScreenNames, parseScreenNames } from '../identity/screenNames'
import type { DeckStyle, DisplayUnit, Preferences, Theme } from '../preferences/preferences'
import { quantity } from '../room/quantity'
import { useRoomSession } from '../room/roomSessionContext'
import { roomPath } from '../room/roomCode'
import { followLink, navigate } from '../routing'
import { Avatar } from '../ui/Avatar'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { Card, type Deck } from '../ui/Card'
import { Icon } from '../ui/Icon'
import { Secondary } from '../ui/Secondary'
import { SegmentedControl } from '../ui/SegmentedControl'
import { TextField } from '../ui/TextField'
import { Toggle } from '../ui/Toggle'
import './SettingsPage.css'

export const settingsPath = '/settings'

/**
 * The "Ajustes y perfil" board: who this person is in the Rooms and how they
 * read the table. Every preference applies the moment it is picked, only on
 * this person's screens, and is stored with their identity. Opened from a
 * Room, the Room carries on behind it and the header leads back to it.
 */
export function SettingsPage() {
  const { t } = useI18n()
  const { identity } = useSession()
  const name = identity.displayName ?? ''
  return (
    <div className="settings">
      <header className="settings__header">
        <a href="/" className="settings__brand" aria-label={t('room.home')} onClick={followLink}>
          <BrandMark size={22} />
          <span className="ro-serif">{t('brand.wordmark')}</span>
        </a>
        <span className="settings__divider" aria-hidden="true" />
        <span className="settings__where">{t('room.settings')}</span>
        <span className="settings__spacer" />
        <BackLink />
        {name && <Avatar name={name} seed={identity.id} size={28} />}
      </header>
      <div className="settings__body">
        <nav className="settings__nav" aria-label={t('settings.nav')}>
          <a href={settingsPath} className="settings__nav-item" aria-current="page" onClick={followLink}>
            <Icon name="profile" size={16} />
            {t('settings.title')}
          </a>
        </nav>
        <main className="settings__main">
          <div className="settings__column settings__column--main">
            <div className="settings__intro">
              <h1 className="settings__title ro-serif">{t('settings.title')}</h1>
              <p className="settings__subtitle">{t('settings.subtitle')}</p>
            </div>
            <ProfileCard />
            <TableReadingCard />
          </div>
          <div className="settings__column settings__column--side">
            <DeckCard />
            <ThemeCard />
            <LanguageCard />
            <ShortcutsCard />
          </div>
        </main>
      </div>
    </div>
  )
}

/** Back to the Room still going on behind this page, or simply back. */
function BackLink() {
  const { t } = useI18n()
  const room = useRoomSession()
  if (room?.view.phase === 'in-room') {
    return (
      <a href={roomPath(room.code)} className="settings__back-to-room" onClick={followLink}>
        <span className="settings__live-dot" aria-hidden="true" />
        {t('settings.backTo', { name: room.view.room.name })}
      </a>
    )
  }
  return (
    <Button variant="ghost" size="compact" onClick={() => (history.length > 1 ? history.back() : navigate('/'))}>
      <Icon name="chevron" size={14} className="settings__back-icon" />
      {t('settings.back')}
    </Button>
  )
}

type Saving =
  | { state: 'editing' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'failed'; field: 'displayName' | 'screenNames'; reason: FailureReason }

/** Display Name and Screen Names, saved together. A new Display Name shows in the Room at once. */
function ProfileCard() {
  const { t } = useI18n()
  const { token, identity, rememberDisplayName, rememberScreenNames } = useSession()
  const [name, setName] = useState(identity.displayName ?? '')
  const [names, setNames] = useState(formatScreenNames(identity.screenNames))
  const [saving, setSaving] = useState<Saving>({ state: 'editing' })
  const nameChanged = name.trim() !== (identity.displayName ?? '')
  const namesChanged = formatScreenNames(parseScreenNames(names)) !== formatScreenNames(identity.screenNames)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving({ state: 'saving' })
    let field: 'displayName' | 'screenNames' = 'displayName'
    try {
      if (nameChanged) {
        const saved = await api<Identity>('/identities/me/display-name', {
          token,
          method: 'PUT',
          body: { displayName: name },
        })
        rememberDisplayName(saved.displayName ?? '')
        setName(saved.displayName ?? '')
      }
      field = 'screenNames'
      if (namesChanged) {
        const saved = await api<Identity>('/identities/me/screen-names', {
          token,
          method: 'PUT',
          body: { screenNames: parseScreenNames(names) },
        })
        rememberScreenNames(saved.screenNames)
        setNames(formatScreenNames(saved.screenNames))
      }
      setSaving({ state: 'saved' })
    } catch (error) {
      setSaving({ state: 'failed', field, reason: reasonOf(error) })
    }
  }

  const failed = (field: 'displayName' | 'screenNames') =>
    saving.state === 'failed' && saving.field === field ? t(`reason.${saving.reason}`) : undefined
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value)
    setSaving({ state: 'editing' })
  }

  return (
    <form className="settings-card" onSubmit={save} noValidate>
      <div className="settings-card__who">
        <span className="settings-card__avatar">
          <Avatar name={name || '?'} seed={identity.id} size={56} />
        </span>
        <span className="settings-card__name">{identity.displayName}</span>
      </div>
      <hr className="settings-card__rule" />
      <div className="settings-card__fields">
        <TextField
          label={t('settings.displayName.label')}
          className="settings-card__display-name"
          value={name}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          error={failed('displayName')}
          onChange={(event) => edit(setName)(event.target.value)}
        />
        <TextField
          label={t('settings.screenNames.label')}
          className="settings-card__screen-names"
          value={names}
          placeholder="Javier_PS, JaviPQ88"
          spellCheck={false}
          autoComplete="off"
          aria-describedby="settings-screen-names-hint"
          error={failed('screenNames')}
          onChange={(event) => edit(setNames)(event.target.value)}
        />
      </div>
      <p id="settings-screen-names-hint" className="settings-card__hint">
        {t('settings.screenNames.hint')}
      </p>
      <div className="settings-card__actions">
        <p className="settings-card__status" role="status">
          {saving.state === 'saved' && t('settings.saved')}
        </p>
        <Button
          type="submit"
          variant="primary"
          size="compact"
          disabledReason={
            saving.state === 'saving'
              ? t('settings.saving')
              : !nameChanged && !namesChanged
                ? t('settings.unchanged')
                : undefined
          }
        >
          {t('settings.save')}
        </Button>
      </div>
    </form>
  )
}

/**
 * Applies a preference at once; the server keeps it. A refusal puts it back
 * and says so under the card it came from.
 */
function usePreferenceChange(): [(changes: Partial<Preferences>) => void, string | null] {
  const { t } = useI18n()
  const { changePreferences } = useSession()
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const change = (changes: Partial<Preferences>) => {
    setFailure(null)
    changePreferences(changes).catch((error: unknown) => setFailure(reasonOf(error)))
  }
  return [change, failure && t('settings.preferenceFailed', { reason: t(`reason.${failure}`) })]
}

function Failure({ message }: { message: string | null }) {
  return (
    <p className="settings-card__failure" role="alert">
      {message}
    </p>
  )
}

/** The cards of the four suits the previews are drawn with: A♠ K♥ 7♦ 4♣. */
const PREVIEW_CARDS = ['As', 'Kh', '7d', '4c']

function TableReadingCard() {
  const { t } = useI18n()
  const { identity } = useSession()
  const { deckStyle, fourColour, displayUnit, potPercentage } = identity.preferences
  const [change, failure] = usePreferenceChange()
  const units: DisplayUnit[] = ['big-blinds', 'amount', 'both']
  return (
    <section className="settings-card settings-card--rows" aria-labelledby="settings-table-title">
      <h2 id="settings-table-title" className="settings-card__eyebrow">
        {t('settings.table.title')}
      </h2>
      <SettingRow
        label={t('settings.fourColour.label')}
        hint={deckStyle === 'full-suit' ? t('settings.fourColour.fullSuit') : t('settings.fourColour.hint')}
        preview={
          <span className="settings-row__cards" role="group" aria-label={t('settings.fourColour.preview')}>
            {PREVIEW_CARDS.map((card) => (
              <Card key={card} card={card} size="list" deck={{ style: 'classic', fourColour }} />
            ))}
          </span>
        }
      >
        <Toggle
          label={t('settings.fourColour.label')}
          checked={fourColour}
          onChange={(checked) => change({ fourColour: checked })}
        />
      </SettingRow>
      <hr className="settings-card__rule" />
      <SettingRow label={t('settings.unit.label')} hint={t('settings.unit.hint')}>
        <SegmentedControl
          label={t('settings.unit.label')}
          options={units.map((unit) => ({ value: unit, label: t(`settings.unit.${unit}`) }))}
          value={displayUnit}
          onChange={(unit) => change({ displayUnit: unit })}
        />
      </SettingRow>
      <hr className="settings-card__rule" />
      <SettingRow
        label={t('settings.potPercentage.label')}
        hint={t('settings.potPercentage.hint')}
        preview={<BetPreview unit={displayUnit} potPercentage={potPercentage} />}
      >
        <Toggle
          label={t('settings.potPercentage.label')}
          checked={potPercentage}
          onChange={(checked) => change({ potPercentage: checked })}
        />
      </SettingRow>
      <Failure message={failure} />
    </section>
  )
}

function SettingRow({
  label,
  hint,
  preview,
  children,
}: {
  label: string
  hint: string
  preview?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        <span className="settings-row__hint">{hint}</span>
      </div>
      {preview}
      {children}
    </div>
  )
}

/** A €0.65 bet into €1.95 at €0.05/€0.10, the way this reader's table would draw it. */
function BetPreview({ unit, potPercentage }: { unit: DisplayUnit; potPercentage: boolean }) {
  const i18n = useI18n()
  const bet = quantity(65, { bigBlind: 10, currency: 'EUR' }, unit, i18n)
  return (
    <span className="settings-row__bet ro-mono" role="img" aria-label={i18n.t('settings.potPercentage.preview')}>
      <span className="settings-row__bet-chip" />
      <span>
        {bet.primary}
        <Secondary value={bet.secondary} />
      </span>
      {potPercentage && <span className="settings-row__bet-share">{i18n.t('room.table.potShare', { percent: 33 })}</span>}
    </span>
  )
}

function DeckCard() {
  const { t } = useI18n()
  const { identity } = useSession()
  const { deckStyle, fourColour } = identity.preferences
  const [change, failure] = usePreferenceChange()
  const styles: DeckStyle[] = ['classic', 'full-suit']
  return (
    <section className="settings-card settings-card--side" aria-labelledby="settings-deck-title">
      <h2 id="settings-deck-title" className="settings-card__eyebrow">
        {t('settings.deck.title')}
      </h2>
      {styles.map((style) => {
        const deck: Deck = { style, fourColour: style === 'full-suit' || fourColour }
        return (
          <button
            key={style}
            type="button"
            className="settings-deck"
            aria-label={t(`settings.deck.${style}`)}
            aria-pressed={deckStyle === style}
            onClick={() => change({ deckStyle: style })}
          >
            <span className="settings-deck__felt" aria-hidden="true">
              {PREVIEW_CARDS.map((card) => (
                <Card key={card} card={card} size="hero" deck={deck} />
              ))}
            </span>
            <span className="settings-deck__caption">
              <span className="settings-deck__radio" aria-hidden="true">
                {deckStyle === style && <Icon name="success" size={11} />}
              </span>
              <span className="settings-deck__name">{t(`settings.deck.${style}`)}</span>
              <span className="settings-deck__tag">{t(`settings.deck.${style}.tag`)}</span>
            </span>
          </button>
        )
      })}
      <p className="settings-card__hint settings-card__hint--flat">{t('settings.deck.hint')}</p>
      <Failure message={failure} />
    </section>
  )
}

function ThemeCard() {
  const { t } = useI18n()
  const { identity } = useSession()
  const [change, failure] = usePreferenceChange()
  const themes: Theme[] = ['dark', 'light', 'system']
  return (
    <section className="settings-card settings-card--side" aria-labelledby="settings-theme-title">
      <h2 id="settings-theme-title" className="settings-card__eyebrow">
        {t('settings.theme.title')}
      </h2>
      <div className="settings-themes">
        {themes.map((theme) => (
          <button
            key={theme}
            type="button"
            className="settings-theme"
            aria-pressed={identity.preferences.theme === theme}
            onClick={() => change({ theme })}
          >
            <span className="settings-theme__swatch" data-theme-swatch={theme} aria-hidden="true" />
            {t(`settings.theme.${theme}`)}
          </button>
        ))}
      </div>
      <p className="settings-card__hint settings-card__hint--flat">{t('settings.theme.hint')}</p>
      <Failure message={failure} />
    </section>
  )
}

function LanguageCard() {
  const { t } = useI18n()
  const { identity } = useSession()
  const [change, failure] = usePreferenceChange()
  return (
    <section className="settings-card settings-card--side" aria-labelledby="settings-language-title">
      <h2 id="settings-language-title" className="settings-card__eyebrow">
        {t('settings.language.title')}
      </h2>
      <SegmentedControl
        label={t('settings.language.title')}
        options={locales.map((locale) => ({ value: locale, label: t(`settings.language.${locale}`) }))}
        value={identity.preferences.language}
        onChange={(language) => change({ language })}
      />
      <p className="settings-card__hint settings-card__hint--flat">{t('settings.language.hint')}</p>
      <Failure message={failure} />
    </section>
  )
}

const SHORTCUTS: { keys: string; label: MessageKey }[] = [
  { keys: '← →', label: 'settings.shortcuts.action' },
  { keys: '⇧ ← →', label: 'settings.shortcuts.street' },
  { keys: 'J K', label: 'settings.shortcuts.hand' },
]

function ShortcutsCard() {
  const { t } = useI18n()
  return (
    <section className="settings-card settings-card--side settings-card--shortcuts" aria-labelledby="settings-shortcuts-title">
      <h2 id="settings-shortcuts-title" className="settings-card__eyebrow">
        {t('settings.shortcuts.title')}
      </h2>
      <dl className="settings-shortcuts">
        {SHORTCUTS.map(({ keys, label }) => (
          <div key={keys} className="settings-shortcuts__row">
            <dt>
              <kbd className="settings-shortcuts__keys ro-mono">{keys}</kbd>
            </dt>
            <dd>{t(label)}</dd>
          </div>
        ))}
      </dl>
      <p className="settings-card__hint settings-card__hint--flat">{t('settings.shortcuts.hint')}</p>
    </section>
  )
}
