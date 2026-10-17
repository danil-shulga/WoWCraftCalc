import { items } from '../test/items-page-fixture'
import { testCraftData, setTestCraftState } from '../test/craft-state'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

describe('ItemsPage: prices', () => {
  beforeEach(() => {
    useCraftStore.getState().replaceData(testCraftData({ items, itemLanguage: 'ru' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

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
})
