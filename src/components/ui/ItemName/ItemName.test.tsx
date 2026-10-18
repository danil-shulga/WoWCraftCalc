import { act, render, screen } from '@testing-library/react'
import { ItemName } from './ItemName'

describe('двойное название предмета', () => {
  const item = { name: 'Нефрит', names: { ru: 'Нефрит', en: 'Jade' } }

  it('измеряет перенос по изменению видимого текста, а не ссылки на предмет', async () => {
    const measure = vi.spyOn(document, 'createRange')
    try {
      const { rerender } = render(<ItemName item={item} language="ru" fitWrappedText />)
      await act(() => Promise.resolve())
      const initialCount = measure.mock.calls.length
      expect(initialCount).toBeGreaterThan(0)
      rerender(
        <ItemName
          item={{ ...item, names: { ...item.names } }}
          language="ru"
          fitWrappedText
        />,
      )
      expect(measure).toHaveBeenCalledTimes(initialCount)
      rerender(
        <ItemName
          item={{ ...item, name: 'Изменено только запасное имя' }}
          language="ru"
          fitWrappedText
        />,
      )
      expect(measure).toHaveBeenCalledTimes(initialCount)
      rerender(<ItemName item={item} language="en" fitWrappedText />)
      await act(() => Promise.resolve())
      expect(measure.mock.calls.length).toBeGreaterThan(initialCount)
      const afterLanguage = measure.mock.calls.length
      rerender(
        <ItemName item={item} language="en" showSecondaryName={false} fitWrappedText />,
      )
      await act(() => Promise.resolve())
      expect(measure.mock.calls.length).toBeGreaterThan(afterLanguage)
    } finally {
      measure.mockRestore()
    }
  })

  it('не повторяет измерения при изменении только высоты и отключает наблюдатель', async () => {
    let callback: ResizeObserverCallback | undefined
    const disconnect = vi.fn()
    class TestResizeObserver {
      constructor(onResize: ResizeObserverCallback) {
        callback = onResize
      }
      observe = vi.fn()
      disconnect = disconnect
      unobserve = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const measure = vi.spyOn(document, 'createRange')
    try {
      const { container, unmount } = render(
        <div>
          <div>
            <ItemName item={item} language="ru" fitWrappedText />
          </div>
        </div>,
      )
      const identity = container.firstElementChild
      if (!(identity instanceof HTMLElement) || !callback)
        throw new Error('Нет наблюдателя')
      let availableWidth = 300
      vi.spyOn(identity, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, 0, availableWidth, 40),
      )
      await act(() => Promise.resolve())
      const resize = async (width: number, height: number) => {
        availableWidth = width
        const entry: ResizeObserverEntry = {
          target: identity,
          contentRect: new DOMRect(0, 0, width, height),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        }
        await act(async () => {
          if (!callback) throw new Error('Нет наблюдателя')
          callback([entry], { observe: vi.fn(), unobserve: vi.fn(), disconnect })
          await Promise.resolve()
        })
      }
      await resize(300, 40)
      const firstWidth = measure.mock.calls.length
      await resize(300, 80)
      expect(measure).toHaveBeenCalledTimes(firstWidth)
      await resize(250, 80)
      expect(measure.mock.calls.length).toBeGreaterThan(firstWidth)
      unmount()
      expect(disconnect).toHaveBeenCalledOnce()
    } finally {
      measure.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('читает геометрию всех новых названий до записи их итоговой ширины', async () => {
    const createRange = document.createRange.bind(document)
    let names: HTMLElement[] = []
    const widthsAtRead: string[][] = []
    const measure = vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange()
      Object.defineProperty(range, 'getClientRects', {
        value: () => {
          widthsAtRead.push(names.map((name) => name.style.width))
          return [new DOMRect(0, 0, 180, 20)]
        },
      })
      return range
    })
    try {
      const { container } = render(
        <>
          <ItemName item={item} language="ru" fitWrappedText />
          <ItemName item={item} language="en" fitWrappedText />
        </>,
      )
      names = Array.from(container.querySelectorAll<HTMLElement>('.item-name'))
      await act(() => Promise.resolve())
      expect(widthsAtRead).toHaveLength(4)
      expect(widthsAtRead.every((widths) => widths.every((width) => width === ''))).toBe(
        true,
      )
      for (const name of names) expect(name).toHaveStyle({ width: '180px' })
    } finally {
      measure.mockRestore()
    }
  })

  it('отменяет ожидающую подгонку при размонтировании', async () => {
    const measure = vi.spyOn(document, 'createRange')
    try {
      const view = render(<ItemName item={item} language="ru" fitWrappedText />)
      view.unmount()
      await act(() => Promise.resolve())
      expect(measure).not.toHaveBeenCalled()
    } finally {
      measure.mockRestore()
    }
  })

  it.each(['ru', 'en'] as const)(
    'показывает выбранный язык первым при выборе %s',
    (language) => {
      const { container } = render(<ItemName item={item} language={language} />)
      expect(container.querySelector('.item-name > span')).toHaveTextContent(
        language === 'ru' ? 'Нефрит' : 'Jade',
      )
      expect(container.querySelector('small')).toHaveTextContent(
        language === 'ru' ? 'Jade' : 'Нефрит',
      )
      expect(container).not.toHaveTextContent(/RU:|EN:/)
    },
  )

  it('не повторяет доступное имя, когда перевода нет или названия совпадают', () => {
    const { container, rerender } = render(
      <ItemName item={{ ...item, names: { ru: null, en: 'Jade' } }} language="ru" />,
    )
    expect(screen.getByText('Jade')).toBeVisible()
    expect(container.querySelector('small')).toBeNull()
    rerender(
      <ItemName item={{ ...item, names: { ru: 'Jade', en: 'Jade' } }} language="en" />,
    )
    expect(container.querySelector('small')).toBeNull()
    rerender(<ItemName item={{ name: 'Старое имя' }} language="en" />)
    expect(screen.getByText('Старое имя')).toBeVisible()
    expect(container.querySelector('small')).toBeNull()
  })
})
