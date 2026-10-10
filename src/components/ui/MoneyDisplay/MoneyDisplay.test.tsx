import { render, screen } from '@testing-library/react'

import { MoneyDisplay } from './MoneyDisplay'

describe('MoneyDisplay', () => {
  it('показывает части суммы с иконками соответствующих валют', () => {
    const { container } = render(<MoneyDisplay value={103_240} />)

    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(container.querySelector('.currency-icon--gold')).toBeInTheDocument()
    expect(container.querySelector('.currency-icon--silver')).toBeInTheDocument()
    expect(container.querySelector('.currency-icon--copper')).toBeInTheDocument()
  })

  it('сохраняет текст для неуказанной цены', () => {
    render(<MoneyDisplay value={null} />)

    expect(screen.getByText('не указано')).toBeInTheDocument()
  })
})
