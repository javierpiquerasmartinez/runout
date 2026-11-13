import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { Locale } from '../i18n/catalogue'
import type { BulkImport } from './bulkImports'
import { ImportsView } from './ImportsView'

function bulkImport(overrides: Partial<BulkImport>): BulkImport {
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    files: [{ name: 'hm3-2024.zip', size: 1000 }],
    total: 320156,
    processed: 320156,
    imported: 318204,
    duplicates: 1910,
    notImported: { 'unrecognised-format': 42 },
    reason: null,
    createdAt: '2026-11-02T10:00:00.000Z',
    finishedAt: '2026-11-02T12:00:00.000Z',
    ...overrides,
  }
}

function renderImports(imports: BulkImport[], locale: Locale = 'es', onCancel: (id: string) => void = () => {}) {
  render(
    <I18nProvider initialLocale={locale}>
      <ImportsView imports={imports} onCancel={onCancel} />
    </I18nProvider>,
  )
  return screen.getByRole('table', { name: locale === 'es' ? 'Importaciones' : 'Imports' })
}

/** The cells of the row naming this file. */
function rowOf(table: HTMLElement, file: string): string[] {
  const row = within(table).getByRole('row', { name: new RegExp(file) })
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '')
}

describe('ImportsView', () => {
  it('lists each import with its file, status, Hands, start and result', () => {
    const table = renderImports([bulkImport({})])

    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Archivo',
      'Estado',
      'Manos',
      'Inicio',
      'Resultado',
      '',
    ])
    expect(rowOf(table, 'hm3-2024.zip')).toEqual([
      'hm3-2024.zip',
      'Completada',
      '318.204 manos',
      '2 nov 2026',
      // As Intl writes it in Spanish, like everywhere else in Runout: no point under 10.000.
      '1910 duplicadas · 42 no reconocidas',
      '',
    ])
  })

  it('shows how far one in progress has gone, with no result yet', () => {
    const table = renderImports([
      bulkImport({
        files: [{ name: 'pt4-2019-2026.zip', size: 1000 }],
        status: 'running',
        total: 1240000,
        processed: 412000,
        finishedAt: null,
      }),
    ])

    const [, status, hands, , result] = rowOf(table, 'pt4-2019-2026.zip')
    expect(status).toBe('En curso')
    expect(hands).toBe('412.000 de 1.240.000')
    expect(result).toBe('—')
    const bar = within(within(table).getByRole('row', { name: /pt4-2019-2026/ })).getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('412000')
    expect(bar.getAttribute('aria-valuemax')).toBe('1240000')
  })

  it('offers to cancel an unfinished import, and only those', async () => {
    const onCancel = vi.fn()
    const running = bulkImport({ files: [{ name: 'running.zip', size: 1 }], status: 'running', finishedAt: null })
    const paused = bulkImport({ files: [{ name: 'paused.zip', size: 1 }], status: 'paused', finishedAt: null })
    const table = renderImports([running, paused, bulkImport({})], 'es', onCancel)

    const cancels = within(table).getAllByRole('button', { name: 'Cancelar' })
    expect(cancels).toHaveLength(2)
    expect(within(within(table).getByRole('row', { name: /hm3-2024/ })).queryByRole('button')).toBeNull()

    await userEvent.click(within(within(table).getByRole('row', { name: /running\.zip/ })).getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledWith(running.id)
  })

  it('says a failed import was interrupted and how far it got, keeping its Hands', () => {
    const table = renderImports([
      bulkImport({ files: [{ name: 'sesiones-2023.zip', size: 1 }], status: 'failed', total: 210000, processed: 58000, imported: 57000 }),
    ])

    const [, status, hands, , result] = rowOf(table, 'sesiones-2023.zip')
    expect(status).toBe('Fallida')
    expect(hands).toBe('58.000 de 210.000')
    expect(result).toBe('Se interrumpió. Las manos importadas se conservan.')
  })

  it('says a cancelled import kept the Hands it had imported', () => {
    const table = renderImports([
      bulkImport({ files: [{ name: 'coinpoker-marzo.zip', size: 1 }], status: 'cancelled', total: 50000, processed: 12400, imported: 12400 }),
    ])

    const [, status, hands, , result] = rowOf(table, 'coinpoker-marzo.zip')
    expect(status).toBe('Cancelada')
    expect(hands).toBe('12.400 manos')
    expect(result).toBe('Cancelada por ti. Las manos importadas se conservan.')
  })

  it('says how long the history is kept', () => {
    renderImports([bulkImport({})])

    expect(screen.getByText('El historial se conserva 30 días.')).toBeTruthy()
  })

  it('reads “En curso” while waiting or counting too, and “Subiendo” while uploading', () => {
    const table = renderImports([
      bulkImport({ files: [{ name: 'a.txt', size: 1 }], status: 'waiting', total: null, processed: 0 }),
      bulkImport({ files: [{ name: 'b.txt', size: 1 }], status: 'counting', total: null, processed: 0 }),
      bulkImport({ files: [{ name: 'c.txt', size: 1 }], status: 'uploading', total: null, processed: 0 }),
    ])

    expect(rowOf(table, 'a.txt')[1]).toBe('En curso')
    expect(rowOf(table, 'b.txt')[1]).toBe('En curso')
    expect(rowOf(table, 'c.txt')[1]).toBe('Subiendo')
  })

  it('names every file of an import', () => {
    const table = renderImports([
      bulkImport({
        files: [
          { name: 'one.txt', size: 1 },
          { name: 'two.zip', size: 1 },
        ],
      }),
    ])

    expect(rowOf(table, 'one.txt')[0]).toBe('one.txt, two.zip')
  })

  it('names each reason Hands were not imported, with its own count', () => {
    const table = renderImports([
      bulkImport({ notImported: { 'unrecognised-format': 42, 'not-cash-holdem': 3, malformed: 1 } }),
    ])

    expect(rowOf(table, 'hm3-2024.zip')[4]).toBe(
      "1910 duplicadas · 42 no reconocidas · No es una mano de hold'em cash: 3 · No se ha podido leer: 1",
    )
  })

  it('says when no Hand in the files was recognised', () => {
    const table = renderImports([
      bulkImport({
        files: [{ name: 'notas.txt', size: 1 }],
        total: 0,
        processed: 0,
        imported: 0,
        duplicates: 0,
        notImported: { 'unrecognised-format': 1 },
        reason: 'unrecognised-format',
      }),
    ])

    const [, , hands, , result] = rowOf(table, 'notas.txt')
    expect(hands).toBe('0 manos')
    expect(result).toBe('No hemos reconocido el formato de ninguna mano.')
  })

  it('says the Library filled up, and how many Hands did not fit', () => {
    const table = renderImports([
      bulkImport({
        files: [{ name: 'pt4.zip', size: 1 }],
        imported: 87600,
        duplicates: 0,
        notImported: { 'library-full': 12400, 'not-cash-holdem': 3 },
        reason: 'library-full',
      }),
      bulkImport({
        files: [{ name: 'one-more.txt', size: 1 }],
        imported: 0,
        duplicates: 0,
        notImported: { 'library-full': 1 },
        reason: 'library-full',
      }),
    ])

    const [, status, hands, , result] = rowOf(table, 'pt4.zip')
    expect(status).toBe('Completada')
    expect(hands).toBe('87.600 manos')
    expect(result).toBe('Biblioteca llena: 12.400 manos no cabían.')
    expect(rowOf(table, 'one-more.txt')[4]).toBe('Biblioteca llena: 1 mano no cabía.')
  })

  it('says why an import ended adding none of its Hands', () => {
    const table = renderImports([
      bulkImport({ files: [{ name: 'huge.zip', size: 1 }], total: null, processed: 0, imported: 0, duplicates: 0, notImported: {}, reason: 'too-many-hands' }),
      bulkImport({ files: [{ name: 'broken.zip', size: 1 }], total: null, processed: 0, imported: 0, duplicates: 0, notImported: {}, reason: 'unreadable-file' }),
    ])

    expect(rowOf(table, 'huge.zip')[4]).toBe('Tiene más de 2 millones de manos: no se ha importado ninguna.')
    expect(rowOf(table, 'broken.zip')[4]).toBe('No se ha podido abrir uno de los archivos.')
  })

  it('leaves out what did not happen from the result', () => {
    const table = renderImports([bulkImport({ duplicates: 0, notImported: {} })])

    expect(rowOf(table, 'hm3-2024.zip')[4]).toBe('—')
  })

  it('speaks English too', () => {
    const table = renderImports([bulkImport({})], 'en')

    expect(rowOf(table, 'hm3-2024.zip')).toEqual([
      'hm3-2024.zip',
      'Completed',
      '318,204 hands',
      'Nov 2, 2026',
      '1,910 duplicates · 42 not recognised',
      '',
    ])
  })

  it('says there are none yet', () => {
    render(
      <I18nProvider initialLocale="es">
        <ImportsView imports={[]} onCancel={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getByText('Aún no has hecho ninguna importación grande.')).toBeTruthy()
  })
})
