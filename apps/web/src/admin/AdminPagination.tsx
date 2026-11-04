import { useI18n } from '../i18n'
import { IconButton } from '../ui/IconButton'

/** "1–50 of 120", and the way to the page before and after, as the Library pages its Hands. */
export function AdminPagination({
  page,
  pageSize,
  shown,
  total,
  onGoTo,
}: {
  page: number
  pageSize: number
  shown: number
  total: number
  onGoTo: (page: number) => void
}) {
  const { t } = useI18n()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = (page - 1) * pageSize + 1
  return (
    <div className="admin-pages">
      <span>{t('library.showing', { first, last: first + shown - 1, total })}</span>
      <IconButton
        icon="previous"
        size="compact"
        label={t('library.previousPage')}
        disabledReason={page <= 1 ? t('library.firstPage') : undefined}
        onClick={() => onGoTo(page - 1)}
      />
      <span className="ro-mono">{t('library.page', { page, pages })}</span>
      <IconButton
        icon="next"
        size="compact"
        label={t('library.nextPage')}
        disabledReason={page >= pages ? t('library.lastPage') : undefined}
        onClick={() => onGoTo(page + 1)}
      />
    </div>
  )
}
