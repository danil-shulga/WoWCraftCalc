import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'

import type { ItemCatalog } from '../../domain/item.types'
import { useCraftStore } from '../../store/useCraftStore'
import { ItemsPage } from '../../pages/ItemsPage'
import classicTooltip from './fixtures/classic-25146.json'
import tbcTooltip from './fixtures/tbc-44391.json'
import { ItemAddModal } from '../item-editor/ItemAddModal'

function ImportHarness(
  props: Pick<ComponentProps<typeof ItemAddModal>, 'catalog' | 'onImport' | 'onClose'> &
    Partial<Pick<ComponentProps<typeof ItemAddModal>, 'onSuccess'>>,
) {
  return (
    <ItemAddModal
      title="Добавить крафт"
      defaultSection="crafts"
      onSave={vi.fn()}
      onSuccess={vi.fn()}
      {...props}
    />
  )
}

function mockTooltip(tooltip = tbcTooltip) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return Promise.resolve(
      url.includes('/spell/')
        ? Response.json(tooltip)
        : new Response(null, { status: 404 }),
    )
  })
}

async function loadRecipe(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText('Ссылка на рецепт Wowhead Classic, TBC или Forever'),
    'https://wowhead.com/tbc/ru/spell=44391',
  )
  await user.click(screen.getByRole('button', { name: 'Загрузить рецепт' }))
  await screen.findByRole('region', { name: 'Проверка рецепта' })
}

describe('проверка импорта Wowhead', () => {
  beforeEach(() => {
    localStorage.clear()
    useCraftStore
      .getState()
      .replaceData({ items: {}, ownedProfessions: [], currencyDisplay: 'icons' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('показывает иконку из Wowhead, сохранённую иконку и заглушку при недоступных данных', async () => {
    const iconUrl = 'https://wow.zamimg.com/images/wow/icons/large/inv_ingot_03.jpg'
    const savedIconUrl =
      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_gear_01.jpg'
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return Promise.resolve(
        url.includes('/spell/')
          ? Response.json(tbcTooltip)
          : url.endsWith('/item/23446')
            ? Response.json({
                name: 'Адамантитовый слиток',
                icon: 'inv_ingot_03',
                tooltip: '<p>Предмет</p>',
              })
            : new Response(null, { status: 404 }),
      )
    })
    const catalog: ItemCatalog = {
      gear: {
        id: 'gear',
        name: 'Шестерни',
        iconUrl: savedIconUrl,
        source: { wowheadItemId: 23783 },
        sections: ['reagents'],
        purchasePriceCopper: null,
        salePriceCopper: null,
        recipe: null,
      },
    }
    render(<ImportHarness catalog={catalog} onImport={vi.fn()} onClose={vi.fn()} />)
    await loadRecipe(userEvent.setup())
    const rows = within(screen.getByRole('region')).getAllByRole('listitem')
    const icons = rows.map((row) => row.querySelector('img'))
    expect(icons[0]).toHaveAttribute('src', iconUrl)
    expect(icons[1]).toHaveAttribute('src', savedIconUrl)
    expect(icons[2]?.getAttribute('src')).toMatch(/item-placeholder\.svg$/)
    if (icons[0]) fireEvent.error(icons[0])
    expect(icons[0]?.getAttribute('src')).toMatch(/item-placeholder\.svg$/)
  })

  it('показывает состав и выход; пишет в каталог только после выбора профессии и подтверждения', async () => {
    mockTooltip()
    const user = userEvent.setup()
    const onImport = vi.fn(useCraftStore.getState().importRecipe)
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    render(
      <ImportHarness
        catalog={{}}
        onImport={onImport}
        onSuccess={onSuccess}
        onClose={onClose}
      />,
    )
    await loadRecipe(user)

    expect(onImport).not.toHaveBeenCalled()
    expect(useCraftStore.getState().items).toEqual({})
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(5)
    expect(screen.queryByText(/Выход из Wowhead/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Профессия крафта не распознана/)).not.toBeInTheDocument()
    expect(screen.queryByText('Состав из Wowhead')).not.toBeInTheDocument()
    expect(screen.getByTitle(`Иконка: ${tbcTooltip.name}`)).toHaveAttribute(
      'src',
      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_enggizmos_01.jpg',
    )
    const reagents = screen.getByRole('list', { name: 'Реагенты' })
    expect(within(reagents).getAllByRole('listitem')[0]).toHaveTextContent(
      'Адамантитовый слиток× 8',
    )
    expect(within(screen.getByRole('region')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('× 1')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Подтвердить импорт' })).toBeEnabled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
    await user.click(
      screen.getByRole('option', { name: 'Инженерное дело (Engineering)' }),
    )
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ outputQuantity: 5, profession: 'engineering' }),
    )
    expect(onSuccess).toHaveBeenCalledWith('Крафт создан. Добавлено реагентов: 3.')
    expect(onClose).toHaveBeenCalledOnce()
    expect(
      Object.values(useCraftStore.getState().items).find(
        (item) => item.source?.wowheadItemId === 34113,
      )?.recipe,
    ).toMatchObject({ outputQuantity: 5, profession: 'engineering' })
  })

  it.each(['crafts', 'reagents'] as const)(
    'после импорта в разделе %s закрывает окно и показывает отдельное уведомление',
    async (section) => {
      mockTooltip()
      const user = userEvent.setup()
      render(<ItemsPage section={section} />)
      const addLabel = section === 'crafts' ? 'Добавить крафт' : 'Добавить реагент'
      const opener = screen.getByRole('button', { name: `+ ${addLabel}` })

      await user.click(opener)
      await loadRecipe(user)
      await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
      await user.click(screen.getByRole('option', { name: 'Без профессии' }))
      await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
      expect(screen.getByRole('status')).toHaveTextContent(
        'Крафт создан. Добавлено реагентов: 3.',
      )

      await user.click(opener)
      await loadRecipe(user)
      await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getAllByRole('status')).toHaveLength(1)
      expect(screen.getByRole('status')).toHaveTextContent(
        'Крафт обновлён. Новые реагенты не потребовались.',
      )
      expect(Object.keys(useCraftStore.getState().items)).toHaveLength(4)
      await user.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    },
  )

  it('подставляет выход 1 при неизвестном значении и проверяет количество и профессию', async () => {
    mockTooltip({
      ...tbcTooltip,
      tooltip: tbcTooltip.tooltip.replace(
        '</span> (5)<!--ndstart-->',
        '</span><!--ndstart-->',
      ),
    })
    const user = userEvent.setup()
    const onImport = vi.fn(useCraftStore.getState().importRecipe)
    render(<ImportHarness catalog={{}} onImport={onImport} onClose={vi.fn()} />)
    await loadRecipe(user)
    const output = screen.getByLabelText('Предметов за один крафт')
    const submit = screen.getByRole('button', { name: 'Подтвердить импорт' })
    expect(output).toHaveValue(1)
    expect(screen.queryByText(/По умолчанию: 1/)).not.toBeInTheDocument()
    await user.click(submit)
    expect(screen.getByRole('alert')).toHaveTextContent('Выберите профессию')
    await user.clear(output)
    await user.tab()
    expect(output).toHaveValue(1)
    expect(screen.getByRole('button', { name: 'Уменьшить значение' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Увеличить значение' }))
    expect(output).toHaveValue(2)
    fireEvent.change(output, { target: { value: '2.5' } })
    await user.click(submit)
    expect(screen.getByRole('alert')).toHaveTextContent('положительное целое')
    fireEvent.change(output, { target: { value: '3' } })
    await user.click(submit)
    expect(screen.getByRole('alert')).toHaveTextContent('Выберите профессию')
    expect(onImport).not.toHaveBeenCalled()
    await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
    await user.click(screen.getByRole('option', { name: 'Без профессии' }))
    await user.click(submit)
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ outputQuantity: 3, profession: null }),
    )
  })

  it('подставляет сохранённые параметры и повторно импортирует без дублей', async () => {
    mockTooltip()
    const catalog: ItemCatalog = {
      robot: {
        id: 'robot',
        name: 'Мой робот',
        iconUrl: '',
        source: { wowheadItemId: 34113 },
        sections: ['crafts'],
        purchasePriceCopper: 15,
        salePriceCopper: 30,
        recipe: {
          outputQuantity: 2,
          profession: 'engineering',
          reagents: [{ itemId: 'metal', quantity: 4, acquisition: 'buy' }],
        },
      },
      metal: {
        id: 'metal',
        name: 'Адамантитовый слиток',
        iconUrl: '',
        sections: ['reagents'],
        purchasePriceCopper: 7,
        salePriceCopper: null,
        recipe: null,
      },
    }
    useCraftStore
      .getState()
      .replaceData({ items: catalog, ownedProfessions: [], currencyDisplay: 'icons' })
    const user = userEvent.setup()
    const onImport = vi.fn(useCraftStore.getState().importRecipe)
    const first = render(
      <ImportHarness catalog={catalog} onImport={onImport} onClose={vi.fn()} />,
    )
    await loadRecipe(user)
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(2)
    expect(screen.getByRole('combobox', { name: 'Профессия' })).toHaveValue(
      'Инженерное дело (Engineering)',
    )
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    first.unmount()
    const afterFirst = useCraftStore.getState().items
    render(<ImportHarness catalog={afterFirst} onImport={onImport} onClose={vi.fn()} />)
    await loadRecipe(user)
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(Object.keys(useCraftStore.getState().items)).toHaveLength(4)
    expect(useCraftStore.getState().items.robot).toMatchObject({
      purchasePriceCopper: 15,
      salePriceCopper: 30,
      recipe: {
        outputQuantity: 2,
        profession: 'engineering',
      },
    })
    expect(useCraftStore.getState().items.robot?.recipe?.reagents).toContainEqual({
      itemId: 'metal',
      quantity: 8,
      acquisition: 'buy',
    })
    expect(useCraftStore.getState().items.metal?.purchasePriceCopper).toBe(7)
  })

  it('отмена проверки не меняет каталог и сохранение', async () => {
    mockTooltip()
    const before = useCraftStore.getState().items
    const saved = localStorage.getItem('craft-calc-data')
    const user = userEvent.setup()
    const onImport = vi.fn(useCraftStore.getState().importRecipe)
    const onClose = vi.fn()
    render(<ImportHarness catalog={before} onImport={onImport} onClose={onClose} />)
    await loadRecipe(user)
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onImport).not.toHaveBeenCalled()
    expect(useCraftStore.getState().items).toBe(before)
    expect(localStorage.getItem('craft-calc-data')).toBe(saved)
  })

  it('возвращает фокус к кнопке открытия после отмены проверки', async () => {
    mockTooltip()
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    const opener = screen.getByRole('button', { name: '+ Добавить крафт' })
    await user.click(opener)
    await loadRecipe(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('повреждённый ингредиент не открывает проверку и не меняет каталог', async () => {
    mockTooltip({ ...tbcTooltip, tooltip: tbcTooltip.tooltip.replace('(8)', '(0)') })
    const user = userEvent.setup()
    const onImport = vi.fn(useCraftStore.getState().importRecipe)
    const before = useCraftStore.getState().items
    const saved = localStorage.getItem('craft-calc-data')
    render(<ImportHarness catalog={before} onImport={onImport} onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox'), 'https://wowhead.com/tbc/ru/spell=44391')
    await user.click(screen.getByRole('button', { name: 'Загрузить рецепт' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Повреждён состав')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
    expect(useCraftStore.getState().items).toBe(before)
    expect(localStorage.getItem('craft-calc-data')).toBe(saved)
  })

  it('показывает ошибку атомарного импорта и оставляет проверку открытой', async () => {
    mockTooltip()
    const user = userEvent.setup()
    const onImport = vi.fn(() => ({
      success: false as const,
      error: 'Этот рецепт создаёт циклическую зависимость',
    }))
    render(<ImportHarness catalog={{}} onImport={onImport} onClose={vi.fn()} />)
    await loadRecipe(user)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Без профессии' }))
    await user.click(screen.getByRole('button', { name: 'Подтвердить импорт' }))
    expect(screen.getByRole('alert')).toHaveTextContent('циклическую зависимость')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('закрытие во время загрузки не применяет поздний ответ', async () => {
    let resolveResponse: (response: Response) => void = () => {
      throw new Error('Запрос не начат')
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const user = userEvent.setup()
    const onImport = vi.fn()
    const onClose = vi.fn()
    const { unmount } = render(
      <ImportHarness catalog={{}} onImport={onImport} onClose={onClose} />,
    )
    await user.type(
      screen.getByRole('textbox'),
      'https://wowhead.com/classic/ru/spell=25146',
    )
    await user.click(screen.getByRole('button', { name: 'Загрузить рецепт' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }))
    await act(async () => {
      resolveResponse(Response.json(classicTooltip))
      await Promise.resolve()
    })
    expect(onImport).not.toHaveBeenCalled()
    expect(useCraftStore.getState().items).toEqual({})
  })

  it('выбор профессии с клавиатуры, Tab и Escape работают внутри диалога', async () => {
    mockTooltip()
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ImportHarness catalog={{}} onImport={vi.fn()} onClose={onClose} />)
    await loadRecipe(user)
    const profession = screen.getByRole('combobox', { name: 'Профессия' })
    await user.click(profession)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(profession).toHaveValue('Алхимия (Alchemy)')
    await user.tab()
    expect(screen.getByRole('dialog')).toContainElement(
      document.activeElement as HTMLElement,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
