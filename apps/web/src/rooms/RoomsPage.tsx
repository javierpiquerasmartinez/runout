import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { RecentRooms, RoomForms } from './RoomForms'
import { useNewRoomRequest } from './rooms'
import './RoomsPage.css'

/**
 * The Rooms screen ("Salas"): where an Account creates a Room, joins one by its code or goes back
 * to one of its open Rooms. Only an Account reaches it, so it can always create.
 */
export function RoomsPage() {
  const { t } = useI18n()
  const { token } = useSession()
  const newRoom = useNewRoomRequest()
  return (
    <div className="rooms-page">
      <AppHeader current="rooms" />
      <main className="rooms-page__main">
        <div className="rooms-page__intro">
          <h1 className="rooms-page__title ro-serif">{t('rooms.title')}</h1>
          <p className="rooms-page__lead">{t('rooms.lead')}</p>
        </div>
        <RoomForms focusCreate={newRoom} />
        {token && <RecentRooms token={token} />}
      </main>
    </div>
  )
}
