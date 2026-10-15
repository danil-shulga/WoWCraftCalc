import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { PlanQuantityControl } from './PlanQuantityControl'

function Harness() {
  const [quantity, setQuantity] = useState<number>()
  return (
    <PlanQuantityControl
      itemName="Слиток"
      quantity={quantity}
      step={3}
      onChange={setQuantity}
      onRemove={() => {
        setQuantity(undefined)
      }}
    />
  )
}
it('добавляет партию, фокусирует, меняет шагом и удаляет повторным кликом', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Добавить в план: Слиток' }))
  const input = screen.getByRole('spinbutton', { name: 'Количество: Слиток' })
  expect(input).toHaveFocus()
  expect(input).toHaveValue(3)
  expect(input).toHaveAttribute('step', '3')
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(input).toHaveValue(6)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input).toHaveValue(3)
  await user.click(screen.getByRole('button', { name: 'Увеличить значение' }))
  expect(input).toHaveValue(6)
  await user.click(screen.getByRole('button', { name: 'Уменьшить значение' }))
  expect(input).toHaveValue(3)
  await user.click(screen.getByRole('button', { name: 'Убрать из плана: Слиток' }))
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  const closing = input.closest('.plan-quantity-control__quantity')
  if (!closing) throw new Error('Нет контейнера количества')
  expect(closing).toHaveAttribute('inert')
  expect(input).toBeDisabled()
  expect(input).toBeInTheDocument()
  fireEvent.animationEnd(closing)
  expect(input).not.toBeInTheDocument()
})
it('отменяет скрытие при повторном добавлении и возвращает фокус в поле', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Добавить в план: Слиток' }))
  const input = screen.getByRole('spinbutton')
  await user.click(screen.getByRole('button', { name: 'Убрать из плана: Слиток' }))
  await user.click(screen.getByRole('button', { name: 'Добавить в план: Слиток' }))
  expect(screen.getByRole('spinbutton')).toBe(input)
  expect(input).toHaveFocus()
  expect(input).toBeEnabled()
  const container = input.closest('.plan-quantity-control__quantity')
  if (!container) throw new Error('Нет контейнера количества')
  expect(container).not.toHaveAttribute('inert')
  expect(container).toHaveClass('plan-quantity-control__quantity--opening')
  fireEvent.animationEnd(container)
  expect(container).not.toHaveClass('plan-quantity-control__quantity--opening')
  expect(input).toBeInTheDocument()
})
it('завершает появление только по собственной анимации и не повторяет его при изменении количества', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Добавить в план: Слиток' }))
  const input = screen.getByRole('spinbutton')
  const container = input.closest('.plan-quantity-control__quantity')
  if (!container) throw new Error('Нет контейнера количества')
  expect(container).toHaveClass('plan-quantity-control__quantity--opening')
  fireEvent.animationEnd(input)
  expect(container).toHaveClass('plan-quantity-control__quantity--opening')
  fireEvent.animationEnd(container)
  expect(container).not.toHaveClass('plan-quantity-control__quantity--opening')
  fireEvent.change(input, { target: { value: '4' } })
  expect(input).toHaveValue(4)
  expect(container).not.toHaveClass('plan-quantity-control__quantity--opening')
})
it('сохраняет некратный запрос, отклоняет дробь, ноль, переполнение и пустое поле', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Добавить в план: Слиток' }))
  const input = screen.getByRole('spinbutton')
  fireEvent.change(input, { target: { value: '4' } })
  fireEvent.blur(input)
  expect(input).toHaveValue(4)
  for (const value of ['0', '1.5', '-1', '9007199254740992', '']) {
    fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)
    expect(input).toHaveValue(4)
  }
})
