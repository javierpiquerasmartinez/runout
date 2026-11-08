import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Breadcrumb } from './Breadcrumb'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('Breadcrumb', () => {
  it('leads through links and ends in the current page', () => {
    render(
      <Breadcrumb
        label="Path"
        trail={[
          { label: 'Calendar', href: '/calendar' },
          { label: 'November 2026', href: '/calendar/month/2026-11' },
        ]}
        current="Thin value on the river"
      />,
    )

    const nav = screen.getByRole('navigation', { name: 'Path' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Calendar', '/calendar'],
      ['November 2026', '/calendar/month/2026-11'],
    ])
    const current = within(nav).getByText('Thin value on the river')
    expect(current.getAttribute('aria-current')).toBe('page')
    expect(current.getAttribute('title')).toBe('Thin value on the river')
    expect(within(nav).getAllByRole('listitem')).toHaveLength(3)
  })

  it('follows a link within the app, without reloading', async () => {
    render(<Breadcrumb label="Path" trail={[{ label: 'Calendar', href: '/calendar' }]} current="Squeeze" />)

    await userEvent.click(screen.getByRole('link', { name: 'Calendar' }))

    expect(window.location.pathname).toBe('/calendar')
  })

  it('lets a link go its own way', async () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(<Breadcrumb label="Path" trail={[{ label: 'Calendar', href: '/calendar', onClick }]} current="Squeeze" />)

    await userEvent.click(screen.getByRole('link', { name: 'Calendar' }))

    expect(onClick).toHaveBeenCalledOnce()
    expect(window.location.pathname).toBe('/')
  })
})
