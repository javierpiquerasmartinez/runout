import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Dropdown } from './Dropdown'

const sites = [
  { value: '', label: 'Todos los sitios' },
  { value: 'pokerstars', label: 'PokerStars' },
  { value: 'coinpoker', label: 'CoinPoker' },
  { value: 'gg', label: 'GGPoker', disabled: true },
]

function Controlled() {
  const [site, setSite] = useState('')
  return (
    <>
      <Dropdown label="Sitio" value={site} options={sites} onChange={setSite} />
      <p>Elegido: {site || 'nada'}</p>
    </>
  )
}

const trigger = () => screen.getByRole('button', { name: /^Sitio/ })

describe('Dropdown', () => {
  it('is a button that names its label and its choice, and opens the list of options', async () => {
    render(<Controlled />)
    expect(trigger().textContent).toContain('Todos los sitios')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()

    await userEvent.click(trigger())

    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Todos los sitios', 'PokerStars', 'CoinPoker', 'GGPoker'])
    expect(screen.getByRole('option', { name: 'Todos los sitios' }).getAttribute('aria-selected')).toBe('true')
  })

  it('picks an option, closes, and gives the focus back to its button', async () => {
    render(<Controlled />)

    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('option', { name: 'PokerStars' }))

    expect(screen.getByText('Elegido: pokerstars')).toBeTruthy()
    expect(trigger().textContent).toContain('PokerStars')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('works by keyboard: opens on the choice, moves with the arrows, picks with Enter', async () => {
    render(<Controlled />)
    trigger().focus()

    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Todos los sitios' }))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'CoinPoker' }))
    await userEvent.keyboard('{ArrowUp}{End}')
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'GGPoker' }))
    await userEvent.keyboard('{Home}{ArrowDown}{Enter}')

    expect(screen.getByText('Elegido: pokerstars')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on Escape and on a click outside, changing nothing', async () => {
    render(<Controlled />)

    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger())

    await userEvent.click(trigger())
    await userEvent.click(screen.getByText(/Elegido/))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByText('Elegido: nada')).toBeTruthy()
  })

  it('offers a disabled option without letting it be picked', async () => {
    render(<Controlled />)

    await userEvent.click(trigger())
    const gg = screen.getByRole('option', { name: 'GGPoker' })
    expect(gg.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(gg)

    expect(screen.getByText('Elegido: nada')).toBeTruthy()
    expect(screen.getByRole('listbox')).toBeTruthy()
  })
})
