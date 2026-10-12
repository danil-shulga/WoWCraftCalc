import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState } from 'react'

import { Modal } from './Modal'

function ModalHarness() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true)
        }}
      >
        Открыть
      </button>
      {isOpen ? (
        <Modal
          title="Проверка"
          onClose={() => {
            setIsOpen(false)
          }}
        >
          <button type="button">Первое действие</button>
          <button type="button">Последнее действие</button>
        </Modal>
      ) : null}
    </>
  )
}

describe('Modal', () => {
  it('блокирует прокрутку страницы до закрытия диалога', async () => {
    const user = userEvent.setup()
    const previousOverflow = document.body.style.overflow
    render(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe(previousOverflow)
  })

  it.each(['first', 'second'] as const)(
    'сохраняет блокировку при закрытии %s диалога и восстанавливает исходный стиль после последнего',
    (firstClosed) => {
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'scroll'
      const first = render(
        <StrictMode>
          <Modal title="Первый" onClose={vi.fn()}>
            Первый диалог
          </Modal>
        </StrictMode>,
      )
      const second = render(
        <StrictMode>
          <Modal title="Второй" onClose={vi.fn()}>
            Второй диалог
          </Modal>
        </StrictMode>,
      )
      try {
        expect(document.body.style.overflow).toBe('hidden')
        const [earlier, later] =
          firstClosed === 'first' ? [first, second] : [second, first]
        earlier.unmount()
        expect(document.body.style.overflow).toBe('hidden')
        later.unmount()
        expect(document.body.style.overflow).toBe('scroll')
      } finally {
        first.unmount()
        second.unmount()
        document.body.style.overflow = previousOverflow
      }
    },
  )

  it('удерживает клавиатурный фокус внутри диалога', async () => {
    const user = userEvent.setup()

    render(<ModalHarness />)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))

    const dialog = screen.getByRole('dialog')
    const closeButton = within(dialog).getByRole('button', { name: 'Закрыть' })
    const lastButton = within(dialog).getByRole('button', {
      name: 'Последнее действие',
    })

    expect(closeButton).toHaveFocus()

    lastButton.focus()
    await user.tab()
    expect(closeButton).toHaveFocus()

    await user.tab({ shift: true })
    expect(lastButton).toHaveFocus()
  })

  it('возвращает фокус после закрытия', async () => {
    const user = userEvent.setup()

    render(<ModalHarness />)
    const opener = screen.getByRole('button', { name: 'Открыть' })
    await user.click(opener)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
})
