import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal/Modal'
import { SearchableSelect } from './SearchableSelect'

const options = [
  {
    value: 'ore',
    label: 'Руда',
    secondaryLabel: 'Ore',
    item: {
      name: 'Руда',
      names: { ru: 'Руда', en: 'Ore' },
      iconUrl: '/ore.jpg',
    },
  },
]

function Example() {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
        }}
      >
        Открыть
      </button>
      {open ? (
        <Modal
          title="Рецепт"
          onClose={() => {
            setOpen(false)
          }}
        >
          <SearchableSelect
            label="Реагент"
            options={options}
            value={value}
            onChange={setValue}
          />
          <button>Добавить</button>
        </Modal>
      ) : null}
    </>
  )
}

describe('SearchableSelect', () => {
  it('показывает иконки в портале и поле, сохраняет выбор, Tab, Escape и возврат фокуса в диалоге', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    const field = screen.getByRole('combobox', { name: 'Реагент' })
    await user.click(field)
    const option = screen.getByRole('option', { name: 'Руда' })
    expect(screen.getByRole('listbox').parentElement).toBe(document.body)
    expect(within(option).getByTitle('Иконка: Руда')).toHaveAttribute('src', '/ore.jpg')
    expect(option).toHaveTextContent('Ore')
    await user.keyboard('{Enter}')
    expect(field).toHaveValue('Руда')
    expect(screen.getByTitle('Иконка: Руда')).toHaveAttribute('src', '/ore.jpg')
    await user.type(field, ' другая')
    expect(screen.queryByTitle('Иконка: Руда')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Добавить' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Открыть' })).toHaveFocus()
  })

  it('сохраняет обычный текстовый вариант без иконок', async () => {
    const user = userEvent.setup()
    render(
      <SearchableSelect
        label="Профессия"
        options={[{ value: 'mining', label: 'Горное дело' }]}
        value=""
        onChange={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'Горное дело' })).toBeVisible()
    expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument()
  })
})
