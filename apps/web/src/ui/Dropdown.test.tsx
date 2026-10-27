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

  describe('choosing several', () => {
    const heroes = ['iMapleAA', 'Hero', 'Villain', 'Fish1', 'Fish2', 'Reg1', 'Reg2', 'Reg3', 'Nit'].map((name) => ({ value: name, label: name }))

    function Several({ options = sites.slice(1, 3) }: { options?: { value: string; label: string }[] }) {
      const [chosen, setChosen] = useState<string[]>([])
      return (
        <>
          <Dropdown multiple label="Sitio" none="Todos los sitios" searchLabel="Buscar" value={chosen} options={options} onChange={setChosen} />
          <p>Elegidos: {chosen.join(', ') || 'nada'}</p>
        </>
      )
    }

    it('ticks several options, staying open, and names the first with how many more', async () => {
      render(<Several />)
      expect(trigger().textContent).toContain('Todos los sitios')

      await userEvent.click(trigger())
      expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe('true')
      await userEvent.click(screen.getByRole('option', { name: 'CoinPoker' }))
      await userEvent.click(screen.getByRole('option', { name: 'PokerStars' }))

      expect(screen.getByText('Elegidos: coinpoker, pokerstars')).toBeTruthy()
      expect(screen.getByRole('option', { name: 'PokerStars' }).getAttribute('aria-selected')).toBe('true')
      expect(screen.getByRole('listbox')).toBeTruthy()
      // Named in the order the list offers them, whichever was ticked first.
      expect(trigger().textContent).toContain('PokerStars +1')

      await userEvent.click(screen.getByRole('option', { name: 'PokerStars' }))
      expect(screen.getByText('Elegidos: coinpoker')).toBeTruthy()
      expect(trigger().textContent).toContain('CoinPoker')
    })

    it('ticks and unticks by keyboard with Space, staying open until Escape', async () => {
      render(<Several />)
      trigger().focus()

      await userEvent.keyboard('{ArrowDown} {ArrowDown} ')
      expect(screen.getByText('Elegidos: pokerstars, coinpoker')).toBeTruthy()
      expect(screen.getByRole('listbox')).toBeTruthy()
      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('listbox')).toBeNull()
      expect(document.activeElement).toBe(trigger())
    })

    it('offers a search once there are more than 8 options, narrowing what it lists', async () => {
      render(<Several options={heroes} />)

      await userEvent.click(trigger())
      const search = screen.getByRole('searchbox', { name: 'Buscar' })
      expect(document.activeElement).toBe(search)
      await userEvent.keyboard('reg')

      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Reg1', 'Reg2', 'Reg3'])
      await userEvent.keyboard('{ArrowDown} ')
      expect(screen.getByText('Elegidos: Reg1')).toBeTruthy()
    })

    it('has no search with 8 options or fewer', async () => {
      render(<Several options={heroes.slice(0, 8)} />)

      await userEvent.click(trigger())

      expect(screen.queryByRole('searchbox')).toBeNull()
    })
  })
})
