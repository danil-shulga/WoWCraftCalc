import { items } from '../test/items-page-fixture'
import { testCraftData, setTestCraftState } from '../test/craft-state'
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCraftStore } from '../store/useCraftStore'
import { ItemsPage } from './ItemsPage'

describe('ItemsPage: drag', () => {
  beforeEach(() => {
    useCraftStore.getState().replaceData(testCraftData({ items, itemLanguage: 'ru' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const mockListLayout = () => {
    const list = screen.getByText('Лечебное зелье').closest('.item-list')
    if (!(list instanceof HTMLElement)) throw new Error('Нет списка')
    const trees = list.querySelectorAll(':scope > .item-tree')
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 90, 1000, trees.length * 70 + 10),
    )
    trees.forEach((tree, index) => {
      vi.spyOn(tree, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 100 + index * 70, 1000, 60),
      )
    })
    return list
  }

  const pointerAt = (
    type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
    target: Element | Document,
    y: number,
    x = 50,
  ) => {
    const event = createEvent[type](target)
    if (type === 'pointerDown' && target instanceof HTMLElement) {
      target.setPointerCapture = vi.fn()
      target.hasPointerCapture = vi.fn(() => false)
    }
    Object.defineProperties(event, {
      clientX: { value: x },
      clientY: { value: y },
      pointerId: { value: 1 },
      button: { value: 0 },
      pointerType: { value: 'mouse' },
    })
    fireEvent(target, event)
  }

  const rootNames = () =>
    screen
      .getAllByRole('button', {
        name: /^Редактировать (Лечебное зелье|Шерстяная сумка)$/,
      })
      .map((button) => button.getAttribute('aria-label'))

  it.each(['crafts', 'reagents', 'favorites'] as const)(
    'плавно переставляет строки в %s и сохраняет порядок после открытия',
    (section) => {
      vi.useFakeTimers()
      setTestCraftState({
        items: Object.fromEntries(
          Object.entries(items).map(([id, item]) => [
            id,
            { ...item, sections: ['crafts', 'reagents'], isFavorite: true },
          ]),
        ),
      })
      const view = render(<ItemsPage section={section} />)
      const list = mockListLayout()
      const source = screen.getByText('Шерстяная сумка').closest('article')
      if (!source) throw new Error('Нет строки')
      pointerAt('pointerDown', source, 200)
      pointerAt('pointerMove', document, 115)
      expect(list.querySelector('.item-list__drop-gap')).toHaveStyle({
        top: '10px',
        height: '60px',
      })
      expect(list.querySelector('.item-tree')).toHaveStyle({
        transform: 'translateY(70px)',
      })
      expect(rootNames()[0]).toBe('Редактировать Лечебное зелье')
      pointerAt('pointerUp', document, 115)
      expect(source.closest('.item-tree')).toHaveClass('item-tree--settling')
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(rootNames()).toEqual([
        'Редактировать Шерстяная сумка',
        'Редактировать Лечебное зелье',
      ])
      expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
      expect(source.closest('.item-tree')).toHaveAttribute('style', '')
      view.unmount()
      render(<ItemsPage section={section} />)
      expect(rootNames()[0]).toBe('Редактировать Шерстяная сумка')
    },
  )

  it('не повторяет появление полей количества при перестановке строк', () => {
    vi.useFakeTimers()
    useCraftStore.getState().setPlannerQuantity('potion', 3)
    useCraftStore.getState().setPlannerQuantity('bag', 4)
    render(<ItemsPage section="crafts" />)
    const list = mockListLayout()
    const inputs = screen.getAllByRole('spinbutton')
    const source = screen.getByText('Шерстяная сумка').closest('article')
    if (!source) throw new Error('Нет строки')
    for (const input of inputs) {
      expect(input.closest('.plan-quantity-control__quantity')).not.toHaveClass(
        'plan-quantity-control__quantity--opening',
      )
    }
    pointerAt('pointerDown', source, 200)
    pointerAt('pointerMove', document, 115)
    pointerAt('pointerUp', document, 115)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(rootNames()[0]).toBe('Редактировать Шерстяная сумка')
    expect(screen.getAllByRole('spinbutton')).toEqual([inputs[1], inputs[0]])
    expect(
      screen.getByRole('spinbutton', { name: 'Количество: Лечебное зелье' }),
    ).toHaveValue(3)
    expect(
      screen.getByRole('spinbutton', { name: 'Количество: Шерстяная сумка' }),
    ).toHaveValue(4)
    expect(list.querySelector('.plan-quantity-control__quantity--opening')).toBeNull()
  })

  it.each(['escape', 'outside', 'cancel'] as const)(
    'отменяет перенос через %s, не меняя сохранённый порядок',
    (method) => {
      vi.useFakeTimers()
      render(<ItemsPage section="crafts" />)
      const list = mockListLayout()
      const source = screen.getByText('Шерстяная сумка').closest('article')
      if (!source) throw new Error('Нет строки')
      pointerAt('pointerDown', source, 200)
      pointerAt('pointerMove', document, 115)
      if (method === 'escape') fireEvent.keyDown(document, { key: 'Escape' })
      else if (method === 'cancel') pointerAt('pointerCancel', document, 115)
      else pointerAt('pointerUp', document, 115, 1500)
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(rootNames()[0]).toBe('Редактировать Лечебное зелье')
      expect(list).not.toHaveClass('item-list--dragging')
      expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
    },
  )

  it('переносит раскрытое дерево целиком и не сворачивает его кликом после отпускания', () => {
    vi.useFakeTimers()
    const potion = items.potion
    if (!potion) throw new Error('Нет предмета')
    setTestCraftState({
      items: {
        ...items,
        potion: {
          ...potion,
          recipe: {
            outputQuantity: 1,
            profession: null,
            reagents: [{ itemId: 'bag', quantity: 1, acquisition: 'buy' }],
          },
        },
      },
    })
    render(<ItemsPage section="crafts" />)
    const source = screen.getByRole('button', { name: 'Развернуть рецепт' })
    fireEvent.click(source)
    const branch = source.closest('.item-tree')?.querySelector('.item-tree__expansion')
    if (!branch) throw new Error('Нет раскрытой ветки')
    fireEvent.animationEnd(branch)
    expect(branch).not.toHaveClass('item-tree__expansion--opening')
    const list = mockListLayout()
    const trees = list.querySelectorAll(':scope > .item-tree')
    if (!trees[0] || !trees[1]) throw new Error('Нет деревьев')
    vi.spyOn(trees[0], 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 100, 1000, 200),
    )
    vi.spyOn(trees[1], 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 310, 1000, 60),
    )
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 90, 1000, 290))
    pointerAt('pointerDown', source, 130)
    pointerAt('pointerMove', document, 235)
    expect(trees[1]).toHaveStyle({ transform: 'translateY(-210px)' })
    expect(list.querySelector('.item-list__drop-gap')).toHaveStyle({ height: '200px' })
    pointerAt('pointerUp', document, 235)
    fireEvent.click(source)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(source).toHaveAttribute('aria-expanded', 'true')
    expect(source.closest('.item-tree')?.querySelector('.item-tree__expansion')).toBe(
      branch,
    )
    expect(branch).not.toHaveClass('item-tree__expansion--opening')
    const state = useCraftStore.getState()
    expect(state.workspaces[state.activeVersion].rootItemOrder?.crafts).toEqual([
      'bag',
      'potion',
    ])
  })

  it('не начинает перенос от небольшого движения при обычном клике', () => {
    render(<ItemsPage section="crafts" />)
    const list = mockListLayout()
    const source = screen.getByText('Лечебное зелье').closest('article')
    if (!source) throw new Error('Нет строки')
    pointerAt('pointerDown', source, 130)
    pointerAt('pointerMove', document, 132)
    pointerAt('pointerUp', document, 132)
    expect(list).not.toHaveClass('item-list--dragging')
    expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
  })

  it.each([235, 305, 400])(
    'принимает отпускание в промежутке на высоте %s, включая конец списка',
    (y) => {
      vi.useFakeTimers()
      const extra = items.potion
      if (!extra) throw new Error('Нет предмета')
      setTestCraftState({
        items: {
          ...items,
          extra: {
            ...extra,
            id: 'extra',
            name: 'Янтарь',
            names: { ru: 'Янтарь', en: null },
          },
        },
      })
      render(<ItemsPage section="crafts" />)
      const list = mockListLayout()
      const source = screen.getByText('Лечебное зелье').closest('article')
      if (!source) throw new Error('Нет строки')
      pointerAt('pointerDown', source, 130)
      pointerAt('pointerMove', document, y)
      expect(list.querySelector('.item-list__drop-gap')).toBeInTheDocument()
      pointerAt('pointerUp', document, y)
      act(() => {
        vi.advanceTimersByTime(200)
      })
      const state = useCraftStore.getState()
      expect(state.workspaces[state.activeVersion].rootItemOrder?.crafts).toEqual(
        y === 235 ? ['bag', 'potion', 'extra'] : ['bag', 'extra', 'potion'],
      )
    },
  )

  it('принимает отпускание выше начала списка', () => {
    vi.useFakeTimers()
    render(<ItemsPage section="crafts" />)
    const list = mockListLayout()
    const source = screen.getByText('Шерстяная сумка').closest('article')
    if (!source) throw new Error('Нет строки')
    pointerAt('pointerDown', source, 200)
    pointerAt('pointerMove', document, 60)
    expect(list.querySelector('.item-list__drop-gap')).toHaveStyle({ top: '10px' })
    pointerAt('pointerUp', document, 60)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(rootNames()[0]).toBe('Редактировать Шерстяная сумка')
    expect(list).not.toHaveClass('item-list--dragging')
    expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
  })

  it('прокручивает у обоих краёв без движения мыши, останавливается при отпускании и размонтировании', () => {
    vi.useFakeTimers()
    const frames = new Map<number, FrameRequestCallback>()
    let nextId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    const distances: number[] = []
    const scroll = vi
      .spyOn(window, 'scrollBy')
      .mockImplementation((options: ScrollToOptions | number) => {
        if (typeof options === 'object') distances.push(options.top ?? 0)
      })
    const tick = (time: number) => {
      const entry = frames.entries().next().value
      if (!entry) throw new Error('Нет кадра прокрутки')
      frames.delete(entry[0])
      act(() => {
        entry[1](time)
      })
    }
    const view = render(<ItemsPage section="crafts" />)
    const list = mockListLayout()
    const source = screen.getByText('Шерстяная сумка').closest('article')
    if (!source) throw new Error('Нет строки')
    pointerAt('pointerDown', source, 200)
    pointerAt('pointerMove', document, window.innerHeight - 5)
    tick(16)
    tick(32)
    expect(scroll).toHaveBeenCalledTimes(2)
    expect(distances.at(-1)).toBeGreaterThan(0)
    pointerAt('pointerMove', document, 5)
    tick(48)
    expect(distances.at(-1)).toBeLessThan(0)
    scroll.mockClear()
    pointerAt('pointerMove', document, 165)
    tick(64)
    expect(scroll).not.toHaveBeenCalled()
    pointerAt('pointerUp', document, 115)
    expect(frames.size).toBe(0)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(list.querySelector('.item-list__drop-gap')).not.toBeInTheDocument()
    pointerAt('pointerDown', source, 200)
    pointerAt('pointerMove', document, 115)
    expect(frames.size).toBe(1)
    view.unmount()
    expect(frames.size).toBe(0)
  })

  it('переставляет с клавиатуры при поиске, сохраняя скрытые строки', async () => {
    const user = userEvent.setup()
    const hidden = items.potion
    if (!hidden) throw new Error('Нет тестового предмета')
    setTestCraftState({
      items: {
        ...items,
        hidden: {
          ...hidden,
          id: 'hidden',
          name: 'Скрытый',
          names: { ru: 'Скрытый', en: null },
        },
      },
    })
    render(<ItemsPage section="crafts" />)
    await user.type(screen.getByRole('searchbox'), 'o')
    expect(screen.queryByText('Скрытый')).not.toBeInTheDocument()
    const row = screen.getByText('Шерстяная сумка').closest('article')
    if (!row) throw new Error('Нет строки')
    row.focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(rootNames()[0]).toBe('Редактировать Шерстяная сумка')
    await user.clear(screen.getByRole('searchbox'))
    expect(screen.getByText('Скрытый')).toBeVisible()
    const state = useCraftStore.getState()
    expect(state.workspaces[state.activeVersion].rootItemOrder?.crafts).toEqual([
      'bag',
      'potion',
      'hidden',
    ])
  })

  it('кнопки и поля цены не начинают перенос', async () => {
    const user = userEvent.setup()
    render(<ItemsPage section="crafts" />)
    await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
    const input = screen.getByRole('spinbutton', {
      name: /Цена продажи.*Лечебное зелье.*Золото/i,
    })
    const row = input.closest('article')
    if (!row) throw new Error('Нет строки')
    pointerAt('pointerDown', input, 130)
    pointerAt('pointerMove', document, 200)
    pointerAt('pointerUp', document, 200)
    expect(row.closest('.item-list')).not.toHaveClass('item-list--dragging')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() }
    fireEvent.mouseDown(input, { button: 0 })
    expect(fireEvent.dragStart(row, { dataTransfer })).toBe(false)
    expect(dataTransfer.setData).not.toHaveBeenCalled()
  })
})
