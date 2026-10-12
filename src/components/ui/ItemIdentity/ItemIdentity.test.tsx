import { fireEvent, render, screen } from '@testing-library/react'
import { ItemIdentity } from './ItemIdentity'

const item = {
  name: 'Нефрит',
  names: { ru: 'Нефрит', en: 'Jade' },
  iconUrl: 'https://example.com/jade.jpg',
}

describe('иконка и название предмета', () => {
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
