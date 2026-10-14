import { setTestCraftState } from '../test/craft-state'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { AcquisitionMethod, ItemCatalog } from '../domain/item.types'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

const items: ItemCatalog = {
  potion: {
    id: 'potion',
    name: 'Лечебное зелье',
    names: { ru: 'Лечебное зелье', en: 'Healing Potion' },
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 100,
    recipe: null,
  },
  bag: {
    id: 'bag',
    name: 'Шерстяная сумка',
    names: { ru: 'Шерстяная сумка', en: 'Wool Bag' },
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 200,
    recipe: null,
  },
}

describe('ItemsPage', () => {
  it('переключает звёздочку и запрашивает подтверждение только при удалении из избранного', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    const label = 'Лечебное зелье'
    const star = screen.getByRole('button', { name: `Добавить в избранное: ${label}` })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await user.click(star)
    expect(star).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(star)
    const dialog = screen.getByRole('dialog', { name: 'Удалить из избранного?' })
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(star).toHaveFocus()
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Удалить из избранного' }))
    expect(star).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(label)).toBeVisible()
  })

  it('показывает только избранные предметы и убирает их после подтверждения', async () => {
    const user = userEvent.setup()
    useCraftStore.getState().setItemFavorite('potion', true)
    render(<ItemsPage section="favorites" />)
    expect(screen.getByRole('heading', { name: 'Избранное' })).toBeVisible()
    expect(screen.queryByText('Шерстяная сумка')).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox'), 'HEALING')
    expect(screen.getByText('Лечебное зелье')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Удалить из избранного: Лечебное зелье' }),
    )
    await user.click(screen.getByRole('button', { name: 'Удалить из избранного' }))
    expect(screen.getByText('Здесь пока ничего нет')).toBeVisible()
    const state = useCraftStore.getState()
    expect(state.workspaces[state.activeVersion].items.potion).toBeDefined()
  })

  it('даёт добавлять вложенный реагент в избранное без сворачивания дерева', async () => {
    const user = userEvent.setup()
    const potion = items.potion
    const bag = items.bag
    if (!potion || !bag) throw new Error('Нет тестовых предметов')
    setTestCraftState({
      items: {
        potion: {
          ...potion,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'bag', quantity: 1, acquisition: 'buy' }],
          },
        },
        bag: { ...bag, sections: ['reagents'] },
      },
    })
    render(<ItemsPage section="crafts" />)
    await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))
    await user.click(
      screen.getByRole('button', { name: 'Добавить в избранное: Шерстяная сумка' }),
    )
    expect(
      screen.getByRole('button', { name: 'Удалить из избранного: Шерстяная сумка' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Свернуть рецепт' })).toBeVisible()
  })

  it.each(['crafts', 'reagents'] as const)(
    'показывает покупку в корневой строке только для раздела реагентов: %s',
    (section) => {
      setTestCraftState({
        items: Object.fromEntries(
          Object.entries(items).map(([id, item]) => [
            id,
            { ...item, sections: [section] },
          ]),
        ),
      })
      render(<ItemsPage section={section} />)
      const row = screen.getByText('Лечебное зелье').closest('article')
      if (!row) throw new Error('Нет корневой строки')
      expect(within(row).queryByText('Покупка') !== null).toBe(section === 'reagents')
      expect(within(row).getByText('Крафт')).toBeVisible()
      expect(within(row).getByText('Продажа')).toBeVisible()
    },
  )

  it.each(['crafts', 'reagents'] as const)(
    'ищет оба названия в разделе %s при любом языке отображения',
    async (section) => {
      const user = userEvent.setup()
      setTestCraftState({
        items: Object.fromEntries(
          Object.entries(items).map(([id, item]) => [
            id,
            { ...item, sections: [section] },
          ]),
        ),
      })
      render(<ItemsPage section={section} />)
      const search = screen.getByRole('searchbox')
      await user.type(search, 'HEALING')
      expect(screen.getByText('Лечебное зелье')).toBeVisible()
      expect(screen.queryByText('Шерстяная сумка')).not.toBeInTheDocument()
      act(() => {
        useCraftStore.getState().setItemLanguage('en')
      })
      expect(search).toHaveValue('HEALING')
      expect(screen.getByText('Healing Potion')).toBeVisible()
      await user.clear(search)
      await user.type(search, 'ЛЕЧЕБНОЕ')
      expect(screen.getByText('Healing Potion')).toBeVisible()
    },
  )

  it('меняет язык раскрытого дерева без потери раскрытия и показывает доступное имя без перевода', async () => {
    const user = userEvent.setup()
    const potion = items.potion
    const bag = items.bag
    if (potion === undefined || bag === undefined)
      throw new Error('Нет тестовых предметов')
    setTestCraftState({
      items: {
        potion: {
          ...potion,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'bag', quantity: 2, acquisition: 'buy' }],
          },
        },
        bag: { ...bag, sections: ['reagents'], names: { ru: null, en: 'Wool Bag' } },
      },
    })
    render(<ItemsPage section="crafts" />)
    await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))
    expect(screen.getByText('Wool Bag')).toBeVisible()
    act(() => {
      useCraftStore.getState().setItemLanguage('en')
    })
    expect(screen.getByText('Healing Potion')).toBeVisible()
    expect(screen.getByText('Wool Bag')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Свернуть рецепт' })).toBeVisible()
  })

  beforeEach(() => {
    setTestCraftState({ items, itemLanguage: 'ru' })
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
      expect(screen.getByText('База Forever')).toBeVisible()
      const before =
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
      await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
      expect(screen.getByRole('checkbox', { name: 'Крафты' })).toHaveProperty(
        'checked',
        section === 'crafts',
      )
      expect(screen.getByRole('checkbox', { name: 'Реагенты' })).toHaveProperty(
        'checked',
        section === 'reagents',
      )
      await user.type(screen.getByLabelText('Название RU'), 'Новый предмет')
      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ).toBe(before)
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
      expect(screen.getByText('Новый предмет')).toBeVisible()
      expect(
        Object.values(
          useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion]
            .items,
        ),
      ).toContainEqual(
        expect.objectContaining({ name: 'Новый предмет', sections: [section] }),
      )
    },
  )

  it.each(['crafts', 'reagents'] as const)(
    'открывает общую модалку из пустого раздела %s и отменяет без записи',
    async (section) => {
      setTestCraftState({ items: {} })
      const before = useCraftStore.getState()
      const user = userEvent.setup()
      render(<ItemsPage section={section} />)
      const addLabel = section === 'crafts' ? 'Добавить крафт' : 'Добавить реагент'
      const opener = screen.getByRole('button', { name: addLabel })
      await user.click(opener)
      expect(screen.getByText('База Forever')).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
      await user.type(screen.getByLabelText('Название RU'), 'Черновик')
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
    const copper = within(group).getByRole('spinbutton', { name: /медь$/ })
    await user.clear(copper)
    await user.type(copper, '50')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(useCraftStore.getState()).toBe(before)

    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    expect(
      within(
        screen.getByRole('group', { name: 'Цена продажи: Лечебное зелье' }),
      ).getByRole('spinbutton', { name: /серебро$/ }),
    ).toHaveValue(1)
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
          {
            ...item,
            sections: [section],
            purchasePriceCopper: 300,
            ...(id === 'potion' ? { [field]: null } : {}),
          },
        ]),
      )
      setTestCraftState({ items: catalog })
      const before =
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
      render(<ItemsPage section={section} />)
      const setItem = vi.spyOn(Storage.prototype, 'setItem')

      await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
      const groups = screen.getAllByRole('group', { name: /^Цена / })
      const first = groups[0]
      const second = groups[1]
      if (first === undefined || second === undefined) {
        throw new Error('Не найдены поля двух цен')
      }
      expect(
        screen.queryByRole('checkbox', { name: 'Указать цену' }),
      ).not.toBeInTheDocument()
      for (const input of within(first).getAllByRole('spinbutton')) {
        expect(input).toBeEnabled()
      }
      for (const input of within(second).getAllByRole('spinbutton')) {
        await user.clear(input)
        await user.type(input, '0')
      }
      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ).toBe(before)
      expect(setItem).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Сохранить все' }))

      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
          .potion,
      ).toEqual({
        ...before.potion,
        [field]: null,
      })
      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
          .bag,
      ).toEqual({
        ...before.bag,
        [field]: 0,
      })
      expect(
        setItem.mock.calls.filter(([key]) => key === 'craft-calc-versioned-data'),
      ).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Редактировать цены' })).toBeVisible()
    },
  )

  it.each(['crafts', 'reagents'] as const)(
    'вводит ранее неизвестную цену без разблокировки в разделе %s',
    async (section) => {
      const user = userEvent.setup()
      const field = section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
      const potion = items.potion
      if (potion === undefined) throw new Error('Нет тестового предмета')
      setTestCraftState({
        items: { potion: { ...potion, sections: [section], [field]: null } },
      })
      render(<ItemsPage section={section} />)
      await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
      const group = screen.getByRole('group', { name: /^Цена / })
      expect(within(group).queryByRole('checkbox')).not.toBeInTheDocument()
      const gold = within(group).getByRole('spinbutton', { name: /золото$/ })
      expect(gold).toBeEnabled()
      await user.type(gold, '2')
      expect(useCraftStore.getState().workspaces.forever.items.potion?.[field]).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Сохранить все' }))
      expect(useCraftStore.getState().workspaces.forever.items.potion?.[field]).toBe(
        20000,
      )
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
      setTestCraftState({ items: catalog, ownedProfessions: ['tailoring'] })
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
