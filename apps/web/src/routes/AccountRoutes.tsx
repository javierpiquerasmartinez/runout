import { useEffect } from 'react'
import { adminTabFromPath } from '../admin/admin'
import { isCalendarPath, milestoneIdFromPath, periodFromPath, periodPath, todayOf, todayPeriod } from '../calendar/calendar'
import { goalsPath } from '../goals/goals'
import { homePath } from '../home/home'
import { whenIdle } from '../idle'
import { useSession } from '../identity/context'
import { labAnalysisPath, labPath, labRangeIdFromPath, labRangesPath } from '../lab/lab'
import { libraryHandIdFromPath, libraryViewFromPath, roomCodeFromLibraryPath } from '../library/library'
import { useHeldRoom } from '../room/heldRoomContext'
import { formatRoomCode } from '../room/roomCode'
import { roomsPath } from '../rooms/rooms'
import { usePath } from '../routing'
import {
  AdminPage,
  CalendarPage,
  GoalsPage,
  HomePage,
  LabAnalysisPage,
  LabRangesPage,
  LibraryHandPage,
  LibraryPage,
  MilestonePage,
  preloadAccountPages,
  RoomsPage,
} from './pages'
import { Redirect } from './Redirect'

/**
 * What a path shows to an Account, once `Routes` has dealt with the paths
 * anyone can open. It arrives when someone has signed in, so a Visitor never
 * downloads how an Account's addresses are read.
 */
export function AccountRoutes() {
  const path = usePath()
  const { identity } = useSession()

  useEffect(() => {
    const left = new AbortController()
    void whenIdle(left.signal).then(preloadAccountPages)
    return () => left.abort()
  }, [])

  if (path === roomsPath) return <RoomsPage />
  // The panel exists only for Administrators; anyone else finds a path that leads nowhere.
  const adminTab = identity?.administrator ? adminTabFromPath(path) : null
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
  if (path === homePath) return <HomePage />
  // For an Account a path that leads nowhere is its Home.
  return <Redirect to={homePath} />
}

/** The Library, opened from the Room this person is still in, to add Hands to its Queue. */
function RoomLibrary({ code }: { code: string }) {
  const view = useHeldRoom()?.view
  const name = view && 'room' in view ? view.room.name : formatRoomCode(code)
  return <LibraryPage room={{ code, name }} />
}
