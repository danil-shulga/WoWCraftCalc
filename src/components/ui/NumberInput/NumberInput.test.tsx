import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act, useState } from 'react'

import { NumberInput } from './NumberInput'

function NumberInputHarness() {
  const [value, setValue] = useState(1)

  return <NumberInput value={value} min={1} max={2} onChange={setValue} />
}

function ZeroNumberInputHarness() {
  const [value, setValue] = useState(0)

  return <NumberInput value={value} min={0} onChange={setValue} />
}

describe('NumberInput', () => {
  it('изменяет значение кнопками и колесом в заданных границах', () => {
    const { container } = render(<NumberInputHarness />)
    const input = container.querySelector('input')
    const increaseButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Увеличить значение"]',
    )
    const decreaseButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Уменьшить значение"]',
    )

    expect(input).not.toBeNull()
    expect(increaseButton).not.toBeNull()
    expect(decreaseButton).not.toBeNull()

    expect(input).toHaveValue(1)
    expect(decreaseButton).toBeDisabled()

    act(() => {
      input?.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }),
      )
    })

    expect(input).toHaveValue(2)
    expect(increaseButton).toBeDisabled()

    act(() => {
      input?.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }),
      )
    })

    expect(input).toHaveValue(1)

    act(() => {
      increaseButton?.click()
    })

    expect(input).toHaveValue(2)
  })

  it('заменяет начальный ноль и восстанавливает его после пустого ввода', async () => {
    const user = userEvent.setup()
    render(<ZeroNumberInputHarness />)
    const input = screen.getByRole('spinbutton')

    await user.click(input)
    expect(input).toHaveValue(null)

    await user.type(input, '7')
    expect(input).toHaveValue(7)

    await user.clear(input)
    await user.tab()

    expect(input).toHaveValue(0)
  })
})
