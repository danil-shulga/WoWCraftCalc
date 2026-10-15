import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ItemCatalog } from '../../domain/item.types'
import { RecipeEditor } from './RecipeEditor'

const catalog = {
  craft: {
    id: 'craft',
    name: 'Слиток осквернённого железа',
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: null,
    recipe: null,
  },
  ore: {
    id: 'ore',
    name: 'Руда осквернённого железа',
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 100,
    salePriceCopper: null,
    recipe: null,
  },
  adamantite: {
    id: 'adamantite',
    name: 'Адамантитовая руда',
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 200,
    salePriceCopper: null,
    recipe: null,
  },
  thread: {
    id: 'thread',
    name: 'Грубая нить',
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 10,
    salePriceCopper: null,
    recipe: null,
  },
} satisfies ItemCatalog

describe('RecipeEditor', () => {
  it.each(['ru', 'en'] as const)(
    'ищет реагент на обоих языках при отображении %s',
    async (itemLanguage) => {
      const user = userEvent.setup()
      render(
        <RecipeEditor
          item={catalog.craft}
          catalog={{
            ...catalog,
            ore: {
              ...catalog.ore,
              names: { ru: 'Руда осквернённого железа', en: 'Fel Iron Ore' },
            },
          }}
          itemLanguage={itemLanguage}
          ownedProfessions={[]}
          onSave={vi.fn(() => null)}
          onRemove={vi.fn()}
          onCancel={vi.fn()}
        />,
      )
      const field = screen.getByRole('combobox', { name: 'Поиск и выбор реагента' })
      await user.type(field, itemLanguage === 'ru' ? 'FEL IRON' : 'ОСКВЕРНЕННОГО')
      const name = itemLanguage === 'ru' ? 'Руда осквернённого железа' : 'Fel Iron Ore'
      const secondaryName =
        itemLanguage === 'ru' ? 'Fel Iron Ore' : 'Руда осквернённого железа'
      expect(screen.getByRole('option', { name })).toHaveTextContent(secondaryName)
      expect(
        within(screen.getByRole('option', { name })).getByTitle(`Иконка: ${name}`),
      ).toBeVisible()
      await user.click(screen.getByRole('option', { name }))
      expect(field).toHaveValue(name)
      const closingList = screen.getByRole('listbox', { hidden: true })
      expect(closingList).toHaveAttribute('inert')
      expect(closingList).toHaveAttribute('aria-hidden', 'true')
      fireEvent(
        closingList,
        Object.assign(new Event('animationend', { bubbles: true }), {
          animationName: 'select-close',
        }),
      )
      expect(screen.queryByRole('listbox', { hidden: true })).not.toBeInTheDocument()
      expect(screen.getByTitle(`Иконка: ${name}`)).toBeVisible()
      expect(screen.queryByText(secondaryName)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))
      expect(field).toHaveValue('')
      expect(screen.getByText(name)).toBeVisible()
      expect(screen.getByText(secondaryName)).toBeVisible()
      expect(screen.getByTitle(`Иконка: ${name}`)).toBeVisible()
      expect(screen.queryByText('Получать')).not.toBeInTheDocument()
      expect(screen.queryByText('Количество')).not.toBeInTheDocument()
      expect(
        screen.getByRole('spinbutton', { name: `Количество: ${name}` }),
      ).toBeVisible()
      expect(screen.queryByRole('button', { name: /Купить|Крафтить/ })).toBeNull()
    },
  )

  it('фильтрует список реагентов по части названия без учёта регистра', async () => {
    const user = userEvent.setup()
    const handleSave = vi.fn(() => null)

    render(
      <RecipeEditor
        item={catalog.craft}
        catalog={catalog}
        ownedProfessions={[]}
        onSave={handleSave}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const reagentField = screen.getByRole('combobox', {
      name: 'Поиск и выбор реагента',
    })

    await user.type(reagentField, 'РУДА')

    expect(screen.getByRole('listbox').parentElement).toBe(document.body)
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.queryByRole('option', { name: 'Грубая нить' })).toBeNull()

    await user.click(screen.getByRole('option', { name: 'Адамантитовая руда' }))

    expect(reagentField).toHaveValue('Адамантитовая руда')
    expect(screen.getByRole('button', { name: 'Добавить реагент' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))

    const professionField = screen.getByRole('combobox', { name: 'Профессия' })

    await user.type(professionField, 'Mining')
    await user.click(screen.getByRole('option', { name: 'Горное дело (Mining)' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить рецепт' }))

    expect(handleSave).toHaveBeenCalledWith({
      outputQuantity: 1,
      profession: 'mining',
      reagents: [{ itemId: 'adamantite', quantity: 1, acquisition: 'auto' }],
    })
  })

  it('сохраняет способ получения существующего реагента при изменении количества', async () => {
    const user = userEvent.setup()
    const handleSave = vi.fn(() => null)

    render(
      <RecipeEditor
        item={{
          ...catalog.craft,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'ore', quantity: 2, acquisition: 'buy' }],
          },
        }}
        catalog={catalog}
        ownedProfessions={[]}
        onSave={handleSave}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const quantity = screen.getByRole('spinbutton', {
      name: 'Количество: Руда осквернённого железа',
    })
    await user.clear(quantity)
    await user.type(quantity, '3')
    await user.click(screen.getByRole('button', { name: 'Сохранить рецепт' }))

    expect(handleSave).toHaveBeenCalledWith({
      outputQuantity: 1,
      profession: null,
      reagents: [{ itemId: 'ore', quantity: 3, acquisition: 'buy' }],
    })
  })

  it('исключает удаляемую строку из черновика сразу и убирает из DOM после анимации', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(() => null)
    const onDraftChange = vi.fn()
    render(
      <RecipeEditor
        item={{
          ...catalog.craft,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [
              { itemId: 'ore', quantity: 2, acquisition: 'buy' },
              { itemId: 'thread', quantity: 1, acquisition: 'auto' },
            ],
          },
        }}
        catalog={catalog}
        ownedProfessions={[]}
        onSave={onSave}
        onDraftChange={onDraftChange}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const name = screen.getByText(catalog.ore.name)
    const row = name.closest('li')
    if (!row) throw new Error('Нет строки реагента')
    await user.click(within(row).getByRole('button', { name: 'Удалить' }))
    expect(row).toHaveAttribute('inert')
    expect(row).toHaveAttribute('aria-hidden', 'true')
    expect(name).toBeInTheDocument()
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reagents: [{ itemId: 'thread', quantity: 1, acquisition: 'auto' }],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить рецепт' }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        reagents: [{ itemId: 'thread', quantity: 1, acquisition: 'auto' }],
      }),
    )
    fireEvent.animationEnd(name)
    expect(name).toBeInTheDocument()
    fireEvent.animationEnd(row)
    expect(name).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Поиск и выбор реагента' }))
    await user.click(screen.getByRole('option', { name: catalog.ore.name }))
    await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))
    expect(
      screen.getByRole('spinbutton', { name: `Количество: ${catalog.ore.name}` }),
    ).toHaveValue(1)
    const addedName = screen.getByText(catalog.ore.name)
    const addedRow = addedName.closest('li')
    if (!addedRow) throw new Error('Нет добавленной строки')
    fireEvent.animationEnd(addedRow)
    expect(addedName).toBeInTheDocument()
  })

  it('сохраняет область списка при первом добавлении и возвращает подсказку после удаления', async () => {
    const user = userEvent.setup()
    render(
      <RecipeEditor
        item={catalog.craft}
        catalog={catalog}
        ownedProfessions={[]}
        onSave={vi.fn(() => null)}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const hint = screen.getByText('Добавьте хотя бы один реагент.')
    const list = screen.getByRole('list')
    expect(hint).toBeVisible()
    await user.click(screen.getByRole('combobox', { name: 'Поиск и выбор реагента' }))
    await user.click(screen.getByRole('option', { name: catalog.ore.name }))
    await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))
    expect(screen.getByRole('list')).toBe(list)
    expect(hint).toBeInTheDocument()
    expect(hint).toHaveAttribute('aria-hidden', 'true')
    const row = screen.getByRole('listitem')
    await user.click(within(row).getByRole('button', { name: 'Удалить' }))
    expect(hint).toHaveAttribute('aria-hidden', 'true')
    fireEvent.animationEnd(row)
    expect(screen.getByRole('list')).toBe(list)
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(hint).toHaveAttribute('aria-hidden', 'false')
    expect(hint).toBeVisible()
  })

  it('не сохраняет рецепт без реагентов', async () => {
    const user = userEvent.setup()
    const handleSave = vi.fn(() => null)

    render(
      <RecipeEditor
        item={catalog.craft}
        catalog={catalog}
        ownedProfessions={[]}
        onSave={handleSave}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Сохранить рецепт' }))

    expect(handleSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Добавьте хотя бы один реагент')
  })
})
