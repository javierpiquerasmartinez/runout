import { api } from '../backend/api'
import { useI18n } from '../i18n'
import { useImpersonationLock } from '../identity/impersonationLock'
import { roomPath } from '../room/roomCode'
import type { OpenRoom } from '../rooms/RoomsList'
import { requestNewRoom, roomsPath } from '../rooms/rooms'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { lockedProps } from '../ui/locked'
import { HomeCard, HomeCardLink, HomeCardMessage } from './HomeCard'
import { useCardRead } from './useCardRead'
import './RoomsCard.css'

const MOST_ROOMS = 4

const readRooms = (token: string) => api<OpenRoom[]>('/rooms', { token })

const latestFirst = (a: OpenRoom, b: OpenRoom) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt)

/** The Rooms this card has room for: the Live ones first, then the most recently active. */
function firstRooms(rooms: OpenRoom[]): OpenRoom[] {
  const liveOnes = rooms.filter((room) => room.state === 'live').sort(latestFirst)
  const others = rooms.filter((room) => room.state !== 'live').sort(latestFirst)
  return [...liveOnes, ...others].slice(0, MOST_ROOMS)
}

/** The Account's open Rooms, to go back into one with a click. An Impersonation sees them but never enters one. */
export function RoomsCard() {
  const { t } = useI18n()
  const noRooms = useImpersonationLock('rooms')
  const { status, data: rooms, reload } = useCardRead(readRooms)
  const listed = rooms !== null && rooms.length > 0
  return (
    <HomeCard
      title={t('header.nav.rooms')}
      href={roomsPath}
      status={status}
      onRetry={reload}
      action={
        listed && !noRooms ? (
          <HomeCardLink href={roomsPath}>{t('home.rooms.seeAll')}</HomeCardLink>
        ) : undefined
      }
    >
      {rooms?.length === 0 && (
        <HomeCardMessage title={t('home.rooms.empty.title')} text={t('home.rooms.empty.text')}>
          <Button
            size="compact"
            aria-label={noRooms ? t('header.newRoom') : undefined}
            disabledReason={noRooms}
            onClick={requestNewRoom}
          >
            <Icon name="add" size={14} />
            {t('header.newRoom')}
          </Button>
        </HomeCardMessage>
      )}
      {listed && noRooms && <p className="rooms-card__locked">{noRooms}</p>}
      {listed && (
        <ul className="rooms-card__rows">
          {firstRooms(rooms).map((room) => (
            <li key={room.code}>
              <RoomRow room={room} locked={noRooms} />
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  )
}

/** One Room: a way into it, or, during an Impersonation, what stands in its place, as reachable and saying why it is locked. */
function RoomRow({ room, locked }: { room: OpenRoom; locked: string | undefined }) {
  const { t } = useI18n()
  const live = room.state === 'live'
  const state = t(live ? 'rooms.row.live' : 'home.rooms.freeReview')
  const connected = t(room.connected === 1 ? 'home.rooms.connected.one' : 'home.rooms.connected.other', { count: room.connected })
  const content = (
    <>
      <span className="rooms-card__about">
        <span className="rooms-card__name">{room.name}</span>
        <span className="rooms-card__state">
          <span className="rooms-card__dot" aria-hidden="true" />
          {state}
        </span>
      </span>
      <span className="rooms-card__connected ro-mono">{connected}</span>
    </>
  )
  if (locked === undefined) {
    return (
      <a className="rooms-card__row" data-live={live || undefined} href={roomPath(room.code)} onClick={followLink}>
        {content}
      </a>
    )
  }
  return (
    <div className="rooms-card__row" data-live={live || undefined} role="link" tabIndex={0} {...lockedProps(t('home.rooms.row', { name: room.name, state, connected }), locked)}>
      {content}
    </div>
  )
}
