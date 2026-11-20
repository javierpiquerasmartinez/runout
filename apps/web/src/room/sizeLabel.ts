import type { Translator } from '../i18n/translator'

/** "840 KB", "21,4 MB", "1,2 GB", in the reader's language. */
export function sizeLabel(bytes: number, formatNumber: Translator['formatNumber']): string {
  const units = [
    ['gigabyte', 1024 ** 3],
    ['megabyte', 1024 ** 2],
    ['kilobyte', 1024],
  ] as const
  const [unit, scale] = units.find(([, scale]) => bytes >= scale) ?? units[2]
  return formatNumber(bytes / scale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 })
}
