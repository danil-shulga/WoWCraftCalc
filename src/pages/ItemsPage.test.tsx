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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['crafts', 'reagents'] as const)(
    'открывает импорт по умолчанию и сохраняет ручной предмет в разделе %s',
    async (section) => {
      const user = userEvent.setup()
      const addLabel = section === 'crafts' ? 'Добавить крафт' : 'Добавить реагент'
      render(<ItemsPage section={section} />)
      expect(
        screen.queryByRole('button', { name: 'Импорт из Wowhead' }),
      ).not.toBeInTheDocument()
      const opener = screen.getByRole('button', { name: `+ ${addLabel}` })
      await user.click(opener)
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      expect(
        screen.getByLabelText('Ссылка на рецепт Wowhead Classic, TBC или Forever'),
      ).toBeVisible()
      const before = useCraftStore.getState().items
      await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
      expect(screen.getByRole('checkbox', { name: 'Крафты' })).toHaveProperty(
        'checked',
        section === 'crafts',
      )
      expect(screen.getByRole('checkbox', { name: 'Реагенты' })).toHaveProperty(
        'checked',
        section === 'reagents',
      )
      await user.type(screen.getByLabelText('Название'), 'Новый предмет')
      expect(useCraftStore.getState().items).toBe(before)
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
      expect(screen.getByText('Новый предмет')).toBeVisible()
      expect(Object.values(useCraftStore.getState().items)).toContainEqual(
        expect.objectContaining({ name: 'Новый предмет', sections: [section] }),
      )
    },
  )

  it.each(['crafts', 'reagents'] as const)(
    'открывает общую модалку из пустого раздела %s и отменяет без записи',
    async (section) => {
      useCraftStore.setState({ items: {} })
      const before = useCraftStore.getState()
      const user = userEvent.setup()
      render(<ItemsPage section={section} />)
      const addLabel = section === 'crafts' ? 'Добавить крафт' : 'Добавить реагент'
      const opener = screen.getByRole('button', { name: addLabel })
      await user.click(opener)
      expect(
        screen.getByLabelText('Ссылка на рецепт Wowhead Classic, TBC или Forever'),
      ).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
      await user.type(screen.getByLabelText('Название'), 'Черновик')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
      expect(useCraftStore.getState()).toBe(before)
    },
  )

  it('отменяет черновики без изменения каталога и сохраняет неизменённые цены без записи', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    const before = useCraftStore.getState()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    const group = screen.getByRole('group', { name: 'Цена продажи: Лечебное зелье' })
    await user.click(within(group).getByRole('checkbox', { name: 'Указать цену' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(useCraftStore.getState()).toBe(before)

    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    expect(
      within(
        screen.getByRole('group', { name: 'Цена продажи: Лечебное зелье' }),
      ).getByRole('checkbox', { name: 'Указать цену' }),
    ).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Сохранить все' }))
    expect(useCraftStore.getState()).toBe(before)
    expect(setItem).not.toHaveBeenCalled()
  })

  it.each(['crafts', 'reagents'] as const)(
    'сохраняет черновики цен раздела %s одной записью, различая null и ноль',
    async (section) => {
      const user = userEvent.setup()
      const field = section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
      const catalog = Object.fromEntries(
        Object.entries(items).map(([id, item]) => [
          id,
          { ...item, sections: [section], purchasePriceCopper: 300 },
        ]),
      )
      useCraftStore.setState({ items: catalog })
      const before = useCraftStore.getState().items
      render(<ItemsPage section={section} />)
      const setItem = vi.spyOn(Storage.prototype, 'setItem')

      await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
      const groups = screen.getAllByRole('group', { name: /^Цена / })
      const first = groups[0]
      const second = groups[1]
      if (first === undefined || second === undefined) {
        throw new Error('Не найдены поля двух цен')
      }
      await user.click(within(first).getByRole('checkbox', { name: 'Указать цену' }))
      await user.click(within(second).getByRole('checkbox', { name: 'Указать цену' }))
      await user.click(within(second).getByRole('checkbox', { name: 'Указать цену' }))
      expect(useCraftStore.getState().items).toBe(before)
      expect(setItem).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Сохранить все' }))

      expect(useCraftStore.getState().items.potion).toEqual({
        ...before.potion,
        [field]: null,
      })
      expect(useCraftStore.getState().items.bag).toEqual({
        ...before.bag,
        [field]: 0,
      })
      expect(
        setItem.mock.calls.filter(([key]) => key === 'craft-calc-data'),
      ).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Редактировать цены' })).toBeVisible()
    },
  )

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
