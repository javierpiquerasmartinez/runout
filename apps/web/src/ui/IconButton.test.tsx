import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('is named by its label, not its drawing', async () => {
    const onClick = vi.fn()
    render(<IconButton icon="copy" label="Copiar enlace" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is inert when locked, and says why', async () => {
    const onClick = vi.fn()
    render(<IconButton icon="next" label="Siguiente acción" onClick={onClick} disabledReason="Solo el Master avanza" />)
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente acción. Solo el Master avanza' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
