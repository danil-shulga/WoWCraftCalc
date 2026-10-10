import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ItemCatalog } from '../../domain/item.types'
import { RecipeEditor } from './RecipeEditor'

const catalog: ItemCatalog = {
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
}

describe('RecipeEditor', () => {
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

    const professionField = screen.getByRole('combobox', { name: 'Профессия' })

    await user.type(professionField, 'Mining')
    await user.click(screen.getByRole('option', { name: 'Горное дело (Mining)' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить рецепт' }))

    expect(handleSave).toHaveBeenCalledWith({
      outputQuantity: 1,
      profession: 'mining',
      reagents: [],
    })
  })
})
