import { useEffect } from 'react'
import { useSession } from '../identity/context'
import { libraryHandIdFromPath, libraryPath, roomCodeFromLibraryPath } from '../library/library'
import { LibraryHandPage } from '../library/LibraryHandPage'
import { LibraryPage } from '../library/LibraryPage'
import { useHeldRoom } from '../room/heldRoomContext'
import { formatRoomCode, roomCodeFromPath } from '../room/roomCode'
import { RoomPage } from '../room/RoomPage'
import { roomsPath } from '../rooms/rooms'
import { RoomsPage } from '../rooms/RoomsPage'
import { redirect, usePath } from '../routing'
import { SettingsPage, settingsPath } from '../settings/SettingsPage'
import { WelcomePage } from '../welcome/WelcomePage'

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
  // Settings are an identity's: without one there is nothing to set yet.
  if (path === settingsPath && identity) return <SettingsPage />
  // Creating a Room needs an Account (ADR 0005): anyone else is asked to sign in.
  if (path === roomsPath) return identity?.account ? <RoomsPage /> : <Redirect to={loginPath} />
  // Only an Account has a Library (ADR 0005); anyone else is sent to the start.
  if (identity?.account) {
    if (path === libraryPath) return <LibraryPage />
    const pickingFor = roomCodeFromLibraryPath(path)
    if (pickingFor) return <RoomLibrary code={pickingFor} />
    const handId = libraryHandIdFromPath(path)
    if (handId) return <LibraryHandPage key={handId} handId={handId} />
  }
  return <WelcomePage />
}

/** Signing in. Until it has a screen of its own, the welcome screen offers it. */
const loginPath = '/login'

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
