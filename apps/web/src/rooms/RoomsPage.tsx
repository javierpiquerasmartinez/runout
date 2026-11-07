import { useEffect, useState } from 'react'
import { api } from '../backend/api'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { CreateRoomCard, RoomForms } from './RoomForms'
import { RoomsList, type OpenRoom } from './RoomsList'
import { useNewRoomRequest } from './rooms'
import './RoomsPage.css'

/**
 * The Rooms screen ("Salas"). With open Rooms, their list leads, with ways to
 * create one and join one by code above it; with none, the create and join
 * panels fill the screen. Only an Account reaches it, so it can always create.
 */
export function RoomsPage() {
  const { t } = useI18n()
  const { token } = useSession()
  const newRoom = useNewRoomRequest()
  const rooms = useOpenRooms(token)
  // Once "Nueva sala" was asked for on the list, its form stays until the page goes.
  const [creating, setCreating] = useState(false)
  if (newRoom !== null && !creating) setCreating(true)

  // Until the list is known, nothing jumps: neither the panels nor the list show.
  if (rooms.list === undefined) {
    return (
      <div className="rooms-page">
        <AppHeader current="rooms" />
        <main className="rooms-page__main" aria-busy="true" />
      </div>
    )
  }

  const listed = rooms.list.length > 0
  return (
    <div className="rooms-page" data-listed={listed || undefined}>
      <AppHeader current="rooms" />
      <main className="rooms-page__main">
        <div className="rooms-page__intro">
          <h1 className="rooms-page__title ro-serif">{t('rooms.title')}</h1>
          {!listed && <p className="rooms-page__lead">{t('rooms.lead')}</p>}
        </div>
        {listed ? (
          <RoomsList
            rooms={rooms.list}
            onChange={rooms.set}
            creating={creating && <CreateRoomCard focus={newRoom} />}
          />
        ) : (
          <RoomForms focusCreate={newRoom} />
        )}
      </main>
    </div>
  )
}

/**
 * The person's open Rooms: undefined while they are asked for, empty when
 * there are none or the server could not say (the panels are a way in anyway).
 */
function useOpenRooms(token: string | null): { list: OpenRoom[] | undefined; set: (rooms: OpenRoom[]) => void } {
  // Without a token there is nobody to ask for: no Rooms.
  const [list, setList] = useState<OpenRoom[] | undefined>(token ? undefined : [])
  useEffect(() => {
    if (!token) return
    let current = true
    api<OpenRoom[]>('/rooms', { token })
      .then((rooms) => current && setList(rooms))
      .catch(() => current && setList([]))
    return () => {
      current = false
    }
  }, [token])
  return { list, set: setList }
}
