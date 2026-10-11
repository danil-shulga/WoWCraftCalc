import { act, fireEvent, render, screen } from '@testing-library/react'

import { Toast } from './Toast'

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('объявляет сообщение без перехвата фокуса и закрывается автоматически', () => {
    const onClose = vi.fn()
    render(
      <>
        <button autoFocus>Добавить крафт</button>
        <Toast message="Крафт создан. Добавлено реагентов: 4." onClose={onClose} />
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Крафт создан')
    expect(screen.getByRole('button', { name: 'Добавить крафт' })).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5999)
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('позволяет закрыть уведомление вручную и очищает таймер после удаления', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Toast message="Крафт создан." onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each(['наведении', 'фокусе'])(
    'оставляет уведомление видимым при %s и запускает таймер после ухода',
    (interaction) => {
      const onClose = vi.fn()
      render(<Toast message="Крафт создан." onClose={onClose} />)
      const close = screen.getByRole('button', { name: 'Закрыть уведомление' })
      if (interaction === 'наведении') {
        fireEvent.mouseEnter(close)
      } else {
        fireEvent.focus(close)
      }
      act(() => {
        vi.advanceTimersByTime(10000)
      })
      expect(onClose).not.toHaveBeenCalled()
      if (interaction === 'наведении') {
        fireEvent.mouseLeave(close)
      } else {
        fireEvent.blur(close)
      }
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(onClose).toHaveBeenCalledOnce()
    },
  )
})
