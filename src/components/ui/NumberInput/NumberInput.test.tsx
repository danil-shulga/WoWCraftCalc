import { render } from '@testing-library/react'
import { act, useState } from 'react'

import { NumberInput } from './NumberInput'

function NumberInputHarness() {
  const [value, setValue] = useState(1)

  return <NumberInput value={value} min={1} max={2} onChange={setValue} />
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
})
