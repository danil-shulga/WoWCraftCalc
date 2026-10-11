import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ItemCatalog } from '../../domain/item.types'
import { ItemNamesLoader } from './ItemNamesLoader'
import { fetchMissingItemNames } from './item-names-loader'

const catalog: ItemCatalog = {
  jade: {
    id: 'jade',
    name: 'Мой нефрит',
    names: { ru: 'Мой нефрит', en: null },
    source: { wowheadItemId: 1529 },
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: 42,
    salePriceCopper: null,
    recipe: null,
  },
}

function mockNames() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
    Promise.resolve(
      Response.json({
        name: (typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
        ).includes('/ru/')
          ? 'Нефрит'
          : 'Jade',
        icon: '',
        tooltip: '<p>Item</p>',
      }),
    ),
  )
}

describe('заполнение недостающих названий', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('определяет версию старой записи и применяет названия только после проверки', async () => {
    const user = userEvent.setup()
    const mock = mockNames()
    const onApply = vi.fn(() => null)
    render(<ItemNamesLoader catalog={catalog} onApply={onApply} />)
    const button = screen.getByRole('button', { name: 'Загрузить недостающие названия' })
    expect(button).toBeEnabled()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(button)
    expect(
      await screen.findByRole('list', { name: 'Загруженные названия' }),
    ).toHaveTextContent('Мой нефритJade')
    expect(onApply).not.toHaveBeenCalled()
    expect(catalog.jade?.names).toEqual({ ru: 'Мой нефрит', en: null })
    expect(mock).toHaveBeenCalledWith(
      'https://nether.wowhead.com/classic/tooltip/item/1529',
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить названия' }))
    expect(onApply).toHaveBeenCalledWith([
      {
        itemId: 'jade',
        wowheadItemId: 1529,
        wowheadVersion: 'classic',
        names: { ru: 'Нефрит', en: 'Jade' },
      },
    ])
    expect(screen.getByRole('status')).toHaveTextContent('Названия обновлены: 1')
  })

  it('скрывает блок без автоматически загружаемых названий и после заполнения переводов', () => {
    const jade = catalog.jade
    if (jade === undefined) throw new Error('Нет тестового предмета')
    const { rerender } = render(
      <ItemNamesLoader catalog={catalog} onApply={vi.fn(() => null)} />,
    )
    expect(screen.getByText('Недостающие названия')).toBeVisible()
    rerender(
      <ItemNamesLoader
        catalog={{ jade: { ...jade, names: { ru: 'Нефрит', en: 'Jade' } } }}
        onApply={vi.fn(() => null)}
      />,
    )
    expect(screen.queryByText('Недостающие названия')).not.toBeInTheDocument()
    const manual = { ...jade }
    delete manual.source
    rerender(<ItemNamesLoader catalog={{ jade: manual }} onApply={vi.fn(() => null)} />)
    expect(screen.queryByText('Недостающие названия')).not.toBeInTheDocument()
    rerender(<ItemNamesLoader catalog={{}} onApply={vi.fn(() => null)} />)
    expect(screen.queryByText('Недостающие названия')).not.toBeInTheDocument()
  })

  it('не применяет частичные названия при ошибке второго языка', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ name: 'Нефрит', icon: '', tooltip: '<p>Item</p>' }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    const onApply = vi.fn(() => null)
    render(<ItemNamesLoader catalog={catalog} onApply={onApply} />)
    await user.click(
      screen.getByRole('button', { name: 'Загрузить недостающие названия' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('503')
    expect(onApply).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'Сохранить названия' }),
    ).not.toBeInTheDocument()
  })

  it('не применяет ответ после закрытия настроек', async () => {
    const user = userEvent.setup()
    const pendingResponses: ((response: Response) => void)[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve)
        }),
    )
    const onApply = vi.fn(() => null)
    const { unmount } = render(<ItemNamesLoader catalog={catalog} onApply={onApply} />)
    await user.click(
      screen.getByRole('button', { name: 'Загрузить недостающие названия' }),
    )
    unmount()
    await act(async () => {
      for (const resolveResponse of pendingResponses)
        resolveResponse(Response.json({ name: 'Jade', icon: '', tooltip: '<p>Item</p>' }))
      await Promise.resolve()
    })
    expect(onApply).not.toHaveBeenCalled()
  })

  it('переиспользует запросы общего ID и сохраняет версию известных источников', async () => {
    const mock = mockNames()
    const jade = catalog.jade
    if (jade === undefined) throw new Error('Нет тестового предмета')
    const known = {
      ...jade,
      source: { wowheadItemId: 1529, wowheadVersion: 'forever' as const },
    }
    const result = await fetchMissingItemNames({
      jade: known,
      second: { ...known, id: 'second' },
    })
    expect(result).toHaveLength(2)
    expect(result.every((update) => update.wowheadVersion === 'forever')).toBe(true)
    expect(mock).toHaveBeenCalledTimes(2)
  })
})
