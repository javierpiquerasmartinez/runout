import { useState, type ReactNode } from 'react'
import { useI18n, type Locale, type MessageKey } from '../i18n'
import { Button, type ButtonVariant } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { iconGroups } from '../ui/iconDrawings'
import { SegmentedControl } from '../ui/SegmentedControl'
import { TextField } from '../ui/TextField'
import { Toggle } from '../ui/Toggle'
import './DesignSystemPage.css'

type Theme = 'dark' | 'light'

/**
 * The three design-system boards of Design.html rebuilt from the real tokens,
 * components, icon sprite and message catalogue. Laid out for 1440×900.
 */
export function DesignSystemPage() {
  const { t, locale, setLocale } = useI18n()
  const [theme, setTheme] = useState<Theme>('dark')
  const changeTheme = (next: Theme) => {
    // Set before re-rendering so swatches read the new theme's tokens.
    document.documentElement.dataset.theme = next
    setTheme(next)
  }

  return (
    <main className="ds">
      <header className="ds-top">
        <div className="ds-heading">
          <span className="ds-eyebrow">{t('design.eyebrow')}</span>
          <h1 className="ds-title">
            {t('app.name')} · {t('design.title')}
          </h1>
        </div>
        <div className="ds-top__controls">
          <SegmentedControl<Locale>
            label={t('language.label')}
            options={[
              { value: 'es', label: t('language.es') },
              { value: 'en', label: t('language.en') },
            ]}
            value={locale}
            onChange={setLocale}
          />
          <SegmentedControl<Theme>
            label={t('theme.label')}
            options={[
              { value: 'dark', label: t('theme.dark') },
              { value: 'light', label: t('theme.light') },
            ]}
            value={theme}
            onChange={changeTheme}
          />
        </div>
      </header>

      <ColorBoard />
      <IconBoard />
      <ControlsBoard />
    </main>
  )
}

function Board({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="ds-board" aria-labelledby={`board-${id}`}>
      <header className="ds-board__header">
        <div className="ds-heading">
          <span className="ds-eyebrow">{eyebrow}</span>
          <h2 id={`board-${id}`} className="ds-title">
            {title}
          </h2>
        </div>
        {intro && <p className="ds-board__intro">{intro}</p>}
      </header>
      {children}
    </section>
  )
}

function Panel({ title, className, children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={['ds-panel', className].filter(Boolean).join(' ')}>
      {title && <h3 className="ds-panel__title">{title}</h3>}
      {children}
    </div>
  )
}

/* ---------------- Colour, type and rhythm ---------------- */

const surfaces: { key: MessageKey; token: string; outlined?: boolean }[] = [
  { key: 'design.color.canvas', token: '--color-canvas', outlined: true },
  { key: 'design.color.panel', token: '--color-panel', outlined: true },
  { key: 'design.color.control', token: '--color-control', outlined: true },
  { key: 'design.color.selected', token: '--color-selected' },
  { key: 'design.color.border', token: '--color-border' },
  { key: 'design.color.felt', token: '--color-felt', outlined: true },
]

const accents: { key: MessageKey; token: string }[] = [
  { key: 'design.color.textPrimary', token: '--text-primary' },
  { key: 'design.color.textSecondary', token: '--text-secondary' },
  { key: 'design.color.textMuted', token: '--text-muted' },
  { key: 'design.color.brass', token: '--brass' },
  { key: 'design.color.sync', token: '--sync' },
  { key: 'design.color.alert', token: '--alert' },
]

/** Shows the token's value in the active theme; the page re-renders when the theme changes. */
function Swatch({ label, token, outlined }: { label: string; token: string; outlined?: boolean }) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(token).trim().toUpperCase()
  return (
    <div className="ds-swatch">
      <span className="ds-swatch__chip" data-outlined={outlined ? '' : undefined} style={{ background: `var(${token})` }} />
      <span className="ds-swatch__name">{label}</span>
      <span className="ds-swatch__hex ro-mono">{hex}</span>
    </div>
  )
}

function ColorBoard() {
  const { t, formatNumber, formatCurrency } = useI18n()
  const spacing = [4, 8, 12, 16, 20, 24, 32, 48]
  const radii = [4, 8, 12]
  const rules: { dot: string; title: MessageKey; body: MessageKey }[] = [
    { dot: 'var(--brass)', title: 'design.rules.brass', body: 'design.rules.brassBody' },
    { dot: 'var(--sync)', title: 'design.rules.sync', body: 'design.rules.syncBody' },
    { dot: 'var(--text-secondary)', title: 'design.rules.mono', body: 'design.rules.monoBody' },
    { dot: 'var(--text-muted)', title: 'design.rules.felt', body: 'design.rules.feltBody' },
    { dot: 'var(--alert)', title: 'design.rules.red', body: 'design.rules.redBody' },
  ]

  return (
    <Board id="color" eyebrow={t('design.eyebrow')} title={t('design.color.title')} intro={t('design.intro')}>
      <div className="ds-columns">
        <div className="ds-stack">
          <Panel title={t('design.color.surfaces')}>
            <div className="ds-swatches">
              {surfaces.map((s) => (
                <Swatch key={s.token} label={t(s.key)} token={s.token} outlined={s.outlined} />
              ))}
            </div>
          </Panel>

          <Panel title={t('design.color.textAndAccents')}>
            <div className="ds-swatches">
              {accents.map((s) => (
                <Swatch key={s.token} label={t(s.key)} token={s.token} />
              ))}
            </div>
            <dl className="ds-contrast">
              <div>
                <dt>{t('design.color.brassOnPanel')}</dt>
                <dd style={{ color: 'var(--brass-ink)' }}>{t('design.color.brassOnPanelNote')}</dd>
              </div>
              <div>
                <dt>{t('design.color.mutedOnPanel')}</dt>
                <dd style={{ color: 'var(--text-muted)' }}>{t('design.color.mutedOnPanelNote')}</dd>
              </div>
              <div>
                <dt>{t('design.color.textOnBrass')}</dt>
                <dd>{t('design.color.textOnBrassNote')}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title={t('design.color.rhythm')} className="ds-grow">
            <div className="ds-rhythm">
              {spacing.map((size, i) => (
                <div key={size} className="ds-rhythm__item">
                  <span className="ds-rhythm__bar" data-tier={i < 4 ? 1 : i < 6 ? 2 : 3} style={{ width: size }} />
                  <span className="ds-caption ro-mono">{formatNumber(size)}</span>
                </div>
              ))}
              <span className="ds-rule" />
              {radii.map((radius) => (
                <div key={radius} className="ds-rhythm__item">
                  <span className="ds-rhythm__radius" style={{ borderRadius: radius }} />
                  <span className="ds-caption ro-mono">r{formatNumber(radius)}</span>
                </div>
              ))}
              <div className="ds-rhythm__item">
                <span className="ds-rhythm__radius" style={{ borderRadius: 'var(--radius-pill)' }} />
                <span className="ds-caption ro-mono">{t('design.color.pill')}</span>
              </div>
            </div>
            <div className="ds-elevations">
              <span className="ds-elevation" data-level="flat">{t('design.color.flat')}</span>
              <span className="ds-elevation" data-level="raised">{t('design.color.raised')}</span>
              <span className="ds-elevation" data-level="modal">{t('design.color.modal')}</span>
            </div>
          </Panel>
        </div>

        <div className="ds-stack">
          <Panel title={t('design.type.title')}>
            <div className="ds-family">
              <div className="ds-family__label">
                <span className="ds-overline" style={{ color: 'var(--brass-ink)' }}>Instrument Serif</span>
                <span className="ds-caption">{t('design.type.serifUse')}</span>
              </div>
              <span className="ro-serif" style={{ fontSize: 42, lineHeight: 1.05 }}>{t('design.type.serifSample')}</span>
              <span className="ds-caption ro-mono">{t('design.type.serifScale')}</span>
            </div>
            <hr className="ds-divider" />
            <div className="ds-family">
              <div className="ds-family__label">
                <span className="ds-overline" style={{ color: 'var(--sync-ink)' }}>Instrument Sans</span>
                <span className="ds-caption">{t('design.type.sansUse')}</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 600 }}>{t('design.type.sansSample')}</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('design.type.sansBody')}</span>
              <span className="ds-caption ro-mono">{t('design.type.sansScale')}</span>
            </div>
            <hr className="ds-divider" />
            <div className="ds-family">
              <div className="ds-family__label">
                <span className="ds-overline" style={{ color: 'var(--text-secondary)' }}>IBM Plex Mono</span>
                <span className="ds-caption">{t('design.type.monoUse')}</span>
              </div>
              <div className="ds-mono-samples">
                <span className="ro-mono" style={{ fontSize: 30, fontWeight: 600, color: 'var(--brass-ink)' }}>
                  {t('design.format.bigBlinds', { value: formatNumber(148) })}
                </span>
                <span className="ro-mono" style={{ fontSize: 18, fontWeight: 500, letterSpacing: '0.18em' }}>RNT-4K9P</span>
                <span className="ro-mono ds-overline" style={{ fontSize: 11, fontWeight: 600 }}>{t('design.controls.chip.showdown')}</span>
              </div>
              <span className="ds-caption ro-mono">{t('design.type.monoNote')}</span>
            </div>
          </Panel>

          <Panel title={t('design.format.title')}>
            <dl className="ds-figures">
              <div>
                <dt>{t('design.format.number')}</dt>
                <dd className="ro-mono">{formatNumber(12345.5)}</dd>
              </div>
              <div>
                <dt>{t('design.format.amountUsd')}</dt>
                <dd className="ro-mono">{formatCurrency(1234.5, 'USD')}</dd>
              </div>
              <div>
                <dt>{t('design.format.amountEur')}</dt>
                <dd className="ro-mono">{formatCurrency(0.25, 'EUR')}</dd>
              </div>
              <div>
                <dt>{t('design.format.percent')}</dt>
                <dd className="ro-mono">{formatNumber(0.66, { style: 'percent' })}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title={t('design.rules.title')} className="ds-grow">
            <ul className="ds-rules">
              {rules.map((rule) => (
                <li key={rule.title}>
                  <span className="ds-dot" style={{ background: rule.dot }} />
                  <span>
                    <strong>{t(rule.title)}</strong> {t(rule.body)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Board>
  )
}

/* ---------------- Iconography ---------------- */

const groupColors: Record<keyof typeof iconGroups, string> = {
  navigation: 'var(--text-muted)',
  player: 'var(--brass-ink)',
  room: 'var(--sync-ink)',
  hands: 'var(--text-muted)',
  system: 'var(--text-muted)',
}

/** Icons the board draws in an accent rather than the resting grey. */
const iconTones: Partial<Record<string, string>> = {
  play: 'var(--brass-ink)',
  pause: 'var(--brass-ink)',
  master: 'var(--brass-ink)',
  live: 'var(--sync-ink)',
  success: 'var(--sync-ink)',
  warning: 'var(--brass-ink)',
  error: 'var(--alert-ink)',
}

function IconGroup({ group }: { group: keyof typeof iconGroups }) {
  const { t } = useI18n()
  return (
    <Panel className="ds-icon-group">
      <h3 className="ds-overline" style={{ color: groupColors[group] }}>
        {t(`design.icons.group.${group}`)}
      </h3>
      <ul className="ds-icons">
        {iconGroups[group].map((name) => (
          <li key={name} className="ds-icon-tile">
            <span className="ds-icon-tile__frame" style={{ color: iconTones[name] ?? 'var(--text-secondary)' }}>
              <Icon name={name} />
            </span>
            <span className="ds-caption">{t(`icon.${name}`)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function IconBoard() {
  const { t, formatNumber } = useI18n()
  return (
    <Board id="icons" eyebrow="Sprites 02" title={t('design.icons.title')}>
      <div className="ds-specs">
        {(['design.icons.viewBox', 'design.icons.stroke', 'design.icons.roundCaps', 'design.icons.grid'] as const).map((key) => (
          <span key={key} className="ds-spec ro-mono">{t(key)}</span>
        ))}
      </div>
      <IconGroup group="navigation" />
      <IconGroup group="player" />
      <IconGroup group="room" />
      <IconGroup group="hands" />
      <div className="ds-columns ds-columns--icons">
        <IconGroup group="system" />
        <Panel className="ds-icon-group">
          <h3 className="ds-overline">{t('design.icons.usage')}</h3>
          <div className="ds-scaling">
            <span className="ds-scaling__sizes">
              {[16, 20, 24, 32].map((size) => (
                <span key={size} className="ds-scaling__size">
                  <Icon name="search" size={size} />
                  <span className="ds-caption ro-mono">{formatNumber(size)}</span>
                </span>
              ))}
            </span>
            <span className="ds-caption">{t('design.icons.scaling')}</span>
          </div>
          <p className="ds-note">{t('design.icons.sprite')}</p>
        </Panel>
      </div>
    </Board>
  )
}

/* ---------------- Buttons, fields and controls ---------------- */

const variants: { variant: ButtonVariant; label: MessageKey; sample: MessageKey }[] = [
  { variant: 'primary', label: 'design.controls.variant.primary', sample: 'design.buttons.createRoom' },
  { variant: 'secondary', label: 'design.controls.variant.secondary', sample: 'design.buttons.import' },
  { variant: 'ghost', label: 'design.controls.variant.ghost', sample: 'design.buttons.cancel' },
  { variant: 'sync', label: 'design.controls.variant.sync', sample: 'design.buttons.join' },
  { variant: 'destructive', label: 'design.controls.variant.destructive', sample: 'design.buttons.delete' },
]

const states = ['normal', 'hover', 'pressed', 'focus', 'disabled'] as const

function ControlsBoard() {
  const { t, formatNumber } = useI18n()
  const [hideNames, setHideNames] = useState(true)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [unit, setUnit] = useState<'bb' | 'amount' | 'both'>('bb')
  const [stakeFilter, setStakeFilter] = useState(true)
  const lockedReason = t('design.controls.lockedReason')
  const unitOptions = [
    { value: 'bb', label: t('design.controls.unit.bb') },
    { value: 'amount', label: t('design.controls.unit.amount') },
    { value: 'both', label: t('design.controls.unit.both') },
  ] as const
  const systemRules: { label: MessageKey; value: string }[] = [
    { label: 'design.controls.rule.heights', value: [32, 40, 44, 48].map((n) => formatNumber(n)).join(' · ') },
    { label: 'design.controls.rule.radii', value: [4, 7, 8, 10, 12, 999].map((n) => formatNumber(n)).join(' · ') },
    { label: 'design.controls.rule.focus', value: t('design.controls.rule.focusValue') },
    { label: 'design.controls.rule.disabled', value: t('design.controls.rule.disabledValue') },
    { label: 'design.controls.rule.transition', value: `${formatNumber(120)} ms ease-out` },
  ]

  return (
    <Board id="controls" eyebrow="Sprites 03" title={t('design.controls.title')} intro={t('design.controls.intro')}>
      <div className="ds-columns">
        <div className="ds-stack">
          <Panel title={t('design.controls.hierarchy')}>
            <div className="ds-matrix" role="table">
              <div role="row" className="ds-matrix__row">
                <span role="columnheader" />
                {states.map((state) => (
                  <span key={state} role="columnheader" className="ds-overline ds-matrix__state">
                    {t(`design.controls.state.${state}`)}
                  </span>
                ))}
              </div>
              {variants.map(({ variant, label, sample }) => (
                <div key={variant} role="row" className="ds-matrix__row">
                  <span role="rowheader" className="ds-matrix__variant">{t(label)}</span>
                  {states.map((state) => (
                    <span key={state} role="cell">
                      <Button
                        variant={variant}
                        className="ds-matrix__button"
                        data-state={state === 'normal' || state === 'disabled' ? undefined : state}
                        disabledReason={state === 'disabled' ? lockedReason : undefined}
                        tabIndex={state === 'normal' || state === 'disabled' ? undefined : -1}
                      >
                        {t(sample)}
                      </Button>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={t('design.controls.sizes')} className="ds-grow">
            <div className="ds-sizes">
              <div className="ds-sizes__group">
                <div className="ds-sizes__item">
                  <Button size="compact">{t('design.controls.size.compact')}</Button>
                  <span className="ds-caption ro-mono">32 · r7</span>
                </div>
                <div className="ds-sizes__item">
                  <Button>{t('design.controls.size.standard')}</Button>
                  <span className="ds-caption ro-mono">40 · r8</span>
                </div>
                <div className="ds-sizes__item">
                  <Button variant="primary" size="prominent">{t('design.controls.size.prominent')}</Button>
                  <span className="ds-caption ro-mono">48 · r9</span>
                </div>
              </div>
              <span className="ds-rule ds-rule--tall" />
              <div className="ds-sizes__group">
                <div className="ds-sizes__item">
                  <IconButton icon="copy" size="compact" label={t('design.buttons.copyLink')} />
                  <span className="ds-caption ro-mono">34</span>
                </div>
                <div className="ds-sizes__item">
                  <IconButton icon="filter" label={t('design.buttons.filter')} />
                  <span className="ds-caption ro-mono">44</span>
                </div>
                <div className="ds-sizes__item">
                  <IconButton icon="play" size="prominent" label={t('design.buttons.play')} />
                  <span className="ds-caption ro-mono">56</span>
                </div>
                <div className="ds-sizes__item">
                  <IconButton icon="next" label={t('design.buttons.nextAction')} disabledReason={lockedReason} />
                  <span className="ds-caption ro-mono">44</span>
                </div>
              </div>
            </div>
            <p className="ds-note">{t('design.controls.sizesNote')}</p>
          </Panel>
        </div>

        <div className="ds-stack">
          <Panel title={t('design.controls.fields')}>
            <div className="ds-fields">
              <TextField label={t('design.controls.field.rest')} placeholder={t('design.controls.field.placeholder')} />
              <TextField
                label={t('design.controls.field.focus')}
                defaultValue={t('design.controls.field.sampleName')}
                data-state="focus"
              />
              <TextField
                label={t('design.controls.field.error')}
                defaultValue="RNT-0000"
                mono
                error={t('design.controls.field.errorMessage')}
              />
              <TextField
                label={t('design.controls.field.disabled')}
                defaultValue={t('design.controls.field.lockedValue')}
                disabledReason={lockedReason}
              />
            </div>
          </Panel>

          <Panel title={t('design.controls.chipsTogglesSegmented')}>
            <div className="ds-chips">
              <Chip>{t('design.controls.chip.author')}</Chip>
              {stakeFilter && (
                <Chip
                  variant="active"
                  onRemove={() => setStakeFilter(false)}
                  removeLabel={t('design.controls.chip.removeFilter', { filter: t('design.controls.chip.stake') })}
                >
                  {t('design.controls.chip.stake')}
                </Chip>
              )}
              <Chip variant="showdown">{t('design.controls.chip.showdown')}</Chip>
              <Chip variant="street">{t('design.controls.chip.turn')}</Chip>
              <Chip variant="tag">{t('design.controls.chip.tag')}</Chip>
            </div>
            <hr className="ds-divider" />
            <div className="ds-toggles">
              <Toggle label={t('design.controls.toggle.on')} checked={hideNames} onChange={setHideNames} showLabel />
              <Toggle label={t('design.controls.toggle.off')} checked={autoAdvance} onChange={setAutoAdvance} showLabel />
              <Toggle
                label={t('design.controls.toggle.locked')}
                checked={false}
                onChange={() => {}}
                disabledReason={lockedReason}
                showLabel
              />
            </div>
            <div className="ds-segmented-row">
              <SegmentedControl label={t('design.controls.unit.label')} options={unitOptions} value={unit} onChange={setUnit} />
              <span className="ds-caption">{t('design.controls.segmentedNote')}</span>
            </div>
          </Panel>

          <Panel title={t('design.controls.systemRules')} className="ds-grow">
            <dl className="ds-system-rules">
              {systemRules.map((rule) => (
                <div key={rule.label}>
                  <dt>{t(rule.label)}</dt>
                  <dd className="ro-mono">{rule.value}</dd>
                </div>
              ))}
            </dl>
            <p className="ds-note">{t('design.controls.rulesNote')}</p>
          </Panel>
        </div>
      </div>
    </Board>
  )
}
