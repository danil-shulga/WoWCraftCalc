import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('открывается с клавиатуры, связывает содержимое и закрывается по Escape и потере фокуса', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Tooltip content={<strong>Материалы</strong>}>Распыление</Tooltip>
        <button>Дальше</button>
      </>,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.tab()
    const trigger = screen.getByText('Распыление')
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(trigger).not.toHaveAttribute('aria-describedby')
    expect(trigger).toHaveFocus()
    await user.tab()
    await user.tab({ shift: true })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Материалы')
    await user.tab()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('остаётся открытой при переходе курсора в подсказку, закрывается после ухода и по Escape без фокуса', () => {
    vi.useFakeTimers()
    try {
      const view = render(<Tooltip content="Материалы">Распыление</Tooltip>)
      const trigger = screen.getByText('Распыление')
      fireEvent.mouseEnter(trigger)
      const tooltip = screen.getByRole('tooltip')
      expect(view.container).not.toContainElement(tooltip)
      fireEvent.mouseLeave(trigger)
      fireEvent.mouseEnter(tooltip)
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(tooltip).toBeInTheDocument()
      fireEvent.mouseLeave(tooltip)
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(screen.queryByRole('tooltip')).toBeNull()
      fireEvent.mouseEnter(trigger)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
