import { useCallback, useEffect, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { RoomDialog } from '../room/RoomDialog'
import { formatRoomCode } from '../room/roomCode'
import { Button } from '../ui/Button'
import { SegmentedControl } from '../ui/SegmentedControl'
import { nameOf, type AdminRoom, type RoomsPage } from './admin'
import { Badge } from './AdminPage'
import { AdminPagination } from './AdminPagination'
import { useAdminApi } from './useAdminApi'

/**
 * The Rooms tab: every Room, open or closed, the stalest first, so the ones
 * left behind stand out. An open one can be closed, as its Master would,
 * and a Live one brought back to Free Review, as a way out of a stuck Live.
 */
export function RoomsTab() {
  const { t, formatDate, formatRelative, formatNumber } = useI18n()
  const admin = useAdminApi()
  const [status, setStatus] = useState<'open' | 'all'>('open')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [pageNumber, setPageNumber] = useState(1)
  const [page, setPage] = useState<RoomsPage | null>(null)
  const [failure, setFailure] = useState<FailureReason | null>(null)
  const [closing, setClosing] = useState<AdminRoom | null>(null)
  const [endingLive, setEndingLive] = useState<AdminRoom | null>(null)

  const reload = useCallback(() => {
    const query = new URLSearchParams({ status, sort: 'lastActivityAt', direction, page: String(pageNumber) })
    admin<RoomsPage>(`/rooms?${query}`)
      .then((found) => {
        setPage(found)
        setFailure(null)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
  }, [admin, status, direction, pageNumber])
  useEffect(reload, [reload])

  async function close(room: AdminRoom) {
    setClosing(null)
    try {
      await admin(`/rooms/${room.code}/close`, { method: 'POST' })
      reload()
    } catch (error) {
      setFailure(reasonOf(error))
    }
  }

  async function endLive(room: AdminRoom) {
    setEndingLive(null)
    try {
      await admin(`/rooms/${room.code}/end-live`, { method: 'POST' })
      reload()
    } catch (error) {
      setFailure(reasonOf(error))
    }
  }

  const date = (iso: string) => formatDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <section className="admin-section" aria-label={t('admin.tab.rooms')}>
      <div className="admin-toolbar">
        <SegmentedControl
          label={t('admin.rooms.filter')}
          options={[
            { value: 'open', label: t('admin.rooms.filter.open') },
            { value: 'all', label: t('admin.rooms.filter.all') },
          ]}
          value={status}
          onChange={(value) => {
            setStatus(value)
            setPageNumber(1)
          }}
        />
      </div>
      {failure && (
        <p className="admin-notice" data-tone="alert" role="alert">
          {t(`reason.${failure}`)}
        </p>
      )}
      {page && page.rooms.length === 0 && <p className="admin-notice">{t('admin.rooms.none')}</p>}
      {page && page.rooms.length > 0 && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.rooms.name')}</th>
                  <th>{t('admin.rooms.code')}</th>
                  <th>{t('admin.rooms.master')}</th>
                  <th>{t('admin.rooms.status')}</th>
                  <th className="admin-table__number">{t('admin.rooms.participants')}</th>
                  <th className="admin-table__number">{t('admin.rooms.queue')}</th>
                  <th>{t('admin.rooms.createdAt')}</th>
                  <th aria-sort={direction === 'asc' ? 'ascending' : 'descending'}>
                    <button
                      type="button"
                      className="admin-table__sort"
                      data-current
                      onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
                    >
                      {t('admin.rooms.lastActivity')}
                    </button>
                  </th>
                  <th>
                    <span className="ro-visually-hidden">{t('admin.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.rooms.map((room) => (
                  <tr key={room.code}>
                    <td>{room.name}</td>
                    <td className="ro-mono">{formatRoomCode(room.code)}</td>
                    <td>{nameOf(room.master)}</td>
                    <td>
                      <Badge tone={room.status === 'open' ? 'sync' : 'muted'}>{t(`admin.rooms.status.${room.status}`)}</Badge>
                      {room.status === 'open' && (
                        <span className="admin-table__state">{t(`admin.rooms.state.${room.state}`)}</span>
                      )}
                    </td>
                    <td className="admin-table__number">{formatNumber(room.participants)}</td>
                    <td className="admin-table__number">{formatNumber(room.queueLength)}</td>
                    <td>{date(room.createdAt)}</td>
                    <td>{formatRelative(new Date(room.lastActivityAt))}</td>
                    <td>
                      {room.status === 'open' && room.state === 'live' && (
                        <Button size="compact" variant="ghost" onClick={() => setEndingLive(room)}>
                          {t('admin.rooms.endLive')}
                        </Button>
                      )}
                      {room.status === 'open' && (
                        <Button size="compact" variant="ghost" onClick={() => setClosing(room)}>
                          {t('admin.rooms.close')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page.page}
            pageSize={page.pageSize}
            shown={page.rooms.length}
            total={page.total}
            onGoTo={setPageNumber}
          />
        </>
      )}
      {closing && (
        <RoomDialog
          title={t('admin.rooms.confirm.title')}
          body={t('admin.rooms.confirm.body', { name: closing.name })}
          onClose={() => setClosing(null)}
          actions={
            <Button variant="destructive" onClick={() => void close(closing)}>
              {t('admin.rooms.close')}
            </Button>
          }
        />
      )}
      {endingLive && (
        <RoomDialog
          title={t('admin.rooms.endLive.title')}
          body={t('admin.rooms.endLive.body', { name: endingLive.name })}
          onClose={() => setEndingLive(null)}
          actions={
            <Button variant="primary" onClick={() => void endLive(endingLive)}>
              {t('admin.rooms.endLive')}
            </Button>
          }
        />
      )}
    </section>
  )
}
