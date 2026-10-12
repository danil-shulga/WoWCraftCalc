import { createRef, type SyntheticEvent } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { IconButton } from '../IconButton/IconButton'

describe('общие кнопки', () => {
  it('передаёт ref и обработчик, обычное действие не отправляет форму', async () => {
    const user = userEvent.setup()
    const ref = createRef<HTMLButtonElement>()
    const onClick = vi.fn()
    const onSubmit = vi.fn((event: SyntheticEvent) => {
      event.preventDefault()
    })
    render(
      <form onSubmit={onSubmit}>
        <Button ref={ref} variant="primary" onClick={onClick}>
          Действие
        </Button>
        <Button type="submit">Сохранить</Button>
      </form>,
    )
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Действие' }))
    await user.click(screen.getByRole('button', { name: 'Действие' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('сохраняет доступное имя и disabled у кнопки с иконкой', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <IconButton
        aria-label="Удалить предмет"
        variant="danger"
        disabled
        onClick={onClick}
      >
        ×
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Удалить предмет' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
