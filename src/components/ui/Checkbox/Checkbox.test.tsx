import { fireEvent, render, screen } from '@testing-library/react'

import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('остаётся доступным по подписи и сообщает новое состояние', () => {
    const handleChange = vi.fn()

    render(
      <Checkbox hideLabel label="Указать цену" checked={false} onChange={handleChange} />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Указать цену' }))

    expect(handleChange).toHaveBeenCalledWith(true)
  })
})
