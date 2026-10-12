import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ItemCatalog } from '../domain/item.types'
import { createEmptyCraftData } from '../store/persistence'
import { useCraftStore } from '../store/useCraftStore'
import { referenceFixture } from '../test/reference-fixture'
import { parseReferenceDatabase } from '../domain/reference-database.schema'
import { buildReferenceDatabaseIndex } from '../domain/reference-database-index'
import * as loader from '../features/reference-database/reference-database-loader'
import { App } from './App'

const catalog: ItemCatalog = {
  cloth: {
    id: 'cloth',
    name: 'Ткань Forever',
    names: { ru: 'Ткань Forever', en: null },
    iconUrl: '',
    source: { wowheadItemId: 1529 },
    sections: ['reagents'],
    purchasePriceCopper: 10,
    salePriceCopper: null,
    recipe: null,
  },
  bolt: {
    id: 'bolt',
    name: 'Рулон Forever',
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 100,
    recipe: {
      outputQuantity: 1,
      profession: 'tailoring',
      reagents: [{ itemId: 'cloth', quantity: 2, acquisition: 'buy' }],
    },
  },
}

const cloth = catalog.cloth
if (!cloth) throw new Error('Нет ткани')

beforeEach(() => {
  const data = createEmptyCraftData()
  data.workspaces.forever.items = catalog
  data.workspaces.tbc.items = {
    cloth: {
      ...cloth,
      name: 'Ткань TBC',
      names: { ru: 'Ткань TBC', en: null },
    },
  }
  useCraftStore.getState().replaceData(data)
  vi.spyOn(loader, 'loadReferenceDatabase').mockImplementation((version = 'forever') =>
    Promise.resolve(
      buildReferenceDatabaseIndex(parseReferenceDatabase(referenceFixture(version))),
    ),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
})

async function chooseFromLogo(user: ReturnType<typeof userEvent.setup>, version: string) {
  await user.click(screen.getByRole('button', { name: /Выбрать версию игры:/ }))
  await user.click(
    within(screen.getByRole('group', { name: 'Версия игры' })).getByRole('button', {
      name: version,
    }),
  )
}

it('синхронизирует настройки и логотип, сохраняет раздел и свои каталоги', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Реагенты' }))
  await user.type(screen.getByRole('searchbox'), 'forever')
  await chooseFromLogo(user, 'TBC')
  expect(document.documentElement).toHaveAttribute('data-game-version', 'tbc')
  expect(screen.getByRole('heading', { name: 'Реагенты' })).toBeVisible()
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getByText('Ткань TBC')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Настройки' }))
  const settings = within(screen.getByRole('dialog', { name: 'Настройки' }))
  expect(settings.getByRole('button', { name: 'TBC' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(settings.getByRole('checkbox', { name: /Ювелирное дело/ })).toBeVisible()
  await user.click(settings.getByRole('button', { name: 'Classic' }))
  expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeVisible()
  expect(
    settings.queryByRole('checkbox', { name: /Ювелирное дело/ }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Выбрать версию игры: Classic' }),
  ).toBeVisible()
  await user.click(settings.getByRole('button', { name: 'Forever' }))
  await user.click(settings.getByRole('button', { name: 'Готово' }))
  expect(screen.getByText('Ткань Forever')).toBeVisible()
})

it('выбор активной версии сохраняет поиск и раскрытие без подтверждения', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Развернуть рецепт' }))
  await user.type(screen.getByRole('searchbox'), 'Рулон')
  await chooseFromLogo(user, 'Forever')
  expect(screen.getByRole('searchbox')).toHaveValue('Рулон')
  expect(screen.getByRole('button', { name: 'Свернуть рецепт' })).toBeVisible()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('отмена и Escape оставляют черновик цен, подтверждение очищает его', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Редактировать цены' }))
  const field = screen.getByRole('spinbutton', { name: /золото$/ })
  fireEvent.change(field, { target: { value: '3' } })
  await chooseFromLogo(user, 'TBC')
  expect(screen.getByRole('dialog', { name: 'Переключить версию игры?' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(field).toHaveValue(3)
  expect(useCraftStore.getState().activeVersion).toBe('forever')
  await chooseFromLogo(user, 'TBC')
  await user.click(screen.getByRole('button', { name: 'Отменить переключение' }))
  expect(field).toHaveValue(3)
  await chooseFromLogo(user, 'TBC')
  await user.click(
    screen.getByRole('button', { name: 'Переключить и отбросить изменения' }),
  )
  expect(screen.queryByRole('button', { name: 'Сохранить все' })).not.toBeInTheDocument()
  expect(useCraftStore.getState().workspaces.forever.items.bolt?.salePriceCopper).toBe(
    100,
  )
})

it('защищает ручную форму и возвращает фокус при отмене поверх диалога', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '+ Добавить крафт' }))
  await user.click(screen.getByRole('button', { name: 'Добавить вручную' }))
  await user.type(screen.getByLabelText('Название RU'), 'Черновик')
  await chooseFromLogo(user, 'Classic')
  const confirm = within(screen.getByRole('dialog', { name: 'Переключить версию игры?' }))
  confirm.getByRole('button', { name: 'Переключить и отбросить изменения' }).focus()
  await user.tab()
  expect(confirm.getByRole('button', { name: 'Закрыть' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.getByRole('dialog', { name: 'Добавить крафт' })).toBeVisible()
  expect(screen.getByLabelText('Название RU')).toHaveValue('Черновик')
  expect(screen.getByLabelText('Название RU')).toHaveFocus()
  await chooseFromLogo(user, 'Classic')
  await user.click(
    screen.getByRole('button', { name: 'Переключить и отбросить изменения' }),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useCraftStore.getState().activeVersion).toBe('classic')
})

it('защищает изменённый рецепт и выбранный предпросмотр базы', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: /Редактировать Рулон/ }))
  await user.click(screen.getByRole('button', { name: 'Рецепт' }))
  fireEvent.change(screen.getByLabelText('Предметов за один крафт'), {
    target: { value: '2' },
  })
  await chooseFromLogo(user, 'TBC')
  await user.click(screen.getByRole('button', { name: 'Отменить переключение' }))
  expect(screen.getByLabelText('Предметов за один крафт')).toHaveValue(2)
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: '+ Добавить крафт' }))
  await user.click(await screen.findByRole('button', { name: /Венец Грёз/ }))
  await chooseFromLogo(user, 'TBC')
  expect(screen.getByRole('dialog', { name: 'Переключить версию игры?' })).toBeVisible()
})

it('защищает загруженные названия, сохраняет настройки открытыми и игнорирует поздний ответ', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
    Promise.resolve(
      Response.json({
        name: (typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.href
            : url.url
        ).includes('/ru/')
          ? 'Нефрит'
          : 'Jade',
        tooltip: '<p>Item</p>',
        icon: '',
      }),
    ),
  )
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Настройки' }))
  await user.click(screen.getByRole('button', { name: 'Загрузить недостающие названия' }))
  await screen.findByRole('list', { name: 'Загруженные названия' })
  await user.click(screen.getByRole('button', { name: 'TBC' }))
  await user.click(screen.getByRole('button', { name: 'Отменить переключение' }))
  expect(screen.getByRole('list', { name: 'Загруженные названия' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'TBC' }))
  await user.click(
    screen.getByRole('button', { name: 'Переключить и отбросить изменения' }),
  )
  expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeVisible()
  expect(
    screen.queryByRole('list', { name: 'Загруженные названия' }),
  ).not.toBeInTheDocument()
  let resolve: (response: Response) => void = () => {
    throw new Error('Нет запроса')
  }
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await user.click(screen.getByRole('button', { name: 'Загрузить недостающие названия' }))
  await user.click(screen.getByRole('button', { name: 'Forever' }))
  await user.click(screen.getByRole('button', { name: 'TBC' }))
  await act(async () => {
    resolve(Response.json({ name: 'Late', tooltip: '<p>Item</p>', icon: '' }))
    await Promise.resolve()
  })
  expect(
    screen.queryByRole('list', { name: 'Загруженные названия' }),
  ).not.toBeInTheDocument()
})

it('логотип управляется клавиатурой, Escape возвращает фокус', async () => {
  const user = userEvent.setup()
  render(<App />)
  const logo = screen.getByRole('button', { name: /Выбрать версию игры:/ })
  logo.focus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Forever' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(logo).toHaveFocus()
  await user.keyboard('{Enter}')
  await user.tab()
  await user.keyboard(' ')
  expect(useCraftStore.getState().activeVersion).toBe('tbc')
})
