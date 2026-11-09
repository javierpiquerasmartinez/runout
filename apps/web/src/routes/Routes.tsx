import { adminTabFromPath } from '../admin/admin'
import { AdminPage } from '../admin/AdminPage'
import { isCalendarPath, milestoneIdFromPath, periodFromPath, periodPath, todayOf, todayPeriod } from '../calendar/calendar'
import { CalendarPage } from '../calendar/CalendarPage'
import { MilestonePage } from '../calendar/MilestonePage'
import { goalsPath } from '../goals/goals'
import { GoalsPage } from '../goals/GoalsPage'
import { invitationTokenFromPath, resetPasswordPath, resetTokenFromPath } from '../identity/accessPaths'
import { useSession } from '../identity/context'
import { InvitationPage } from '../identity/InvitationPage'
import { CompleteResetPage, RequestResetPage } from '../identity/ResetPasswordPages'
import { LandingPage } from '../landing/LandingPage'
import { isLabPath, labAnalysisPath, labPath, labRangeIdFromPath, labRangesPath } from '../lab/lab'
import { LabAnalysisPage } from '../lab/LabAnalysisPage'
import { LabRangesPage } from '../lab/LabRangesPage'
import { LoginPage, loginPath } from '../landing/LoginPage'
import { libraryHandIdFromPath, libraryPath, libraryViewFromPath, roomCodeFromLibraryPath } from '../library/library'
import { LibraryHandPage } from '../library/LibraryHandPage'
import { LibraryPage } from '../library/LibraryPage'
import { useHeldRoom } from '../room/heldRoomContext'
import { EnterRoomPage } from '../room/EnterRoomPage'
import { enterRoomPath, formatRoomCode, roomCodeFromPath } from '../room/roomCode'
import { RoomPage } from '../room/RoomPage'
import { roomsPath } from '../rooms/rooms'
import { RoomsPage } from '../rooms/RoomsPage'
import { usePath } from '../routing'
import { Redirect } from './Redirect'
import { SettingsPage, settingsPath } from '../settings/SettingsPage'

/**
 * Which screen this path shows to this browser's identity (none, anonymous,
 * an Account), or where it sends them instead. Every route and redirect is
 * decided here, except the design-system and status pages, which need no
 * identity and are picked out by `App` before the session loads.
 */
export function Routes() {
  const path = usePath()
  const { identity } = useSession()

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
  // An Account has signed in already, and no sign-in returns anywhere but the Library.
  if (path === loginPath) return identity?.account ? <Redirect to={libraryPath} /> : <LoginPage />
  // Only an Account has a Library, a Lab, a Calendar, Goals and creates Rooms (ADR 0005): anyone else is asked to sign in.
  if (!identity?.account) {
    if (path === roomsPath || path === libraryPath || path.startsWith(`${libraryPath}/`) || isLabPath(path) || isCalendarPath(path) || path === goalsPath) {
      return <Redirect to={loginPath} />
    }
    return <LandingPage />
  }
  if (path === roomsPath) return <RoomsPage />
  // The panel exists only for Administrators; anyone else finds a path that leads nowhere.
  const adminTab = identity.administrator ? adminTabFromPath(path) : null
  if (adminTab) return <AdminPage tab={adminTab} />
  // The Lab opens on its study tool.
  if (path === labPath) return <Redirect to={labAnalysisPath} />
  if (path === labAnalysisPath) return <LabAnalysisPage />
  // One screen for the empty matrix and every saved Range, so opening one keeps the list; it reads which from the path.
  if (path === labRangesPath || labRangeIdFromPath(path)) return <LabRangesPage />
  // The Calendar opens on the current month, and so does any period it can't show.
  if (isCalendarPath(path)) {
    const milestoneId = milestoneIdFromPath(path)
    if (milestoneId) return <MilestonePage key={milestoneId} id={milestoneId} />
    const period = periodFromPath(path)
    if (!period) return <Redirect to={periodPath(todayPeriod('month', todayOf()))} />
    // A week written on another day than its Monday is shown at its Monday's address.
    if (path !== periodPath(period)) return <Redirect to={periodPath(period)} />
    return <CalendarPage period={period} />
  }
  if (path === goalsPath) return <GoalsPage />
  // One screen for both views, so switching keeps its state; it reads which from the path.
  if (libraryViewFromPath(path)) return <LibraryPage />
  const pickingFor = roomCodeFromLibraryPath(path)
  if (pickingFor) return <RoomLibrary code={pickingFor} />
  const handId = libraryHandIdFromPath(path)
  if (handId) return <LibraryHandPage key={handId} handId={handId} />
  // For an Account the landing, or a path that leads nowhere, is its Library.
  return <Redirect to={libraryPath} />
}

export { Redirect }

/** The Library, opened from the Room this person is still in, to add Hands to its Queue. */
function RoomLibrary({ code }: { code: string }) {
  const view = useHeldRoom()?.view
  const name = view && 'room' in view ? view.room.name : formatRoomCode(code)
  return <LibraryPage room={{ code, name }} />
}
