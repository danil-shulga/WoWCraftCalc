import { testCraftData, setTestCraftState } from '../../test/craft-state'
import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import type { Item } from '../../domain/item.types'

import { buildReferenceDatabaseIndex } from '../../domain/reference-database-index'
import { parseReferenceDatabase } from '../../domain/reference-database.schema'
import { ItemsPage } from '../../pages/ItemsPage'
import { useCraftStore } from '../../store/useCraftStore'
import { referenceFixture } from '../../test/reference-fixture'
import * as loader from './reference-database-loader'
import { ReferenceDatabaseForm } from './ReferenceDatabaseForm'

function renderForm(props: Partial<ComponentProps<typeof ReferenceDatabaseForm>> = {}) {
  const callbacks = {
    onImport: vi.fn(useCraftStore.getState().importRecipe),
    onAddItem: vi.fn(useCraftStore.getState().addReferenceItem),
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }
  const rendered = render(
    <ReferenceDatabaseForm
      catalog={
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items
      }
      section="crafts"
      itemLanguage="ru"
      isActive
      {...callbacks}
      {...props}
    />,
  )
  return { ...rendered, ...callbacks }
}

describe('вкладка базы', () => {
  it('прокручивает окно до нижней границы за 150 мс без повторения при изменении выхода', async () => {
    const frames: FrameRequestCallback[] = []
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback)
        return frames.length
      })
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const user = userEvent.setup()
    const { container, unmount } = renderForm()
    container.setAttribute('role', 'dialog')
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 500 },
    })
    container.scrollTop = 100
    await screen.findByRole('searchbox')
    expect(requestFrame).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Венец Грёз/ }))
    expect(container.scrollTop).toBe(100)
    frames.shift()?.(1075)
    expect(container.scrollTop).toBeGreaterThan(100)
    expect(container.scrollTop).toBeLessThan(700)
    frames.shift()?.(1150)
    expect(container.scrollTop).toBe(700)
    expect(frames).toHaveLength(0)
    requestFrame.mockClear()
    await user.click(screen.getByRole('button', { name: 'Увеличить значение' }))
    expect(requestFrame).not.toHaveBeenCalled()
    unmount()
  })

  beforeEach(() => {
    useCraftStore
      .getState()
      .replaceData(
        testCraftData({ items: {}, ownedProfessions: [], currencyDisplay: 'icons' }),
      )
    vi.spyOn(loader, 'loadReferenceDatabase').mockResolvedValue(
      buildReferenceDatabaseIndex(parseReferenceDatabase(referenceFixture())),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['source', 'name'] as const)(
    'открывает рецепт известного предмета по %s без поиска, фильтра и пагинации',
    async (match) => {
      const user = userEvent.setup()
      const targetItem: Item = {
        id: 'existing',
        name: match === 'source' ? 'Мой венец' : 'Dream Crown',
        iconUrl: '',
        sections: ['crafts'],
        purchasePriceCopper: null,
        salePriceCopper: null,
        recipe: null,
        ...(match === 'source' ? { source: { wowheadItemId: 1 } } : {}),
      }
      const { onImport } = renderForm({ targetItem })
      const preview = await screen.findByRole('region', { name: 'Предпросмотр из базы' })
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('combobox', { name: 'Профессия' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('group', { name: 'Результаты поиска в базе' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Далее' })).not.toBeInTheDocument()
      expect(screen.queryByText(/Найдено:/)).not.toBeInTheDocument()
      expect(
        screen.queryByText(/Проверьте рецепт перед сохранением/),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Рецепт' })).toHaveValue(
        'Портняжное дело (Tailoring)',
      )
      expect(screen.getByRole('combobox', { name: 'Рецепт' })).toBeDisabled()
      await user.click(screen.getByRole('combobox', { name: 'Рецепт' }))
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(
        within(preview).getByRole('list', { name: 'Состав рецепта' }),
      ).toHaveTextContent('Ткань')
      fireEvent.change(within(preview).getByLabelText('Предметов за один крафт'), {
        target: { value: '3' },
      })
      await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({ outputQuantity: 3, profession: 'tailoring' }),
      )
    },
  )

  it.each([null, 5])(
    'импортирует выход %s из рецепта с запасным значением 1',
    async (quantity) => {
      const fixture = referenceFixture()
      const database = parseReferenceDatabase({
        ...fixture,
        recipes: {
          '10': {
            ...fixture.recipes['10'],
            output: { ...fixture.recipes['10'].output, quantity },
          },
        },
      })
      vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
        buildReferenceDatabaseIndex(database),
      )
      const user = userEvent.setup()
      const { onImport } = renderForm()
      await user.click(await screen.findByRole('button', { name: /Венец Грёз/ }))
      const expectedOutput = quantity ?? 1
      const input = screen.getByLabelText('Предметов за один крафт')
      expect(input).toHaveValue(expectedOutput)
      expect(
        screen.queryByText(
          /NPC-цены|Выход неизвестен|Неподтверждённый кандидат|Наличие рецепта в базе/,
        ),
      ).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Увеличить значение' }))
      expect(input).toHaveValue(expectedOutput + 1)
      await user.click(screen.getByRole('button', { name: 'Уменьшить значение' }))
      expect(input).toHaveValue(expectedOutput)
      await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({ outputQuantity: expectedOutput }),
      )
    },
  )

  it('сохраняет поиск и выбор предмета, если редактируемый предмет не найден в базе', async () => {
    renderForm({
      targetItem: {
        id: 'unknown',
        name: 'Неизвестный предмет',
        iconUrl: '',
        sections: ['crafts'],
        purchasePriceCopper: null,
        salePriceCopper: null,
        recipe: null,
      },
    })
    expect(await screen.findByRole('searchbox')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Профессия' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Результаты поиска в базе' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Венец Грёз/ })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Далее' })).toBeVisible()
  })

  it('ищет RU/EN, фильтрует профессию и подтверждает отредактированный выход без лишних подписей', async () => {
    const user = userEvent.setup()
    const { onImport, onClose } = renderForm()
    const search = await screen.findByRole('searchbox')
    await user.type(search, 'DREAM')
    await user.click(screen.getByRole('button', { name: /Венец Грёз/ }))
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(1)
    expect(screen.getByRole('combobox', { name: 'Рецепт' })).toHaveValue(
      'Портняжное дело (Tailoring)',
    )
    expect(screen.queryByText(/Качество:|Привязка:|Рецепт #/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Предположение из базы|Подтвердите фиксированное|Кандидат/),
    ).not.toBeInTheDocument()
    const preview = within(screen.getByRole('region', { name: 'Предпросмотр из базы' }))
    expect(preview.queryByText('Портняжное дело (Tailoring)')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Инструменты' })).not.toBeInTheDocument()
    expect(screen.queryByText(/инструмент/i)).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Состав рецепта' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1)
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).toEqual({})
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '2.5' },
    })
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(screen.getByRole('alert')).toHaveTextContent('положительное целое')
    expect(onImport).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '7' },
    })
    await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
    await user.click(screen.getByRole('option', { name: 'Алхимия (Alchemy)' }))
    expect(screen.getByText('Ничего не найдено')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ outputQuantity: 7, profession: 'tailoring' }),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('выбирает первый рецепт по умолчанию и позволяет сменить альтернативу', async () => {
    const fixture = referenceFixture()
    fixture.items['1'].recipeSpellIds.push(11)
    const db = parseReferenceDatabase({
      ...fixture,
      recipes: {
        ...fixture.recipes,
        '11': {
          ...fixture.recipes['10'],
          spellId: 11,
          output: {
            ...fixture.recipes['10'].output,
            baseQuantityCandidate: null,
            variance: 2,
          },
        },
      },
    })
    vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
      buildReferenceDatabaseIndex(db),
    )
    const user = userEvent.setup()
    renderForm()
    await user.click(await screen.findByRole('button', { name: /Венец Грёз/ }))
    expect(screen.getByRole('button', { name: 'Подтвердить импорт' })).toBeVisible()
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(1)
    expect(screen.getByRole('combobox', { name: 'Рецепт' })).toBeEnabled()
    await user.click(screen.getByRole('combobox', { name: 'Рецепт' }))
    const options = screen.getAllByRole('option', { name: 'Портняжное дело (Tailoring)' })
    expect(options).toHaveLength(2)
    const alternative = options[1]
    if (!alternative) throw new Error('Нет альтернативного рецепта')
    await user.click(alternative)
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(1)
    expect(screen.queryByText(/По умолчанию|Переменный выход/)).not.toBeInTheDocument()
  })

  it('предпочитает рецепт выбранной профессии среди альтернатив', async () => {
    const fixture = referenceFixture()
    fixture.items['1'].recipeSpellIds.push(11)
    const db = parseReferenceDatabase({
      ...fixture,
      professions: {
        ...fixture.professions,
        '171': { id: 'alchemy', skillLineId: 171, nameRu: 'Алхимия' },
      },
      recipes: {
        ...fixture.recipes,
        '11': {
          ...fixture.recipes['10'],
          spellId: 11,
          profession: 'alchemy',
          skillLineId: 171,
          output: { ...fixture.recipes['10'].output, quantity: 5 },
        },
      },
    })
    vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
      buildReferenceDatabaseIndex(db),
    )
    const user = userEvent.setup()
    const { onImport } = renderForm()
    await user.click(await screen.findByRole('combobox', { name: 'Профессия' }))
    await user.click(screen.getByRole('option', { name: 'Алхимия (Alchemy)' }))
    await user.click(screen.getByRole('button', { name: /Венец Грёз/ }))
    expect(screen.getByRole('combobox', { name: 'Рецепт' })).toHaveValue(
      'Алхимия (Alchemy)',
    )
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(5)
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ outputQuantity: 5, profession: 'alchemy' }),
    )
  })

  it('добавляет реагент без рецепта и не предлагает результаты крафтов в этом разделе', async () => {
    const user = userEvent.setup()
    const { onAddItem, onImport } = renderForm({ section: 'reagents' })
    await user.click(await screen.findByRole('button', { name: /Ткань/ }))
    expect(screen.queryByRole('button', { name: /Венец/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))
    expect(onAddItem).toHaveBeenCalledOnce()
    expect(onImport).not.toHaveBeenCalled()
    expect(
      Object.values(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      )[0],
    ).toMatchObject({
      sections: ['reagents'],
      recipe: null,
      purchasePriceCopper: null,
    })
  })

  it('выбирает рецепт изготавливаемого реагента по умолчанию и позволяет добавить без рецепта', async () => {
    const fixture = referenceFixture()
    const db = parseReferenceDatabase({
      ...fixture,
      items: {
        ...fixture.items,
        '3': {
          ...fixture.items['1'],
          itemId: 3,
          names: { ru: 'Другой крафт', en: null },
          recipeSpellIds: [11],
        },
      },
      recipes: {
        ...fixture.recipes,
        '11': {
          ...fixture.recipes['10'],
          spellId: 11,
          productItemId: 3,
          reagents: [{ itemId: 1, quantity: 1 }],
        },
      },
    })
    vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
      buildReferenceDatabaseIndex(db),
    )
    const user = userEvent.setup()
    const { onAddItem } = renderForm({ section: 'reagents' })
    await user.click(await screen.findByRole('button', { name: /Венец Грёз/ }))
    expect(screen.getByRole('combobox', { name: 'Рецепт' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Подтвердить импорт' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Рецепт' })).toHaveValue(
      'Портняжное дело (Tailoring)',
    )
    await user.click(screen.getByRole('combobox', { name: 'Рецепт' }))
    await user.click(
      screen.getByRole('option', { name: 'Только реагент, без импорта рецепта' }),
    )
    expect(screen.getByRole('button', { name: 'Добавить реагент' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Добавить реагент' }))
    expect(onAddItem).toHaveBeenCalledOnce()
    expect(
      Object.values(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      )[0],
    ).toMatchObject({
      sections: ['reagents'],
      recipe: null,
    })
    await user.click(screen.getByRole('combobox', { name: 'Рецепт' }))
    await user.click(screen.getByRole('option', { name: 'Портняжное дело (Tailoring)' }))
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '3' },
    })
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(
      Object.values(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ).find((item) => item.source?.wowheadItemId === 1),
    ).toMatchObject({ sections: ['reagents', 'crafts'], recipe: { outputQuantity: 3 } })
  })

  it('разрешает повтор загрузки после ошибки и не загружает неактивную вкладку', async () => {
    const user = userEvent.setup()
    vi.mocked(loader.loadReferenceDatabase).mockRejectedValueOnce(
      new Error('Сеть недоступна'),
    )
    const rendered = renderForm({ isActive: false })
    expect(loader.loadReferenceDatabase).not.toHaveBeenCalled()
    rendered.rerender(
      <ReferenceDatabaseForm
        catalog={{}}
        section="crafts"
        itemLanguage="ru"
        isActive
        onImport={rendered.onImport}
        onAddItem={rendered.onAddItem}
        onSuccess={rendered.onSuccess}
        onClose={rendered.onClose}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна')
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    expect(await screen.findByRole('searchbox')).toBeVisible()
  })

  it('закрытие одного потребителя не мешает второму получить общий запрос', async () => {
    let resolve: (index: ReturnType<typeof buildReferenceDatabaseIndex>) => void = () => {
      throw new Error('Нет запроса')
    }
    const promise = new Promise<ReturnType<typeof buildReferenceDatabaseIndex>>(
      (callback) => {
        resolve = callback
      },
    )
    vi.mocked(loader.loadReferenceDatabase).mockReturnValue(promise)
    const first = renderForm()
    first.unmount()
    const second = renderForm()
    await act(async () => {
      resolve(buildReferenceDatabaseIndex(parseReferenceDatabase(referenceFixture())))
      await promise
    })
    expect(screen.getByRole('searchbox')).toBeVisible()
    expect(first.onImport).not.toHaveBeenCalled()
    expect(second.onImport).not.toHaveBeenCalled()
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).toEqual({})
  })

  it('сохраняет предпросмотр при ошибке графа и заменяет сломанную картинку заглушкой', async () => {
    const fixture = referenceFixture()
    fixture.items['1'].iconUrl =
      'https://wow.zamimg.com/images/wow/icons/large/broken.jpg'
    vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
      buildReferenceDatabaseIndex(parseReferenceDatabase(fixture)),
    )
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderForm({
      onImport: () => ({ success: false, error: 'Циклическая зависимость' }),
      onClose,
    })
    await user.click(await screen.findByRole('button', { name: /Венец Грёз/ }))
    const icon = within(
      screen.getByRole('region', { name: 'Предпросмотр из базы' }),
    ).getByTitle('Иконка: Венец Грёз')
    expect(icon).toHaveAttribute('loading', 'lazy')
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '3' },
    })
    fireEvent.error(icon)
    expect(icon.getAttribute('src')).toMatch(/item-placeholder.svg$/)
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Циклическая')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ограничивает выдачу страницами по 50 и сбрасывает страницу при поиске', async () => {
    const db = parseReferenceDatabase(
      JSON.parse(
        readFileSync('public/data/forever/craftcalc-db.1.60.1.70338.json', 'utf8'),
      ) as unknown,
    )
    vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
      buildReferenceDatabaseIndex(db),
    )
    const user = userEvent.setup()
    renderForm()
    const group = await screen.findByRole('group', { name: 'Результаты поиска в базе' })
    expect(within(group).getAllByRole('button')).toHaveLength(50)
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(screen.getByRole('status')).toHaveTextContent('Страница 2')
    await user.type(screen.getByRole('searchbox'), 'Dreamweave Circlet')
    expect(within(group).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Страница 1')
  })

  it('проводит сценарий реальной базы: импорт, цены, повтор и восстановление', async () => {
    const db = parseReferenceDatabase(
      JSON.parse(
        readFileSync('public/data/forever/craftcalc-db.1.60.1.70338.json', 'utf8'),
      ) as unknown,
    )
    vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
      buildReferenceDatabaseIndex(db),
    )
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    const opener = screen.getByRole('button', { name: '+ Добавить крафт' })
    const choose = async () => {
      await user.click(opener)
      await user.type(
        await screen.findByRole('searchbox', { name: 'Поиск по названию предмета' }),
        'Венец из ткани Грёз',
      )
      await user.click(screen.getByRole('button', { name: /Венец из ткани Грез/ }))
    }
    await choose()
    fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
      target: { value: '1' },
    })
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    const item = Object.values(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).find((entry) => entry.source?.wowheadItemId === 10041)
    if (!item) throw new Error('Нет венца')
    expect(item.recipe?.reagents).toHaveLength(6)
    act(() => {
      useCraftStore.getState().setItemPrice(item.id, 'purchasePriceCopper', 0)
      useCraftStore.getState().setItemPrice(item.id, 'salePriceCopper', 999)
    })
    await user.click(opener)
    const dialog = screen.getByRole('dialog')
    await user.type(await within(dialog).findByRole('searchbox'), 'Dreamweave Circlet')
    await user.click(within(dialog).getByRole('button', { name: /Венец из ткани Грез/ }))
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(
      item.recipe?.outputQuantity,
    )
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items[
        item.id
      ],
    ).toMatchObject({
      purchasePriceCopper: 0,
      salePriceCopper: 999,
    })
    const saved = localStorage.getItem('craft-calc-versioned-data')
    expect(saved).not.toContain('craftcalc-reference-database')
    act(() => {
      setTestCraftState({ items: {} })
    })
    localStorage.setItem('craft-calc-versioned-data', saved ?? '')
    await act(async () => {
      await useCraftStore.persist.rehydrate()
    })
    expect(screen.getByText('Венец из ткани Грез')).toBeVisible()
    expect(
      Object.keys(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ),
    ).toHaveLength(7)
  })
})
