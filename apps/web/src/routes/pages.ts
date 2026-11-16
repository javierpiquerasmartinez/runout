import type { ComponentType } from 'react'
import { wholeCatalogue } from '../i18n'
import type { RoomSummary } from '../room/roomClient'
import { lazyPage as chunk } from './lazyPage'

/*
 * Every screen but the Landing, each in a chunk of its own that its route
 * asks for. The Landing is what a Visitor came for and arrives with the app.
 */

/**
 * A screen in its own chunk, which arrives with the whole message catalogue:
 * the first load carries the Landing's messages alone, and every other
 * screen reads from the rest.
 */
function lazyPage<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  return chunk<Props>(() => Promise.all([load(), wholeCatalogue()]).then(([page]) => page))
}

export const DesignSystemPage = lazyPage(() => import('../design-system/DesignSystemPage').then((module) => module.DesignSystemPage))

// Getting in, for whoever opens them.
export const LoginPage = lazyPage(() => import('../landing/LoginPage').then((module) => module.LoginPage))
export const InvitationPage = lazyPage(() => import('../identity/InvitationPage').then((module) => module.InvitationPage))
export const RequestResetPage = lazyPage(() => import('../identity/ResetPasswordPages').then((module) => module.RequestResetPage))
export const CompleteResetPage = lazyPage(() => import('../identity/ResetPasswordPages').then((module) => module.CompleteResetPage))
export const EnterRoomPage = lazyPage(() => import('../room/EnterRoomPage').then((module) => module.EnterRoomPage))

// A Room and Settings, for any identity.
export const RoomPage = lazyPage(() => import('../room/RoomPage').then((module) => module.RoomPage))
export const SettingsPage = lazyPage(() => import('../settings/SettingsPage').then((module) => module.SettingsPage))
/** What holds a Room while its screen shows. It wraps that screen, so the two are asked for together rather than one after the other. */
export const RoomHolder = lazyPage(() => {
  RoomPage.preload().catch(() => {})
  return import('../room/RoomHolder').then((module) => module.RoomHolder)
})

// An Account's.
export const AccountRoutes = lazyPage(() => import('./AccountRoutes').then((module) => module.AccountRoutes))
export const HomePage = lazyPage(() => import('../home/HomePage').then((module) => module.HomePage))
export const LibraryPage = lazyPage<{ room?: RoomSummary }>(() => import('../library/LibraryPage').then((module) => module.LibraryPage))
export const LibraryHandPage = lazyPage(() => import('../library/LibraryHandPage').then((module) => module.LibraryHandPage))
export const RoomsPage = lazyPage(() => import('../rooms/RoomsPage').then((module) => module.RoomsPage))
export const LabAnalysisPage = lazyPage(() => import('../lab/LabAnalysisPage').then((module) => module.LabAnalysisPage))
export const LabRangesPage = lazyPage(() => import('../lab/LabRangesPage').then((module) => module.LabRangesPage))
export const CalendarPage = lazyPage(() => import('../calendar/CalendarPage').then((module) => module.CalendarPage))
export const MilestonePage = lazyPage(() => import('../calendar/MilestonePage').then((module) => module.MilestonePage))
export const GoalsPage = lazyPage(() => import('../goals/GoalsPage').then((module) => module.GoalsPage))
export const AdminPage = lazyPage(() => import('../admin/AdminPage').then((module) => module.AdminPage))

/** Where the Landing's two ways on lead, asked for while a Visitor reads it. */
export function preloadWaysOn() {
  for (const page of [LoginPage, EnterRoomPage]) page.preload().catch(() => {})
}

/**
 * The screens an Account moves between from its header. Asked for together
 * once it is in, so that by the time it opens one the screen is already
 * here and nothing blank shows in between. The panel is left to the few
 * Administrators who open it.
 */
export function preloadAccountPages() {
  for (const page of [HomePage, LibraryPage, LibraryHandPage, RoomsPage, RoomPage, LabAnalysisPage, LabRangesPage, CalendarPage, MilestonePage, GoalsPage, SettingsPage]) {
    // One that doesn't arrive now is asked for again by the route that shows it.
    page.preload().catch(() => {})
  }
}
