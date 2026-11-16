import { Component, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { retryScreens, ScreenNotLoaded } from './lazyPage'
import { shouldReload } from './recovery'
import '../identity/SessionProvider.css'

type Props = {
  children: ReactNode
  /** The path the screens are shown for: at another, a screen that didn't arrive is asked for again. */
  at?: string
  /** Reloads the page; the browser's own, unless said. */
  reload?: () => void
}

type State = { failure: unknown; reloading: boolean }

const nothingFailed: State = { failure: null, reloading: false }

/**
 * Stands round the screens that arrive in chunks of their own (`pages`), for
 * the one that doesn't arrive. Without it React takes the whole app off the
 * page, for good. The page is reloaded once, which picks up the build
 * deployed since this one was opened; if the screen still doesn't arrive, it
 * says so and offers to try again (`recovery`). Any other failure is not
 * this boundary's, and goes on up.
 */
export class ScreenBoundary extends Component<Props, State> {
  state = nothingFailed

  static getDerivedStateFromError(failure: unknown): Partial<State> {
    return { failure }
  }

  componentDidCatch(failure: unknown) {
    if (!(failure instanceof ScreenNotLoaded) || !shouldReload()) return
    // Before anything is painted: nothing shows for the moment the reload takes.
    this.setState({ reloading: true })
    ;(this.props.reload ?? (() => window.location.reload()))()
  }

  componentDidUpdate(before: Props) {
    if (before.at !== this.props.at && this.state.failure !== null) this.retry()
  }

  retry = () => {
    retryScreens()
    this.setState(nothingFailed)
  }

  render() {
    const { failure, reloading } = this.state
    if (failure === null) return this.props.children
    if (!(failure instanceof ScreenNotLoaded)) throw failure
    if (reloading) return null
    return <NotLoaded onRetry={this.retry} />
  }
}

function NotLoaded({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <main className="session-gate">
      <p role="alert">{t('screen.notLoaded')}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t('screen.retry')}
      </Button>
    </main>
  )
}
