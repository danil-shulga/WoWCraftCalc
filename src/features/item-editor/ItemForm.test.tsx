import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Item } from '../../domain/item.types'
import { ItemForm } from './ItemForm'

const item: Item = {
  id: 'ore',
  name: 'Руда',
  iconUrl: '',
  sections: ['reagents'],
  purchasePriceCopper: 10_203,
  salePriceCopper: 4,
  recipe: null,
}

describe('ItemForm', () => {
  it.each(['0', '-1', '1.5', '1e3', 'abc', '9007199254740992'])(
    'отклоняет некорректный игровой ID %s',
    async (id) => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(
        <ItemForm
          initialItem={item}
          defaultSection="reagents"
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      )
      await user.type(screen.getByLabelText('ID предмета'), id)
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(onSave).not.toHaveBeenCalled()
      expect(
        screen.getByText('ID предмета должен быть положительным целым числом'),
      ).toBeVisible()
    },
  )

  it('позволяет показывать предмет только в распылении', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <ItemForm
        initialItem={item}
        defaultSection="reagents"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Распыление' }))
    await user.click(screen.getByRole('checkbox', { name: 'Реагенты' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ sections: ['disenchanting'] }),
    )
  })
  it.each(['RU', 'EN'])('сохраняет одно заполненное название %s', async (language) => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<ItemForm defaultSection="reagents" onSave={onSave} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText(`Название ${language}`), '  Jade  ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jade',
        names: language === 'RU' ? { ru: 'Jade', en: null } : { ru: null, en: 'Jade' },
      }),
    )
  })

  it('отклоняет два пустых названия', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<ItemForm defaultSection="reagents" onSave={onSave} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Название EN'), '   ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Введите название предмета')).toBeVisible()
  })

  it('создаёт предмет с доступными полями цены без чекбоксов и неизвестными нулевыми ценами', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<ItemForm defaultSection="reagents" onSave={onSave} onCancel={vi.fn()} />)

    expect(
      screen.queryByRole('checkbox', { name: 'Указать цену' }),
    ).not.toBeInTheDocument()
    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input).toBeEnabled()
      expect(input).toHaveValue(0)
    }
    await user.type(screen.getByLabelText('Название RU'), item.name)
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSave).toHaveBeenCalledWith({
      name: item.name,
      names: { ru: item.name, en: null },
      iconUrl: '',
      source: undefined,
      sections: ['reagents'],
      purchasePriceCopper: null,
      salePriceCopper: null,
    })
  })

  it('сохраняет введённые монеты и сбрасывает цену в неизвестную при обнулении', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <ItemForm
        initialItem={item}
        defaultSection="reagents"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )
    const purchase = within(
      screen.getByRole('group', { name: 'Цена покупки за единицу' }),
    )
    expect(purchase.getByLabelText('золото')).toHaveValue(1)
    expect(purchase.getByLabelText('серебро')).toHaveValue(2)
    expect(purchase.getByLabelText('медь')).toHaveValue(3)
    for (const label of ['золото', 'серебро', 'медь']) {
      await user.clear(purchase.getByLabelText(label))
      await user.type(purchase.getByLabelText(label), '0')
    }
    const sale = within(screen.getByRole('group', { name: 'Цена продажи за единицу' }))
    await user.type(sale.getByLabelText('золото'), '2')
    await user.type(sale.getByLabelText('серебро'), '5')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        purchasePriceCopper: null,
        salePriceCopper: 20_504,
      }),
    )
  })

  it('сохраняет существующие нулевые цены как ноль без изменения полей', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <ItemForm
        initialItem={{ ...item, purchasePriceCopper: 0, salePriceCopper: 0 }}
        defaultSection="reagents"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        purchasePriceCopper: 0,
        salePriceCopper: 0,
      }),
    )
  })
})
