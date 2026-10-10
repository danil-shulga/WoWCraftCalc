import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('передаёт подтверждение и отмену вызывающей стороне', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    const { rerender } = render(
      <ConfirmDialog
        title="Удалить предмет?"
        message="Предмет исчезнет из всех рецептов."
        confirmLabel="Удалить"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByText('Предмет исчезнет из всех рецептов.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()

    rerender(
      <ConfirmDialog
        title="Удалить предмет?"
        message="Предмет исчезнет из всех рецептов."
        confirmLabel="Удалить"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
