import { useEffect } from 'react'
import { useSession } from '../identity/context'
import { LandingPage } from '../landing/LandingPage'
import { isLabPath, labPath, labRangeIdFromPath, labRangesPath } from '../lab/lab'
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
import { redirect, usePath } from '../routing'
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
  // An Account's Rooms screen already has a field for the code.
  if (path === enterRoomPath) return identity?.account ? <Redirect to={roomsPath} /> : <EnterRoomPage />
  // Settings are an identity's: without one there is nothing to set yet.
  if (path === settingsPath) return identity ? <SettingsPage /> : <Redirect to={loginPath} />
  // An Account has signed in already, and no sign-in returns anywhere but the Library.
  if (path === loginPath) return identity?.account ? <Redirect to={libraryPath} /> : <LoginPage />
  // Only an Account has a Library, a Lab and creates Rooms (ADR 0005): anyone else is asked to sign in.
  if (!identity?.account) {
    if (path === roomsPath || path === libraryPath || path.startsWith(`${libraryPath}/`) || isLabPath(path)) {
      return <Redirect to={loginPath} />
    }
    return <LandingPage />
  }
  if (path === roomsPath) return <RoomsPage />
  // The Lab has only one tool so far, so it opens straight onto it.
  if (path === labPath) return <Redirect to={labRangesPath} />
  // One screen for the empty matrix and every saved Range, so opening one keeps the list; it reads which from the path.
  if (path === labRangesPath || labRangeIdFromPath(path)) return <LabRangesPage />
  // One screen for both views, so switching keeps its state; it reads which from the path.
  if (libraryViewFromPath(path)) return <LibraryPage />
  const pickingFor = roomCodeFromLibraryPath(path)
  if (pickingFor) return <RoomLibrary code={pickingFor} />
  const handId = libraryHandIdFromPath(path)
  if (handId) return <LibraryHandPage key={handId} handId={handId} />
  // For an Account the landing, or a path that leads nowhere, is its Library.
  return <Redirect to={libraryPath} />
}

/** Sends this person to `to` in place of the path they opened, so going back skips it. */
export function Redirect({ to }: { to: string }) {
  useEffect(() => redirect(to), [to])
  return null
}

/** The Library, opened from the Room this person is still in, to add Hands to its Queue. */
function RoomLibrary({ code }: { code: string }) {
  const view = useHeldRoom()?.view
  const name = view && 'room' in view ? view.room.name : formatRoomCode(code)
  return <LibraryPage room={{ code, name }} />
}
