import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'

describe('Chip', () => {
  it('offers a named remove button when removable', async () => {
    const onRemove = vi.fn()
    render(
      <Chip variant="active" onRemove={onRemove} removeLabel="Quitar filtro Stake: NL50">
        Stake: NL50
      </Chip>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Stake: NL50' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('is plain text when not removable', () => {
    render(<Chip variant="street">TURN</Chip>)
    expect(screen.getByText('TURN')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
