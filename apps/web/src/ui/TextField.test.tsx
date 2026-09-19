import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('is labelled and announces its error', () => {
    render(<TextField label="Código de sala" defaultValue="RNT-0000" error="No existe ninguna sala con ese código." />)
    const input = screen.getByRole('textbox', { name: 'Código de sala' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('No existe ninguna sala con ese código.').id).toBe(input.getAttribute('aria-describedby'))
  })

  it('cannot be edited when locked, and says why', async () => {
    render(<TextField label="Nombre de la sala" defaultValue="Martes NL50" disabledReason="Solo el Master" />)
    const input = screen.getByRole('textbox', { name: 'Nombre de la sala. Solo el Master' })
    await userEvent.type(input, 'x')
    expect((input as HTMLInputElement).value).toBe('Martes NL50')
  })
})
