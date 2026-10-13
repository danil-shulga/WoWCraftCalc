import { fireEvent, render, screen } from '@testing-library/react'
import { ItemIdentity } from './ItemIdentity'

const item = {
  name: 'Нефрит',
  names: { ru: 'Нефрит', en: 'Jade' },
  iconUrl: 'https://example.com/jade.jpg',
}

describe('иконка и название предмета', () => {
  it('сжимает название до самой широкой видимой строки с учётом перевода', () => {
    const createRange = document.createRange.bind(document)
    const spy = vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange()
      Object.defineProperty(range, 'getClientRects', {
        value: () =>
          range.startContainer.textContent === 'Jade'
            ? [new DOMRect(0, 0, 180, 20)]
            : [new DOMRect(0, 0, 160, 20), new DOMRect(0, 20, 100, 20)],
      })
      return range
    })
    try {
      const { container } = render(
        <ItemIdentity item={item} language="ru" fitWrappedName>
          <span>× 8</span>
        </ItemIdentity>,
      )
      expect(container.querySelector('.item-name')).toHaveStyle({ width: '180px' })
    } finally {
      spy.mockRestore()
    }
  })

  it('сохраняет количество рядом с блоком названия и перевода', () => {
    const { container } = render(
      <ItemIdentity item={item} language="ru" nameAs="strong" fitWrappedName>
        <span>× 8</span>
      </ItemIdentity>,
    )
    expect(container.querySelector('.item-name > strong')).toHaveTextContent('Нефрит')
    expect(container.querySelector('.item-name')).not.toHaveTextContent('× 8')
    expect(screen.getByText('× 8').parentElement).toBe(
      container.querySelector('.item-identity__text'),
    )
    expect(container.querySelector('.item-name__secondary')).toHaveTextContent('Jade')
    expect(container.querySelector('.item-name__secondary')).not.toHaveTextContent('× 8')
  })

  it('меняет язык и сохраняет заглушку при ошибке иконки', () => {
    const { rerender } = render(<ItemIdentity item={item} language="ru" nameAs="h3" />)
    expect(screen.getByRole('heading')).toHaveTextContent('Нефрит')
    expect(screen.getByText('Jade')).toBeVisible()
    const icon = screen.getByTitle('Иконка: Нефрит')
    fireEvent.error(icon)
    expect(icon.getAttribute('src')).toMatch(/item-placeholder\.svg$/)
    rerender(<ItemIdentity item={item} language="en" nameAs="h3" />)
    expect(screen.getByRole('heading')).toHaveTextContent('Jade')
    expect(screen.getByText('Нефрит')).toBeVisible()
  })

  it('поддерживает скрытие частей и единственное доступное название', () => {
    const { container, rerender } = render(
      <ItemIdentity
        item={item}
        language="ru"
        showIcon={false}
        showSecondaryName={false}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByText('Jade')).toBeNull()
    rerender(
      <ItemIdentity
        item={{ name: 'Запасное имя', names: { ru: null, en: 'Jade' }, iconUrl: '' }}
        language="ru"
      />,
    )
    expect(screen.getByText('Jade')).toBeVisible()
    expect(container.querySelector('small')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(
      /item-placeholder\.svg$/,
    )
  })
})
