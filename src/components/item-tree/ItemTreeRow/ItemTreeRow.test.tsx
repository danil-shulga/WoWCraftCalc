import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../../ui/Button/Button'
import { ItemTreeRow } from './ItemTreeRow'

describe('ItemTreeRow', () => {
  it('раскрывает строку кликом по названию, свободному месту и с клавиатуры', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const { rerender } = render(
      <ItemTreeRow
        className=""
        hasRecipe
        hasCycle={false}
        isExpanded={false}
        onToggle={onToggle}
      >
        <strong>Предмет</strong>
      </ItemTreeRow>,
    )
    const row = screen.getByRole('button', { name: 'Развернуть рецепт' })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByText('Предмет'))
    await user.click(row)
    row.focus()
    await user.keyboard('{Enter} ')
    expect(onToggle).toHaveBeenCalledTimes(4)
    rerender(
      <ItemTreeRow className="" hasRecipe hasCycle={false} isExpanded onToggle={onToggle}>
        <strong>Предмет</strong>
      </ItemTreeRow>,
    )
    expect(screen.getByRole('button', { name: 'Свернуть рецепт' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('сохраняет действия вложенных кнопок и полей без раскрытия строки', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const onEdit = vi.fn()
    render(
      <ItemTreeRow
        className=""
        hasRecipe
        hasCycle={false}
        isExpanded={false}
        onToggle={onToggle}
      >
        <Button onClick={onEdit}>
          <span>Редактировать</span>
        </Button>
        <Button disabled>Недоступно</Button>
        <label>
          Цена
          <input aria-label="Цена" />
        </label>
        <fieldset>
          <legend>Получать</legend>
          <span>Способ получения</span>
        </fieldset>
      </ItemTreeRow>,
    )
    await user.click(screen.getByText('Редактировать'))
    await user.keyboard('{Enter}')
    expect(onEdit).toHaveBeenCalledTimes(2)
    await user.click(screen.getByText('Недоступно'))
    await user.click(screen.getByText('Цена'))
    await user.type(screen.getByRole('textbox', { name: 'Цена' }), '123{Enter} ')
    await user.click(screen.getByText('Способ получения'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it.each([
    { hasRecipe: false, hasCycle: false },
    { hasRecipe: true, hasCycle: true },
  ])('не раскрывает строку без рецепта или с циклом: %o', async (props) => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <ItemTreeRow className="" {...props} isExpanded={false} onToggle={onToggle}>
        <strong>Предмет</strong>
      </ItemTreeRow>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await user.click(screen.getByText('Предмет'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
