/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '../app/App'
import type { Item, ItemCatalog } from '../domain/item.types'
import { buildReferenceDatabaseIndex } from '../domain/reference-database-index'
import { parseReferenceDatabase } from '../domain/reference-database.schema'
import * as loader from '../features/reference-database/reference-database-loader'
import { useTsmStore } from '../features/tsm/tsm-client'
import { selectActiveItems } from '../store/craft.selectors'
import { useCraftStore } from '../store/useCraftStore'
import { testCraftData } from '../test/craft-state'
import { ItemsPage } from './ItemsPage'

function material(id: string, wowheadItemId: number): Item {
  return {
    id,
    name: id,
    iconUrl: '',
    source: { wowheadItemId },
    sections: ['reagents'],
    purchasePriceCopper: 999,
    salePriceCopper: 100,
    recipe: null,
  }
}

const catalog: ItemCatalog = {
  boots: {
    id: 'boots',
    name: 'Сапоги из ткани Пустоты',
    names: { ru: 'Сапоги из ткани Пустоты', en: 'Netherweave Boots' },
    iconUrl: '',
    source: { wowheadItemId: 21853, wowheadVersion: 'tbc' },
    requiredLevel: 0,
    qualityId: 2,
    itemLevel: 108,
    classId: 4,
    subclassId: 1,
    inventoryType: 8,
    sections: ['crafts', 'disenchanting'],
    purchasePriceCopper: 200,
    salePriceCopper: 50_000,
    recipe: {
      outputQuantity: 1,
      profession: 'tailoring',
      reagents: [{ itemId: 'cloth', quantity: 2, acquisition: 'buy' }],
    },
  },
  cloth: {
    id: 'cloth',
    name: 'Ткань',
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 50,
    salePriceCopper: null,
    recipe: null,
  },
  dust: material('dust', 22445),
  essence: material('essence', 22446),
  shard: material('shard', 22449),
}

function root() {
  const row = screen.getByText('Сапоги из ткани Пустоты').closest('article')
  if (!row) throw new Error('Нет строки')
  return row
}

function cell(label: string) {
  const result = within(root()).getByText(label, { selector: 'dt' }).nextElementSibling
  if (!(result instanceof HTMLElement)) throw new Error('Нет значения')
  return result
}

function estimateTooltip() {
  const trigger = cell('Распыление').querySelector('.tooltip-trigger')
  if (!trigger) throw new Error('Нет подсказки')
  fireEvent.mouseEnter(trigger)
  const tooltip = document.getElementById(trigger.getAttribute('aria-describedby') ?? '')
  if (!tooltip) throw new Error('Нет содержимого подсказки')
  expect(tooltip).toHaveAttribute('role', 'tooltip')
  return tooltip
}

describe('страница Распыление', () => {
  beforeEach(() => {
    useCraftStore
      .getState()
      .replaceData(
        testCraftData({ items: catalog, ownedProfessions: ['tailoring'] }, 'tbc'),
      )
    vi.spyOn(loader, 'loadReferenceDatabase').mockImplementation(() => {
      const value: unknown = JSON.parse(
        readFileSync('public/data/tbc/craftcalc-db.2.5.6.69795.json', 'utf8'),
      )
      return Promise.resolve(
        buildReferenceDatabaseIndex(parseReferenceDatabase(value, 'tbc')),
      )
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('считает Classic и показывает названия, иконки и цены материалов старого мира', () => {
    const boots = catalog.boots
    if (!boots) throw new Error('Нет предмета')
    useCraftStore.getState().replaceData(
      testCraftData(
        {
          items: {
            boots: {
              ...boots,
              source: { wowheadItemId: 13856, wowheadVersion: 'classic' },
              itemLevel: 51,
              recipe: null,
            },
            dust: material('dust', 11176),
            essence: material('essence', 16202),
            shard: material('shard', 14343),
          },
        },
        'classic',
      ),
    )
    render(<ItemsPage section="disenchanting" />)
    expect(cell('Распыление')).toHaveTextContent(/2.*серебра.*98.*меди/)
    expect(
      cell('Прибыль за распыление').querySelector(':scope > .money-display'),
    ).toHaveTextContent(/98.*меди/)
    const tooltip = estimateTooltip()
    expect(tooltip).toHaveTextContent(/Сонная пыль.*2–5 шт\..*Шанс 75/)
    expect(tooltip).toHaveTextContent('Простая Вечная субстанция')
    expect(tooltip).toHaveTextContent('Малый сверкающий осколок')
    expect(
      within(tooltip).getAllByRole('listitem')[0]?.querySelector('img'),
    ).toHaveAttribute('src', expect.stringContaining('inv_enchant_dustdream.jpg'))
    act(() => {
      useCraftStore.getState().setItemPrice('dust', 'salePriceCopper', 200)
    })
    expect(cell('Распыление')).toHaveTextContent(/5.*серебра.*60.*меди/)
  })

  it('открывается из меню, заменяет продажу оценкой и сохраняет дерево рецепта', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Распыление' }))
    expect(screen.getByRole('heading', { name: 'Распыление' })).toBeVisible()
    expect(within(root()).queryByText('Продажа', { selector: 'dt' })).toBeNull()
    expect(within(root()).queryByText('Прибыль за крафт', { selector: 'dt' })).toBeNull()
    expect(cell('Распыление')).toHaveTextContent(/2.*серебра.*99.*меди/)
    expect(
      cell('Прибыль за распыление').querySelector(':scope > .money-display'),
    ).toHaveTextContent(/1.*серебра.*99.*меди/)
    expect(
      screen.getByText(
        'Ожидаемая стоимость материалов и прибыль за распыление предмета.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/Количество материалов внутри диапазона/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))
    expect(screen.getByText('Ткань')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Редактировать цены' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Крафты' }))
    expect(cell('Продажа')).toHaveTextContent(/5.*золота.*0.*серебра.*0.*меди/)
  })

  it('ищет по второму названию и пересчитывает цену продажи материала сразу', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="disenchanting" />)
    await user.type(screen.getByRole('searchbox'), 'NETHERWEAVE')
    expect(root()).toBeVisible()
    act(() => {
      useCraftStore.getState().setItemPrice('dust', 'salePriceCopper', 200)
    })
    expect(cell('Распыление')).toHaveTextContent(/5.*серебра.*61.*меди/)
    expect(
      cell('Прибыль за распыление').querySelector(':scope > .money-display'),
    ).toHaveTextContent(/4.*серебра.*61.*меди/)
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'нет такого')
    expect(screen.queryByText('Сапоги из ткани Пустоты')).toBeNull()
    expect(screen.getByText('Ничего не найдено')).toBeVisible()
  })

  it('описывает возможные реагенты, количество, шанс и актуальную цену продажи в подсказке', async () => {
    const user = userEvent.setup()
    useCraftStore.getState().setItemPrice('dust', 'salePriceCopper', 17_282)
    render(<ItemsPage section="disenchanting" />)
    const trigger = cell('Распыление').querySelector('.tooltip-trigger')
    if (!trigger) throw new Error('Нет подсказки')
    await user.hover(trigger)
    const tooltip = estimateTooltip()
    expect(tooltip).not.toHaveTextContent('За один предмет')
    expect(tooltip).not.toHaveTextContent('Ожидаемая стоимость')
    expect(tooltip).not.toHaveTextContent('равновероятным')
    const profitTooltip = cell('Прибыль за распыление').querySelector('.profit-tooltip')
    expect(profitTooltip).not.toHaveTextContent('Возможные результаты')
    expect(profitTooltip).not.toHaveTextContent('Прибыль учитывает')
    expect(profitTooltip).toHaveTextContent('Купить и распылить')
    expect(profitTooltip).toHaveTextContent('Все профессии')
    expect(profitTooltip).toHaveTextContent('Все реагенты купить')
    expect(cell('Распыление')).not.toHaveAttribute('title')
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id)
    const rows = within(tooltip).getAllByRole('listitem')
    const dust = rows[0]
    if (!dust) throw new Error('Нет материала')
    expect(dust).toHaveTextContent('Чародейская пыль')
    expect(dust).toHaveTextContent('2–5 шт.')
    expect(dust).toHaveTextContent(/Шанс 75\s*%/)
    expect(dust).toHaveTextContent(/1.*золота.*72.*серебра.*82.*меди/)
    expect(dust.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('inv_enchant_dustarcane.jpg'),
    )
    expect(rows[1]).toHaveTextContent(/Великая планарная субстанция.*1–2 шт\..*Шанс 22/)
    expect(rows[2]).toHaveTextContent(/Большой радужный осколок.*1 шт\..*Шанс 3/)
    act(() => {
      useCraftStore.getState().setItemPrice('dust', 'salePriceCopper', 0)
    })
    expect(dust.querySelector('.money-display')).toHaveTextContent(/0.*меди/)
  })

  it('считает прибыль от покупки для предмета без рецепта', () => {
    const boots = catalog.boots
    if (!boots) throw new Error('Нет предмета')
    useCraftStore.getState().updateItem('boots', boots)
    useCraftStore.getState().setRecipe('boots', null)
    render(<ItemsPage section="disenchanting" />)
    expect(
      cell('Прибыль за распыление').querySelector(':scope > .money-display'),
    ).toHaveTextContent(/99.*меди/)
  })

  it('сохраняет дробный процент редкого исхода в подсказке', () => {
    const boots = catalog.boots
    if (!boots) throw new Error('Нет предмета')
    useCraftStore.getState().updateItem('boots', { ...boots, qualityId: 3 })
    render(<ItemsPage section="disenchanting" />)
    const tooltip = estimateTooltip()
    expect(tooltip).toHaveTextContent(/Кристалл Бездны.*1 шт\..*Шанс 0,5\s*%/)
    expect(tooltip).toHaveTextContent(/Большой радужный осколок.*1 шт\..*Шанс 99,5\s*%/)
  })

  it('показывает причины неизвестной оценки и не использует ноль', () => {
    useCraftStore.getState().setItemPrice('dust', 'salePriceCopper', null)
    render(<ItemsPage section="disenchanting" />)
    expect(cell('Распыление')).toHaveTextContent('не указано')
    const tooltip = estimateTooltip()
    expect(tooltip).toHaveTextContent('Не указана используемая цена продажи.')
    expect(within(tooltip).getAllByRole('listitem')[0]).toHaveTextContent('не указано')
    expect(
      cell('Прибыль за распыление').querySelector(':scope > .money-display'),
    ).toHaveTextContent('не указано')
    act(() => {
      const dust = catalog.dust
      if (!dust) throw new Error('Нет материала')
      useCraftStore.getState().createItem({ ...dust, name: 'Другая пыль' })
    })
    expect(tooltip).toHaveTextContent('несколько записей')
  })

  it.each([
    [{ qualityId: 5 }, 'правило распыления пока не поддерживается'],
    [{ itemLevel: undefined }, 'Недостаточно данных'],
    [
      { source: { wowheadItemId: 21766, wowheadVersion: 'tbc' as const } },
      'нельзя распылить',
    ],
  ])('поясняет неподдерживаемый предмет %j', (change, message) => {
    const boots = catalog.boots
    if (!boots) throw new Error('Нет предмета')
    useCraftStore.getState().updateItem('boots', { ...boots, ...change })
    render(<ItemsPage section="disenchanting" />)
    expect(cell('Распыление')).toHaveTextContent('не указано')
    expect(estimateTooltip()).toHaveTextContent(message)
  })

  it('обновляется после смены показателя TSM, сохраняя ручные цены', () => {
    const market = { region: 'eu', realm: 'thunderstrike', faction: 'alliance' } as const
    const state = useCraftStore.getState()
    state.setTbcPricing({ market, metric: 'recent', priceMode: 'individual' })
    const dust = catalog.dust
    if (!dust) throw new Error('Нет материала')
    state.updateItem('dust', { ...dust, salePriceSource: 'tsm' })
    useTsmStore.setState({
      scope: `${String(useCraftStore.getState().workspaceRevision)}:tbc-eu-thunderstrike-alliance`,
      snapshot: {
        schemaVersion: 1,
        market,
        scannedAt: '2026-10-16T12:00:00Z',
        items: { '22445': { recent: 200, marketValue: 100 } },
      },
    })
    render(<ItemsPage section="disenchanting" />)
    expect(cell('Распыление')).toHaveTextContent(/5.*серебра.*61.*меди/)
    const tooltip = estimateTooltip()
    expect(
      within(tooltip).getAllByRole('listitem')[0]?.querySelector('.money-display'),
    ).toHaveTextContent(/2.*серебра0.*меди/)
    act(() => {
      useCraftStore
        .getState()
        .setTbcPricing({ market, metric: 'marketValue', priceMode: 'individual' })
    })
    expect(cell('Распыление')).toHaveTextContent(/2.*серебра.*99.*меди/)
    expect(
      within(tooltip).getAllByRole('listitem')[0]?.querySelector('.money-display'),
    ).toHaveTextContent(/1.*серебра0.*меди/)
    expect(selectActiveItems(useCraftStore.getState()).dust?.salePriceCopper).toBe(100)
  })

  it('снимает видимость через редактор, сохраняя уходящую последнюю строку и каталог', async () => {
    const user = userEvent.setup()
    const view = render(<ItemsPage section="disenchanting" />)
    const tree = root().closest('.item-tree')
    if (!tree) throw new Error('Нет дерева')
    fireEvent.animationEnd(tree)
    await user.click(
      screen.getByRole('button', { name: 'Редактировать Сапоги из ткани Пустоты' }),
    )
    await user.click(screen.getByRole('checkbox', { name: 'Распыление' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(selectActiveItems(useCraftStore.getState()).boots?.sections).toEqual([
      'crafts',
    ])
    expect(tree).toHaveAttribute('inert')
    expect(tree).toHaveAttribute('aria-hidden', 'true')
    expect(view.container.querySelector('.item-list')).not.toBeNull()
    expect(cell('Распыление')).toHaveTextContent(/2.*серебра.*99.*меди/)
    fireEvent.animationEnd(root())
    expect(tree).toBeInTheDocument()
    fireEvent.animationEnd(tree)
    expect(tree).not.toBeInTheDocument()
    expect(screen.getByText('Здесь пока ничего нет')).toBeVisible()
  })

  it('отменяет удаление при быстром повторном добавлении без дублей и не повторяет появление при изменениях', () => {
    const view = render(<ItemsPage section="disenchanting" />)
    const tree = root().closest('.item-tree')
    const boots = catalog.boots
    if (!tree || !boots) throw new Error('Нет дерева')
    fireEvent.animationEnd(tree)
    act(() => {
      useCraftStore.getState().updateItem('boots', { ...boots, sections: ['crafts'] })
    })
    expect(tree).toHaveAttribute('inert')
    act(() => {
      useCraftStore.getState().updateItem('boots', boots)
    })
    fireEvent.animationEnd(tree)
    expect(tree).not.toHaveAttribute('inert')
    expect(view.container.querySelectorAll('.item-list > .item-tree')).toHaveLength(1)
    act(() => {
      useCraftStore.getState().setPlannerQuantity('boots', 3)
    })
    expect(tree).not.toHaveClass('item-tree--entering')
    act(() => {
      useCraftStore.getState().removeItem('boots')
    })
    expect(selectActiveItems(useCraftStore.getState()).boots).toBeUndefined()
    expect(tree).toHaveAttribute('inert')
    expect(screen.getByText('Сапоги из ткани Пустоты')).toBeInTheDocument()
    fireEvent.animationEnd(tree)
    expect(tree).not.toBeInTheDocument()
  })

  it('анимирует добавление и массовое удаление строк', () => {
    const view = render(<ItemsPage section="disenchanting" />)
    const boots = catalog.boots
    if (!boots) throw new Error('Нет предмета')
    act(() => {
      useCraftStore.getState().createItem({ ...boots, name: 'Второй предмет' })
    })
    const trees = view.container.querySelectorAll('.item-list > .item-tree')
    expect(trees).toHaveLength(2)
    for (const tree of trees) {
      expect(tree).toHaveClass('item-tree--entering')
      fireEvent.animationEnd(tree)
    }
    act(() => {
      const store = useCraftStore.getState()
      for (const item of Object.values(selectActiveItems(store))) {
        if (item.sections.includes('disenchanting'))
          store.updateItem(item.id, { ...item, sections: ['crafts'] })
      }
    })
    expect(view.container.querySelectorAll('.item-list > [data-removing]')).toHaveLength(
      2,
    )
    for (const tree of trees) fireEvent.animationEnd(tree)
    expect(view.container.querySelector('.item-list')).toBeNull()
  })

  it.each([true, false])(
    'импортирует экипировку из базы в новый раздел, с рецептом: %s',
    async (withRecipe) => {
      const user = userEvent.setup()
      useCraftStore.getState().replaceData(testCraftData({ items: {} }, 'tbc'))
      render(<ItemsPage section="disenchanting" />)
      await user.click(screen.getByRole('button', { name: '+ Добавить предмет' }))
      const dialog = within(screen.getByRole('dialog'))
      await user.type(await dialog.findByRole('searchbox'), 'Netherweave Boots')
      await user.click(dialog.getByRole('button', { name: /^Сапоги из ткани Пустоты/ }))
      if (!withRecipe) {
        await user.click(dialog.getByRole('combobox', { name: 'Рецепт' }))
        await user.click(
          screen.getByRole('option', { name: 'Только предмет, без импорта рецепта' }),
        )
      }
      await user.click(
        dialog.getByRole('button', {
          name: 'Добавить выбранные (1)',
        }),
      )
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(root()).toBeVisible()
      const product = Object.values(selectActiveItems(useCraftStore.getState())).find(
        ({ source }) => source?.wowheadItemId === 21853,
      )
      expect(product?.sections).toContain('disenchanting')
      expect(product?.itemLevel).toBe(108)
      if (!withRecipe) expect(product?.recipe).toBeNull()
      expect(estimateTooltip()).toHaveTextContent('Добавьте материал в каталог')
    },
  )

  it('при смене версии сохраняет вкладку и ограничивает только непроверенную Forever', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Распыление' }))
    await user.click(screen.getByRole('button', { name: /Выбрать версию игры/ }))
    await user.click(screen.getByRole('button', { name: 'Classic' }))
    expect(screen.getByRole('heading', { name: 'Распыление' })).toBeVisible()
    expect(screen.queryByText(/таблицы распыления пока не подтверждены/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /Выбрать версию игры/ }))
    await user.click(screen.getByRole('button', { name: 'Forever' }))
    expect(
      screen.getByText(/Для Forever таблицы распыления пока не подтверждены/),
    ).toBeVisible()
    expect(screen.queryByText('Сапоги из ткани Пустоты')).toBeNull()
  })
})
