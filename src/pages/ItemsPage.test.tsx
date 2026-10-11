import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { AcquisitionMethod, ItemCatalog } from '../domain/item.types'
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

  it.each<{
    acquisition: AcquisitionMethod
    materialPrice: number | null
    quantity: number
    unitText: string
    totalText: string | null
  }>([
    {
      acquisition: 'craft',
      materialPrice: 1,
      quantity: 2,
      unitText: '1ммеди',
      totalText: '1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: 1,
      quantity: 3,
      unitText: '1ммеди',
      totalText: '2ммеди',
    },
    {
      acquisition: 'buy',
      materialPrice: 1,
      quantity: 2,
      unitText: '0ммеди',
      totalText: '−1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: 3,
      quantity: 3,
      unitText: '0ммеди',
      totalText: '−1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: 5,
      quantity: 2,
      unitText: '−1ммеди',
      totalText: '−3ммеди',
    },
    {
      acquisition: 'auto',
      materialPrice: 1,
      quantity: 2,
      unitText: '1ммеди',
      totalText: '1ммеди',
    },
    {
      acquisition: 'craft',
      materialPrice: null,
      quantity: 2,
      unitText: 'не указано',
      totalText: null,
    },
  ])(
    'показывает округлённую единицу и точную сумму: $acquisition, цена $materialPrice, количество $quantity',
    async ({ acquisition, materialPrice, quantity, unitText, totalText }) => {
      const user = userEvent.setup()
      const catalog: ItemCatalog = {
        dust: {
          id: 'dust',
          name: 'Пыль',
          iconUrl: '',
          sections: ['reagents'],
          purchasePriceCopper: materialPrice,
          salePriceCopper: null,
          recipe: null,
        },
        thread: {
          id: 'thread',
          name: 'Нить',
          iconUrl: '',
          sections: ['reagents'],
          purchasePriceCopper: 1,
          salePriceCopper: null,
          recipe: {
            outputQuantity: 2,
            profession: 'tailoring',
            reagents: [{ itemId: 'dust', quantity: 1, acquisition: 'buy' }],
          },
        },
        bag: {
          id: 'bag',
          name: 'Шерстяная сумка',
          iconUrl: '',
          sections: ['crafts'],
          purchasePriceCopper: null,
          salePriceCopper: 200,
          recipe: {
            outputQuantity: 1,
            profession: 'tailoring',
            reagents: [{ itemId: 'thread', quantity, acquisition }],
          },
        },
      }
      useCraftStore.setState({ items: catalog, ownedProfessions: ['tailoring'] })
      render(<ItemsPage section="crafts" />)

      await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))

      const profit = screen.getByText('Выгода').parentElement
      if (profit === null) {
        throw new Error('Не найдена выгода реагента')
      }
      expect(profit.querySelector('dd > .money-display')).toHaveTextContent(unitText)
      if (totalText === null) {
        expect(within(profit).queryByRole('tooltip')).not.toBeInTheDocument()
      } else {
        const tooltip = within(profit).getByRole('tooltip')
        expect(tooltip).toHaveTextContent(
          `Суммарно за ${String(quantity)} шт.: ${totalText}`,
        )
      }
    },
  )
})
