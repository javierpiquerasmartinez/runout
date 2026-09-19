import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('fires onClick when enabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Crear sala</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Crear sala' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('stays focusable but inert when disabled, announcing the reason', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabledReason="Solo el Master controla la reproducción">
        Crear sala
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Crear sala. Solo el Master controla la reproducción' })
    expect(button.getAttribute('aria-disabled')).toBe('true')

    await userEvent.tab()
    expect(document.activeElement).toBe(button)

    await userEvent.click(button)
    await userEvent.keyboard('{Enter}')
    expect(onClick).not.toHaveBeenCalled()
  })
})
