import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { Tabs } from './Tabs'

function TabsHarness() {
  const [value, setValue] = useState<'first' | 'second'>('first')

  return (
    <>
      <Tabs
        tabs={[
          { value: 'first', label: 'Первая' },
          { value: 'second', label: 'Вторая' },
        ]}
        value={value}
        onChange={setValue}
      />
      <p>{value === 'first' ? 'Содержимое первой' : 'Содержимое второй'}</p>
    </>
  )
}

describe('Tabs', () => {
  it('переключает содержимое через обработчик родителя', async () => {
    const user = userEvent.setup()
    render(<TabsHarness />)

    expect(screen.getByText('Содержимое первой')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Первая' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Вторая' }))
    expect(screen.getByText('Содержимое второй')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Вторая' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByText('Содержимое первой')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Первая' }))
    expect(screen.getByText('Содержимое первой')).toBeVisible()
  })
})
