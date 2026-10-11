import { render, screen } from '@testing-library/react'
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
      await user.click(screen.getByRole('option', { name }))
      expect(field).toHaveValue(name)
      expect(screen.getByText(secondaryName)).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))
      expect(screen.getByText(name)).toBeVisible()
      expect(screen.getByText(secondaryName)).toBeVisible()
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
