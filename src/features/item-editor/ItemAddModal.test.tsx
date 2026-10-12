import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import tbcTooltip from '../wowhead-import/fixtures/tbc-44391.json'
import tbcEn from '../wowhead-import/fixtures/tbc-44391-en.json'
import { ItemAddModal } from './ItemAddModal'

const recipeUrl = 'https://wowhead.com/tbc/ru/spell=44391'
const urlLabel = 'Ссылка на рецепт Wowhead Classic, TBC или Forever'

function ModalHarness() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true)
        }}
      >
        Добавить
      </button>
      {isOpen ? (
        <ItemAddModal
          gameVersion="tbc"
          title="Добавить крафт"
          defaultSection="crafts"
          catalog={{}}
          onSave={vi.fn()}
          onImport={vi.fn()}
          onAddReferenceItem={vi.fn()}
          onSuccess={vi.fn()}
          onClose={() => {
            setIsOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  render(<ModalHarness />)
  await user.click(screen.getByRole('button', { name: 'Добавить' }))
  await user.click(screen.getByRole('button', { name: 'Импорт из Wowhead' }))
}

describe('ItemAddModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('сохраняет черновики обеих вкладок и сбрасывает их после закрытия', async () => {
    const user = userEvent.setup()
    await openModal(user)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByLabelText(urlLabel)).toBeVisible()
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(urlLabel), recipeUrl)
    await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
    await user.type(screen.getByLabelText('Название RU'), 'Мой крафт')
    await user.type(screen.getByLabelText(/URL иконки/), 'inv_ingot_10')
    await user.click(screen.getByRole('checkbox', { name: 'Реагенты' }))
    await user.click(screen.getByRole('button', { name: 'Импорт из Wowhead' }))
    expect(screen.getByLabelText(urlLabel)).toHaveValue(recipeUrl)
    expect(screen.getByLabelText('Название RU')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
    expect(screen.getByLabelText('Название RU')).toHaveValue('Мой крафт')
    expect(screen.getByLabelText(/URL иконки/)).toHaveValue('inv_ingot_10')
    expect(screen.getByRole('checkbox', { name: 'Реагенты' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Добавить' }))
    await user.click(screen.getByRole('button', { name: 'Импорт из Wowhead' }))
    expect(screen.getByLabelText(urlLabel)).toBeVisible()
    expect(screen.getByLabelText(urlLabel)).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
    expect(screen.getByLabelText('Название RU')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Реагенты' })).not.toBeChecked()
  })

  it('сохраняет загруженный рецепт, выход и профессию при переключении', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return Promise.resolve(
        url.includes('/spell/')
          ? Response.json(url.includes('/ru/') ? tbcTooltip : tbcEn)
          : new Response(null, { status: 404 }),
      )
    })
    const user = userEvent.setup()
    await openModal(user)
    await user.type(screen.getByLabelText(urlLabel), recipeUrl)
    await user.click(screen.getByRole('button', { name: 'Загрузить рецепт' }))
    await screen.findByRole('region', { name: 'Проверка рецепта' })
    await user.click(screen.getByRole('button', { name: 'Увеличить значение' }))
    await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
    await user.click(screen.getByRole('option', { name: 'Без профессии' }))
    await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
    await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Импорт из Wowhead' }))
    expect(screen.getByRole('region', { name: 'Проверка рецепта' })).toBeVisible()
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(6)
    expect(screen.getByRole('combobox', { name: 'Профессия' })).toHaveValue(
      'Без профессии',
    )

    const dialog = screen.getByRole('dialog')
    const closeButton = within(dialog).getByRole('button', { name: 'Закрыть' })
    within(dialog).getByRole('button', { name: 'Подтвердить импорт' }).focus()
    await user.tab()
    expect(closeButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Подтвердить импорт' })).toHaveFocus()
  })

  it('завершает загрузку в скрытой вкладке без переключения и перехвата фокуса', async () => {
    let resolveResponse: (response: Response) => void = () => {
      throw new Error('Запрос не начат')
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/spell/') && !url.includes('/ru/'))
        return Promise.resolve(Response.json(tbcEn))
      return url.includes('/spell/')
        ? new Promise<Response>((resolve) => {
            resolveResponse = resolve
          })
        : Promise.resolve(new Response(null, { status: 404 }))
    })
    const user = userEvent.setup()
    await openModal(user)
    await user.type(screen.getByLabelText(urlLabel), recipeUrl)
    await user.click(screen.getByRole('button', { name: 'Загрузить рецепт' }))
    await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
    await user.type(screen.getByLabelText('Название RU'), 'Черновик')

    await act(async () => {
      resolveResponse(Response.json(tbcTooltip))
      await Promise.resolve()
    })
    expect(screen.getByLabelText('Название RU')).toHaveFocus()
    expect(screen.getByLabelText('Название RU')).toHaveValue('Черновик')
    expect(
      screen.queryByRole('region', { name: 'Проверка рецепта' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Импорт из Wowhead' }))
    expect(screen.getByRole('region', { name: 'Проверка рецепта' })).toBeVisible()
    expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(5)
  })
})
