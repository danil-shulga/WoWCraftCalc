import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ItemCatalog } from '../domain/item.types'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

const items: ItemCatalog = {
  potion: {
    id: 'potion',
    name: 'Лечебное зелье',
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 100,
    recipe: null,
  },
  bag: {
    id: 'bag',
    name: 'Шерстяная сумка',
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 200,
    recipe: null,
  },
}

describe('ItemsPage', () => {
  beforeEach(() => {
    useCraftStore.setState({ items })
  })

  it('фильтрует предметы по названию без учёта регистра', async () => {
    const user = userEvent.setup()

    render(<ItemsPage section="crafts" />)

    const search = screen.getByRole('searchbox', {
      name: 'Поиск по названию предмета',
    })

    await user.type(search, 'ЗЕЛЬЕ')

    expect(screen.getByText('Лечебное зелье')).toBeVisible()
    expect(screen.queryByText('Шерстяная сумка')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'руда')

    expect(screen.getByText('Ничего не найдено')).toBeVisible()
  })
})
