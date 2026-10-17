import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Item, Recipe } from '../../domain/item.types'
import { buildReferenceDatabaseIndex } from '../../domain/reference-database-index'
import { parseReferenceDatabase } from '../../domain/reference-database.schema'
import { ItemsPage } from '../../pages/ItemsPage'
import { selectActiveItems } from '../../store/craft.selectors'
import { useCraftStore } from '../../store/useCraftStore'
import { setTestCraftState } from '../../test/craft-state'
import { referenceFixture } from '../../test/reference-fixture'
import * as loader from '../reference-database/reference-database-loader'
import tbcTooltip from '../wowhead-import/fixtures/tbc-44391.json'
import tbcEn from '../wowhead-import/fixtures/tbc-44391-en.json'

const product: Item = {
  id: 'product',
  name: 'Мой крафт',
  names: { ru: 'Мой крафт', en: 'My craft' },
  iconUrl: 'https://example.com/custom.jpg',
  sections: ['crafts'],
  purchasePriceCopper: 0,
  salePriceCopper: 100,
  recipe: null,
}
const reagent: Item = {
  ...product,
  id: 'cloth',
  name: 'Ткань',
  names: { ru: 'Ткань', en: 'Cloth' },
  sections: ['reagents'],
  source: { wowheadItemId: 2 },
  purchasePriceCopper: 42,
}
const recipe: Recipe = {
  outputQuantity: 2,
  profession: 'tailoring',
  reagents: [{ itemId: 'cloth', quantity: 1, acquisition: 'buy' }],
}
const catalog = () => selectActiveItems(useCraftStore.getState())
const urlLabel = 'Ссылка на рецепт Wowhead Classic, TBC или Forever'

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  render(<ItemsPage section="crafts" />)
  const opener = screen.getByRole('button', { name: 'Редактировать Мой крафт' })
  await user.click(opener)
  return opener
}

describe('объединённый редактор', () => {
  it.each(['34113', ''])(
    'сохраняет изменение игрового ID на «%s» вместе с рецептом',
    async (id) => {
      const source = { wowheadItemId: 99, wowheadVersion: 'forever' as const }
      setTestCraftState({
        items: { product: { ...product, source, recipe }, cloth: reagent },
      })
      const user = userEvent.setup()
      await openEditor(user)
      expect(screen.getByRole('group', { name: 'Название' })).toContainElement(
        screen.getByPlaceholderText('Название RU'),
      )
      const input = screen.getByLabelText('ID предмета')
      expect(input).toHaveValue('99')
      await user.clear(input)
      if (id) await user.type(input, id)
      expect(catalog().product?.source).toEqual(source)
      await user.click(screen.getByRole('button', { name: 'Рецепт' }))
      await user.click(screen.getByRole('button', { name: 'Описание' }))
      expect(input).toHaveValue(id)
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(catalog().product?.source).toEqual(
        id ? { ...source, wowheadItemId: Number(id) } : undefined,
      )
      expect(catalog().product?.id).toBe('product')
      expect(catalog().product?.recipe).toEqual(recipe)
    },
  )

  it('отмена игрового ID сохраняет каталог без изменений', async () => {
    const user = userEvent.setup()
    const before = useCraftStore.getState()
    await openEditor(user)
    await user.type(screen.getByLabelText('ID предмета'), '34113')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(useCraftStore.getState()).toBe(before)
  })

  beforeEach(() => {
    useCraftStore.getState().setActiveVersion('forever')
    setTestCraftState({ items: { product, cloth: reagent }, itemLanguage: 'ru' })
    vi.spyOn(loader, 'loadReferenceDatabase').mockImplementation((version = 'forever') =>
      Promise.resolve(
        buildReferenceDatabaseIndex(parseReferenceDatabase(referenceFixture(version))),
      ),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('показывает одну кнопку редактирования у корня и вложенного реагента', async () => {
    setTestCraftState({ items: { product: { ...product, recipe }, cloth: reagent } })
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    expect(screen.queryByTitle('Редактировать рецепт')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))
    await user.click(screen.getByRole('button', { name: 'Редактировать Ткань' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Описание' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    expect(screen.getByRole('button', { name: 'Из базы' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Wowhead по ссылке' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Вручную' })).toBeVisible()
  })

  it('сохраняет черновики вкладок и отменяет все изменения с возвратом фокуса', async () => {
    setTestCraftState({ items: { product: { ...product, recipe }, cloth: reagent } })
    const user = userEvent.setup()
    const before = useCraftStore.getState()
    const opener = await openEditor(user)
    await user.type(screen.getByLabelText('Название RU'), ' изменён')
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '7' },
    })
    await user.click(screen.getByRole('button', { name: 'Wowhead по ссылке' }))
    await user.type(
      screen.getByLabelText(urlLabel),
      'https://wowhead.com/forever/ru/spell=1',
    )
    await user.click(screen.getByRole('button', { name: 'Описание' }))
    expect(screen.getByLabelText('Название RU')).toHaveValue('Мой крафт изменён')
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    expect(screen.getByLabelText(urlLabel)).toHaveValue(
      'https://wowhead.com/forever/ru/spell=1',
    )
    await user.click(screen.getByRole('button', { name: 'Вручную' }))
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(7)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(useCraftStore.getState()).toBe(before)
  })

  it.each(['description', 'recipe'])(
    'сохраняет обе вкладки из %s одним обновлением',
    async (saveFrom) => {
      setTestCraftState({ items: { product: { ...product, recipe }, cloth: reagent } })
      const user = userEvent.setup()
      await openEditor(user)
      await user.type(screen.getByLabelText('Название RU'), ' изменён')
      await user.clear(screen.getByLabelText(/URL иконки/))
      await user.type(screen.getByLabelText(/URL иконки/), 'inv_ingot_10')
      await user.click(screen.getByRole('checkbox', { name: 'Реагенты' }))
      await user.click(screen.getByRole('button', { name: 'Рецепт' }))
      fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
        target: { value: '7' },
      })
      if (saveFrom === 'description')
        await user.click(screen.getByRole('button', { name: 'Описание' }))
      const listener = vi.fn()
      const unsubscribe = useCraftStore.subscribe(listener)
      try {
        await user.click(
          screen.getByRole('button', {
            name: saveFrom === 'description' ? 'Сохранить' : 'Сохранить рецепт',
          }),
        )
        expect(listener).toHaveBeenCalledTimes(1)
      } finally {
        unsubscribe()
      }
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(catalog().product).toMatchObject({
        name: 'Мой крафт изменён',
        names: { ru: 'Мой крафт изменён', en: 'My craft' },
        iconUrl: 'https://wow.zamimg.com/images/wow/icons/large/inv_ingot_10.jpg',
        sections: ['crafts', 'reagents'],
        purchasePriceCopper: 0,
        recipe: { ...recipe, outputQuantity: 7 },
      })
    },
  )

  it('позволяет добавить рецепт вручную предмету без рецепта', async () => {
    const user = userEvent.setup()
    await openEditor(user)
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    await user.click(screen.getByRole('button', { name: 'Вручную' }))
    await user.click(screen.getByRole('combobox', { name: 'Поиск и выбор реагента' }))
    await user.click(screen.getByRole('option', { name: 'Ткань' }))
    await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить рецепт' }))
    expect(catalog().product?.recipe?.reagents).toEqual([
      { itemId: 'cloth', quantity: 1, acquisition: 'auto' },
    ])
  })

  it('удаляет рецепт и сохраняет изменения описания', async () => {
    setTestCraftState({ items: { product: { ...product, recipe }, cloth: reagent } })
    const user = userEvent.setup()
    await openEditor(user)
    await user.type(screen.getByLabelText('Название RU'), ' изменён')
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    await user.click(screen.getByRole('button', { name: 'Удалить рецепт' }))
    expect(catalog().product).toMatchObject({ name: 'Мой крафт изменён', recipe: null })
  })

  it('заполняет предпросмотр из базы и импортирует в ручной предмет без дубля', async () => {
    const user = userEvent.setup()
    await openEditor(user)
    await user.type(screen.getByLabelText('Название RU'), ' изменён')
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    await user.click(await screen.findByRole('button', { name: /Венец Грёз/ }))
    const preview = screen.getByRole('region', { name: 'Предпросмотр из базы' })
    expect(
      within(preview).getByRole('list', { name: 'Состав рецепта' }),
    ).toHaveTextContent('Ткань')
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '7' },
    })
    expect(catalog().product?.recipe).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(Object.keys(catalog())).toHaveLength(2)
    expect(catalog().product).toMatchObject({
      ...product,
      name: 'Мой крафт изменён',
      names: { ru: 'Мой крафт изменён', en: 'My craft' },
      source: { wowheadItemId: 1 },
      recipe: {
        outputQuantity: 7,
        profession: 'tailoring',
        reagents: [{ itemId: 'cloth', quantity: 3, acquisition: 'auto' }],
      },
    })
  })

  it('сразу выбирает предмет из базы по источнику и подставляет локальный выход', async () => {
    setTestCraftState({
      items: {
        product: { ...product, source: { wowheadItemId: 1 }, recipe },
        cloth: reagent,
      },
    })
    const user = userEvent.setup()
    await openEditor(user)
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    await user.click(screen.getByRole('button', { name: 'Из базы' }))
    const preview = await screen.findByRole('region', { name: 'Предпросмотр из базы' })
    expect(within(preview).getByLabelText('Предметов за один крафт')).toHaveValue(2)
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(catalog().product?.recipe?.reagents).toEqual([
      { itemId: 'cloth', quantity: 3, acquisition: 'buy' },
    ])
  })

  it('импортирует рецепт Wowhead в выбранный предмет и сохраняет обе вкладки', async () => {
    useCraftStore.getState().setActiveVersion('tbc')
    setTestCraftState({ items: { product, cloth: reagent } })
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return Promise.resolve(
        url.includes('/spell/')
          ? Response.json(url.includes('/ru/') ? tbcTooltip : tbcEn)
          : new Response(null, { status: 404 }),
      )
    })
    const user = userEvent.setup()
    await openEditor(user)
    await user.type(screen.getByLabelText('Название RU'), ' изменён')
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    await user.click(screen.getByRole('button', { name: 'Wowhead по ссылке' }))
    await user.type(
      screen.getByLabelText(urlLabel),
      'https://wowhead.com/tbc/ru/spell=44391',
    )
    await user.click(screen.getByRole('button', { name: 'Загрузить рецепт' }))
    await screen.findByRole('region', { name: 'Проверка рецепта' })
    await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
    await user.click(screen.getByRole('option', { name: 'Без профессии' }))
    await user.click(screen.getByRole('button', { name: 'Описание' }))
    expect(screen.getByLabelText('Название RU')).toHaveValue('Мой крафт изменён')
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(5)
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(catalog().product).toMatchObject({
      ...product,
      name: 'Мой крафт изменён',
      names: { ru: 'Мой крафт изменён', en: 'My craft' },
      source: { wowheadItemId: 34113, wowheadVersion: 'tbc' },
      recipe: { outputQuantity: 5, profession: null },
    })
    expect(
      Object.values(catalog()).filter((item) => item.source?.wowheadItemId === 34113),
    ).toHaveLength(1)
  })

  it('сообщает об отсутствии рецепта в базе для предмета с источником', async () => {
    setTestCraftState({
      items: { product: { ...product, source: { wowheadItemId: 2 } }, cloth: reagent },
    })
    const user = userEvent.setup()
    const before = useCraftStore.getState()
    await openEditor(user)
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    expect(await screen.findByText(/В базе нет рецепта для этого предмета/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Подтвердить импорт' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Вручную' }))
    expect(screen.getByRole('button', { name: 'Добавить реагент' })).toBeVisible()
    expect(useCraftStore.getState()).toBe(before)
  })

  it('не сохраняет импорт при ошибке описания и возвращает на его вкладку', async () => {
    const user = userEvent.setup()
    const before = useCraftStore.getState()
    await openEditor(user)
    await user.clear(screen.getByLabelText('Название RU'))
    await user.clear(screen.getByLabelText('Название EN'))
    await user.click(screen.getByRole('button', { name: 'Рецепт' }))
    await user.click(await screen.findByRole('button', { name: /Венец Грёз/ }))
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '7' },
    })
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите название предмета')
    expect(screen.getByLabelText('Название RU')).toBeVisible()
    expect(screen.getByLabelText('Название RU')).toHaveFocus()
    expect(useCraftStore.getState()).toBe(before)
  })
})
