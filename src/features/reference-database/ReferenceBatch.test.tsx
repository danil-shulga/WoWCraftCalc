import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildReferenceDatabaseIndex } from '../../domain/reference-database-index'
import { parseReferenceDatabase } from '../../domain/reference-database.schema'
import type { ReferenceItem } from '../../domain/reference-database.types'
import type { ReferenceImportEntry } from '../../domain/recipe-import.types'
import { ItemsPage } from '../../pages/ItemsPage'
import { useCraftStore } from '../../store/useCraftStore'
import { referenceFixture } from '../../test/reference-fixture'
import { ReferenceDatabaseForm } from './ReferenceDatabaseForm'
import * as loader from './reference-database-loader'

function batchFixture(count = 2) {
  const fixture = referenceFixture()
  const items: Record<string, ReferenceItem> = { ...fixture.items }
  const recipes: Record<string, (typeof fixture.recipes)['10']> = { ...fixture.recipes }
  for (let i = 1; i < count; i++) {
    const id = i + 2
    const spellId = i + 10
    items[String(id)] = {
      ...fixture.items['1'],
      itemId: id,
      names: { ru: `Венец ${String(id)}`, en: `Crown ${String(id)}` },
      recipeSpellIds: [spellId],
    }
    recipes[String(spellId)] = { ...fixture.recipes['10'], spellId, productItemId: id }
  }
  return parseReferenceDatabase({ ...fixture, items, recipes })
}

function renderBatch() {
  const state = useCraftStore.getState()
  const expected = { version: state.activeVersion, revision: state.workspaceRevision }
  const onImportBatch = vi.fn((entries: readonly ReferenceImportEntry[]) =>
    state.importReferenceBatch(entries, expected, 'crafts'),
  )
  const onClose = vi.fn()
  const onSuccess = vi.fn()
  render(
    <ReferenceDatabaseForm
      catalog={{}}
      section="crafts"
      itemLanguage="ru"
      isActive
      onImportBatch={onImportBatch}
      onSuccess={onSuccess}
      onClose={onClose}
    />,
  )
  return { onImportBatch, onClose, onSuccess }
}
const chosen = () => within(screen.getByRole('region', { name: 'Выбранные предметы' }))
const output = () => screen.getByLabelText('Предметов за один крафт')
const catalog = () => useCraftStore.getState().workspaces.forever.items

beforeEach(() => {
  useCraftStore.getState().resetData()
  vi.spyOn(loader, 'loadReferenceDatabase').mockResolvedValue(
    buildReferenceDatabaseIndex(batchFixture()),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('использует один набор и одну кнопку для одного и нескольких предметов с независимым выходом', async () => {
  const user = userEvent.setup()
  const { onImportBatch, onClose, onSuccess } = renderBatch()
  expect(
    await screen.findByRole('button', { name: 'Добавить выбранные (0)' }),
  ).toBeDisabled()
  await user.click(screen.getByRole('button', { name: /^Венец Грёз/ }))
  fireEvent.change(output(), { target: { value: '4' } })
  expect(screen.getByRole('button', { name: 'Добавить выбранные (1)' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: /^Венец 3/ }))
  fireEvent.change(output(), { target: { value: '7' } })
  const rows = chosen().getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Венец 3')
  expect(rows[1]).toHaveTextContent('Венец Грёз')
  await user.click(chosen().getByRole('button', { name: /^Венец Грёз/ }))
  expect(output()).toHaveValue(4)
  await user.click(chosen().getByRole('button', { name: /^Венец 3/ }))
  expect(output()).toHaveValue(7)
  expect(catalog()).toEqual({})
  await user.click(screen.getByRole('button', { name: 'Добавить выбранные (2)' }))
  expect(onImportBatch).toHaveBeenCalledOnce()
  expect(onImportBatch.mock.calls[0]?.[0]).toMatchObject([
    { kind: 'recipe', data: { outputQuantity: 7 } },
    { kind: 'recipe', data: { outputQuantity: 4 } },
  ])
  expect(Object.keys(catalog())).toHaveLength(3)
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSuccess).toHaveBeenCalledWith(expect.stringContaining('добавлено предметов 3'))
})

it('сохраняет набор, выход и альтернативу при смене страницы, поиска и профессии', async () => {
  const database = batchFixture(55)
  const original = database.recipes['10']
  const item = database.items['1']
  if (!original || !item) throw new Error('Нет фикстуры')
  item.recipeSpellIds.push(1000)
  database.recipes['1000'] = {
    ...original,
    reagents: [{ itemId: 2, quantity: 6 }],
    spellId: 1000,
    output: { ...original.output, quantity: 8 },
  }
  vi.mocked(loader.loadReferenceDatabase).mockResolvedValue(
    buildReferenceDatabaseIndex(database),
  )
  const user = userEvent.setup()
  const { onImportBatch } = renderBatch()
  await user.type(await screen.findByRole('searchbox'), 'Dream Crown')
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  await user.click(screen.getByRole('combobox', { name: 'Рецепт' }))
  const alternatives = screen.getAllByRole('option', { name: /Портняжное дело/ })
  const alternative = alternatives[1]
  if (!alternative) throw new Error('Нет альтернативы')
  await user.click(alternative)
  fireEvent.change(output(), { target: { value: '9' } })
  await user.clear(screen.getByRole('searchbox'))
  await user.click(screen.getByRole('button', { name: 'Далее' }))
  const results = within(screen.getByRole('group', { name: 'Результаты поиска в базе' }))
  const other = results.getAllByRole('button')[0]
  if (!other) throw new Error('Нет второй страницы')
  await user.click(other)
  await user.type(screen.getByRole('searchbox'), 'Cloth')
  await user.click(screen.getByRole('combobox', { name: 'Профессия' }))
  await user.click(screen.getByRole('option', { name: 'Алхимия (Alchemy)' }))
  expect(chosen().getAllByRole('listitem')).toHaveLength(2)
  await user.click(chosen().getByRole('button', { name: /^Венец Грёз/ }))
  expect(output()).toHaveValue(9)
  await user.click(screen.getByRole('button', { name: 'Добавить выбранные (2)' }))
  expect(
    onImportBatch.mock.calls[0]?.[0].find(
      (entry) => entry.kind === 'recipe' && entry.data.product.wowheadItemId === 1,
    ),
  ).toMatchObject({
    kind: 'recipe',
    data: { outputQuantity: 9, reagents: [{ quantity: 6 }] },
  })
  expect(Object.keys(catalog())).toHaveLength(3)
})

it('выбирает и снимает выбор кликами по предмету, поддерживает клавиатуру без отдельного флажка', async () => {
  const user = userEvent.setup()
  renderBatch()
  const result = await screen.findByRole('button', { name: /^Венец Грёз/ })
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await user.click(result)
  expect(result).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('region', { name: 'Предпросмотр из базы' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Добавить выбранные (1)' })).toBeEnabled()
  await user.click(result)
  expect(result).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Добавить выбранные (0)' })).toBeDisabled()
  result.focus()
  await user.keyboard('{Enter}')
  expect(result).toHaveAttribute('aria-pressed', 'true')
  await user.keyboard(' ')
  expect(result).toHaveAttribute('aria-pressed', 'false')
})

it('отменяет весь набор, не изменяя каталог', async () => {
  const user = userEvent.setup()
  const before = useCraftStore.getState()
  const { onClose, onImportBatch } = renderBatch()
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  await user.click(screen.getByRole('button', { name: /^Венец 3/ }))
  await user.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onImportBatch).not.toHaveBeenCalled()
  expect(useCraftStore.getState()).toBe(before)
})

it('отклоняет неверную последнюю позицию, сохраняет остальные значения и позволяет повтор', async () => {
  const user = userEvent.setup()
  const { onClose, onImportBatch } = renderBatch()
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  fireEvent.change(output(), { target: { value: '5' } })
  await user.click(screen.getByRole('button', { name: /^Венец 3/ }))
  fireEvent.change(output(), { target: { value: '2.5' } })
  await user.click(screen.getByRole('button', { name: 'Добавить выбранные (2)' }))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Венец 3: Укажите положительное целое',
  )
  expect(onClose).not.toHaveBeenCalled()
  expect(onImportBatch).not.toHaveBeenCalled()
  expect(catalog()).toEqual({})
  fireEvent.change(output(), { target: { value: '3' } })
  onImportBatch.mockReturnValueOnce({
    success: false,
    error: 'Циклическая зависимость',
    sourceItemId: 1,
  })
  await user.click(screen.getByRole('button', { name: 'Добавить выбранные (2)' }))
  expect(output()).toHaveValue(5)
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Венец Грёз: Циклическая зависимость',
  )
  await user.click(screen.getByRole('button', { name: 'Добавить выбранные (2)' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(Object.keys(catalog())).toHaveLength(3)
})

it('удаляет последнюю строку по своему animationend и отменяет удаление при быстром повторном выборе', async () => {
  const user = userEvent.setup()
  renderBatch()
  const resultButton = await screen.findByRole('button', { name: /^Венец Грёз/ })
  await user.click(resultButton)
  fireEvent.change(output(), { target: { value: '6' } })
  const row = chosen().getByRole('listitem')
  await user.click(chosen().getByRole('button', { name: 'Убрать из выбора: Венец Грёз' }))
  expect(row).toHaveAttribute('inert')
  expect(row).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('button', { name: 'Добавить выбранные (0)' })).toBeDisabled()
  expect(chosen().getByRole('heading')).toHaveFocus()
  await user.click(resultButton)
  expect(output()).toHaveValue(6)
  expect(chosen().getAllByRole('listitem')).toEqual([row])
  expect(row).not.toHaveAttribute('inert')
  await user.click(chosen().getByRole('button', { name: 'Убрать из выбора: Венец Грёз' }))
  const child = row.querySelector('button')
  if (!child) throw new Error('Нет дочерней кнопки')
  fireEvent.animationEnd(child)
  expect(row).toBeInTheDocument()
  fireEvent.animationEnd(row)
  expect(row).not.toBeInTheDocument()
  expect(chosen().getByRole('heading')).toHaveFocus()
})

it('очищает набор сразу, сохраняет оболочку и убирает все уходящие строки', async () => {
  const user = userEvent.setup()
  renderBatch()
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  await user.click(screen.getByRole('button', { name: /^Венец 3/ }))
  const rows = chosen().getAllByRole('listitem')
  await user.click(chosen().getByRole('button', { name: 'Очистить выбор' }))
  expect(chosen().getByRole('list')).toBeInTheDocument()
  expect(
    screen.queryByRole('region', { name: 'Предпросмотр из базы' }),
  ).not.toBeInTheDocument()
  for (const row of rows) {
    expect(row).toHaveAttribute('inert')
    fireEvent.animationEnd(row)
  }
  expect(chosen().queryAllByRole('listitem', { hidden: true })).toHaveLength(0)
  expect(catalog()).toEqual({})
})

it('переключает предпросмотр и фокус на соседнюю позицию после удаления', async () => {
  const user = userEvent.setup()
  renderBatch()
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  await user.click(screen.getByRole('button', { name: /^Венец 3/ }))
  await user.click(chosen().getByRole('button', { name: 'Убрать из выбора: Венец 3' }))
  expect(chosen().getByRole('button', { name: /^Венец Грёз/ })).toHaveFocus()
  expect(
    within(screen.getByRole('region', { name: 'Предпросмотр из базы' })).getByRole(
      'heading',
    ),
  ).toHaveTextContent('Венец Грёз')
})

it('сохраняет набор и значения в скрытой вкладке источника и возвращает фокус после добавления', async () => {
  const user = userEvent.setup()
  render(<ItemsPage section="crafts" />)
  const opener = screen.getByRole('button', { name: '+ Добавить крафт' })
  await user.click(opener)
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  fireEvent.change(output(), { target: { value: '4' } })
  await user.click(screen.getByRole('button', { name: /^Венец 3/ }))
  await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
  expect(
    screen.queryByRole('region', { name: 'Выбранные предметы' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText('Выбрано: 2').closest('[hidden]')).toHaveAttribute('inert')
  await user.click(screen.getByRole('button', { name: 'Из базы' }))
  await user.click(chosen().getByRole('button', { name: /^Венец Грёз/ }))
  expect(output()).toHaveValue(4)
  await user.click(screen.getByRole('button', { name: 'Добавить выбранные (2)' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})

it('при reduced motion сохраняет прокрутку окна без кадров анимации', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  const frames = vi.spyOn(window, 'requestAnimationFrame')
  const user = userEvent.setup()
  const { container } = render(
    <div role="dialog">
      <ReferenceDatabaseForm
        catalog={{}}
        section="crafts"
        itemLanguage="ru"
        isActive
        onImportBatch={vi.fn()}
        onSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    </div>,
  )
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  expect(container.querySelector('[role="dialog"]')?.scrollTop).toBe(0)
  expect(frames).not.toHaveBeenCalled()
})

it('не показывает успех при ошибке записи хранилища', async () => {
  const user = userEvent.setup()
  const { onClose, onSuccess } = renderBatch()
  await user.click(await screen.findByRole('button', { name: /^Венец Грёз/ }))
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Хранилище заполнено')
  })
  await user.click(screen.getByRole('button', { name: 'Добавить выбранные (1)' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Хранилище заполнено')
  expect(onClose).not.toHaveBeenCalled()
  expect(onSuccess).not.toHaveBeenCalled()
})
