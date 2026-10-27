import { describe, expect, it } from 'vitest'
import { libraryPageFromSearch, withLibraryPage } from './library'

describe('the page in the address', () => {
  it('writes the page after the filter and sort, and leaves the first out', () => {
    expect(withLibraryPage('?period=all&sort=result&dir=asc', 3)).toBe('?period=all&sort=result&dir=asc&page=3')
    expect(withLibraryPage('?period=all&page=3', 1)).toBe('?period=all')
    expect(withLibraryPage('', 1)).toBe('')
  })

  it('reads back the page written, and the first for anything that is not a later page', () => {
    expect(libraryPageFromSearch('?period=all&page=3')).toBe(3)
    for (const search of ['', '?page=1', '?page=0', '?page=-2', '?page=2.5', '?page=two']) {
      expect(libraryPageFromSearch(search)).toBe(1)
    }
  })
})
