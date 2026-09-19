import { describe, expect, it } from 'vitest'
import { formatScreenNames, parseScreenNames } from './screenNames'

describe('Screen Names typed as one comma-separated field', () => {
  it('reads each name, trimmed, dropping blanks', () => {
    expect(parseScreenNames(' Javier_PS,JaviPQ88 , ,')).toEqual(['Javier_PS', 'JaviPQ88'])
    expect(parseScreenNames('')).toEqual([])
  })

  it('drops a name repeated in another case', () => {
    expect(parseScreenNames('Javier_PS, javier_ps')).toEqual(['Javier_PS'])
  })

  it('writes them back the way the field shows them', () => {
    expect(formatScreenNames(['Javier_PS', 'JaviPQ88'])).toBe('Javier_PS, JaviPQ88')
  })
})
