import { fireEvent, render, screen } from '@testing-library/react'
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
    const view = render(<Tooltip content="Материалы">Распыление</Tooltip>)
    const trigger = screen.getByText('Распыление')
    fireEvent.mouseEnter(trigger)
    const tooltip = screen.getByRole('tooltip')
    expect(view.container).not.toContainElement(tooltip)
    fireEvent.mouseLeave(trigger, { relatedTarget: tooltip })
    fireEvent.mouseEnter(tooltip)
    expect(tooltip).toBeInTheDocument()
    fireEvent.mouseLeave(tooltip)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('сразу скрывается после ухода с триггера и сохраняется при клавиатурном фокусе', async () => {
    const user = userEvent.setup()
    render(<Tooltip content="TSM">Цена</Tooltip>)
    const trigger = screen.getByText('Цена')
    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.tab()
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.blur(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
