import { render, screen } from '@testing-library/react'
import { ItemName } from './ItemName'

describe('двойное название предмета', () => {
  const item = { name: 'Нефрит', names: { ru: 'Нефрит', en: 'Jade' } }

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
