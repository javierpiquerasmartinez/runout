import { Suspense, useEffect } from 'react'
import { isCalendarPath } from '../calendar/paths'
import { goalsPath } from '../goals/paths'
import { homePath } from '../home/home'
import { useI18n } from '../i18n'
import { whenIdle } from '../idle'
import { invitationTokenFromPath, loginPath, resetPasswordPath, resetTokenFromPath } from '../identity/accessPaths'
import { useSession } from '../identity/context'
import { isLabPath } from '../lab/paths'
import { landingLocaleAt, landingPaths } from '../landing/address'
import { Landing } from '../landing/Landing'
import { libraryPath } from '../library/paths'
import { enterRoomPath, roomCodeFromPath } from '../room/roomCode'
import { roomsPath } from '../rooms/paths'
import { usePath } from '../routing'
import { settingsPath } from '../settings/paths'
import {
  AccountRoutes,
  CompleteResetPage,
  EnterRoomPage,
  InvitationPage,
  LoginPage,
  preloadWaysOn,
  RequestResetPage,
  RoomPage,
  SettingsPage,
} from './pages'
import { Redirect } from './Redirect'
import { ScreenBoundary } from './ScreenBoundary'

/**
 * Which screen this path shows to this browser's identity (none, anonymous,
 * an Account), or where it sends them instead. Every route and redirect is
 * decided here and, for an Account's own screens, in `AccountRoutes`; the
 * design-system and status pages need no identity and are picked out by
 * `App` before the session loads.
 *
 * Every screen but the Landing arrives in its own chunk (`pages`). While one
 * is on its way nothing is shown in its place: it is a moment, and an
 * Account's screens are asked for ahead of its opening them. One that
 * doesn't arrive is `ScreenBoundary`'s to recover from.
 */
export function Routes() {
  return (
    <ScreenBoundary at={usePath()}>
      <Suspense fallback={null}>
        <Route />
      </Suspense>
    </ScreenBoundary>
  )
}

function Route() {
  const path = usePath()
  const { identity } = useSession()
  const { locale } = useI18n()

  const code = roomCodeFromPath(path)
  if (code) return <RoomPage code={code} />
  // Getting in: an Invitation's link, and choosing a new password, for whoever opens them.
  const invitation = invitationTokenFromPath(path)
  if (invitation) return <InvitationPage key={invitation} token={invitation} />
  if (path === resetPasswordPath) return <RequestResetPage />
  const reset = resetTokenFromPath(path)
  if (reset) return <CompleteResetPage token={reset} />
  // An Account's Rooms screen already has a field for the code.
  if (path === enterRoomPath) return identity?.account ? <Redirect to={roomsPath} /> : <EnterRoomPage />
  // Settings are an identity's: without one there is nothing to set yet.
  if (path === settingsPath) return identity ? <SettingsPage /> : <Redirect to={loginPath} />
  // An Account has signed in already, and no sign-in returns anywhere but Home.
  if (path === loginPath) return identity?.account ? <Redirect to={homePath} /> : <LoginPage />
  if (identity?.account) return <AccountRoutes />
  // Only an Account has a Library, a Lab, a Calendar, Goals and creates Rooms (ADR 0005): anyone else is asked to sign in.
  if (path === roomsPath || path === libraryPath || path.startsWith(`${libraryPath}/`) || isLabPath(path) || isCalendarPath(path) || path === goalsPath) {
    return <Redirect to={loginPath} />
  }
  // The Landing's language is its address's: whoever reads in another is taken to the Landing in theirs.
  if (landingLocaleAt(path) !== locale && Object.values(landingPaths).includes(path)) return <Redirect to={landingPaths[locale]} />
  return <VisitorLanding />
}

/** The Landing, with the screens its two ways on lead to asked for once the browser is idle, so that taking one shows it at once. */
function VisitorLanding() {
  useEffect(() => {
    const left = new AbortController()
    void whenIdle(left.signal).then(preloadWaysOn)
    return () => left.abort()
  }, [])
  return <Landing />
}

export { Redirect }
