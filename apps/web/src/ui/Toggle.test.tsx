import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Toggle } from './Toggle'

function Controlled({ disabledReason }: { disabledReason?: string }) {
  const [on, setOn] = useState(false)
  return <Toggle label="Ocultar nombres" checked={on} onChange={setOn} disabledReason={disabledReason} />
}

describe('Toggle', () => {
  it('is a switch that flips its checked state', async () => {
    render(<Controlled />)
    const toggle = screen.getByRole('switch', { name: 'Ocultar nombres' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('does not flip when locked, and says why', async () => {
    render(<Controlled disabledReason="Solo el Master puede cambiarlo" />)
    const toggle = screen.getByRole('switch', { name: 'Ocultar nombres. Solo el Master puede cambiarlo' })
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
