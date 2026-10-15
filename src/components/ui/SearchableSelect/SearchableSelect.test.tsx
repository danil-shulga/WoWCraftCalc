import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

function finishClosing(element: HTMLElement) {
  fireEvent(
    element,
    Object.assign(new Event('animationend', { bubbles: true }), {
      animationName: 'select-close',
    }),
  )
}

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
  it.each([true, false])(
    'открывает заполненное поле без автоматического выделения текста (searchable=%s)',
    async (searchable) => {
      const user = userEvent.setup()
      render(
        <SearchableSelect
          label="Реагент"
          options={options}
          value="ore"
          searchable={searchable}
          onChange={vi.fn()}
        />,
      )
      const field = screen.getByRole<HTMLInputElement>('combobox')
      await user.click(field)
      expect(field).toHaveFocus()
      expect(field).toHaveValue('Руда')
      expect(field.selectionStart).toBe(field.selectionEnd)
      expect(screen.getByRole('listbox')).toBeVisible()
      await user.tab()
      await user.click(field)
      expect(field.selectionStart).toBe(field.selectionEnd)
      expect(screen.getByRole('listbox')).toBeVisible()
    },
  )

  it.each([false, true])('игнорирует клик по подписи (disabled=%s)', async (disabled) => {
    const user = userEvent.setup()
    render(
      <>
        <button>Другое действие</button>
        <SearchableSelect
          label="Реагент"
          options={options}
          value="ore"
          disabled={disabled}
          onChange={vi.fn()}
        />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Другое действие' })
    await user.click(button)
    await user.click(screen.getByText('Реагент', { selector: 'label' }))
    expect(button).toHaveFocus()
    expect(screen.getByRole('combobox')).not.toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

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
    finishClosing(screen.getByRole('listbox', { hidden: true }))
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

  it('закрывает список после собственной анимации, сохраняя немедленный выбор и фокус', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SearchableSelect label="Реагент" options={options} value="" onChange={onChange} />,
    )
    const field = screen.getByRole('combobox')
    await user.click(field)
    const list = screen.getByRole('listbox')
    const option = screen.getByRole('option')
    expect(list).toHaveAttribute('data-state', 'open')
    await user.click(option)
    expect(onChange).toHaveBeenCalledExactlyOnceWith('ore')
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute('aria-expanded', 'false')
    expect(list).toHaveAttribute('data-state', 'closed')
    expect(list).toHaveAttribute('inert')
    expect(list).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    finishClosing(option)
    expect(list).toBeInTheDocument()
    finishClosing(list)
    expect(list).not.toBeInTheDocument()
  })

  it('отменяет закрытие при быстром повторном открытии, затем закрывает по Tab', async () => {
    const user = userEvent.setup()
    render(
      <SearchableSelect label="Реагент" options={options} value="" onChange={vi.fn()} />,
    )
    const field = screen.getByRole('combobox')
    await user.click(field)
    const list = screen.getByRole('listbox')
    await user.keyboard('{Escape}')
    expect(list).toHaveAttribute('data-state', 'closed')
    await user.click(field)
    expect(screen.getByRole('listbox')).toBe(list)
    expect(list).not.toHaveAttribute('inert')
    finishClosing(list)
    expect(list).toBeInTheDocument()
    await user.tab()
    expect(list).toHaveAttribute('data-state', 'closed')
    finishClosing(list)
    expect(list).not.toBeInTheDocument()
  })
})
