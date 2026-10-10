import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

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
