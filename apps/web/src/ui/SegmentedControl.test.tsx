import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

type DisplayUnit = 'bb' | 'amount' | 'both'
const options = [
  { value: 'bb', label: 'Ciegas' },
  { value: 'amount', label: 'Cantidades' },
  { value: 'both', label: 'Ambas' },
] as const

function Controlled({ disabledReason }: { disabledReason?: string }) {
  const [unit, setUnit] = useState<DisplayUnit>('bb')
  return (
    <SegmentedControl
      label="Unidad"
      options={options}
      value={unit}
      onChange={setUnit}
      disabledReason={disabledReason}
    />
  )
}

describe('SegmentedControl', () => {
  it('is a radio group with exactly one option selected', async () => {
    render(<Controlled />)
    screen.getByRole('radiogroup', { name: 'Unidad' })
    expect(screen.getByRole('radio', { name: 'Ciegas' }).getAttribute('aria-checked')).toBe('true')

    await userEvent.click(screen.getByRole('radio', { name: 'Ambas' }))
    expect(screen.getByRole('radio', { name: 'Ambas' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Ciegas' }).getAttribute('aria-checked')).toBe('false')
  })

  it('keeps its selection when locked, and says why', async () => {
    render(<Controlled disabledReason="Solo el Master puede cambiarla" />)
    await userEvent.click(screen.getByRole('radio', { name: 'Ambas. Solo el Master puede cambiarla' }))
    expect(screen.getByRole('radio', { name: 'Ciegas. Solo el Master puede cambiarla' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })
})
