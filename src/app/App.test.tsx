import { testCraftData } from '../test/craft-state'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { PersistedCraftData } from '../domain/item.types'
import { createExportJson } from '../store/persistence'
import { useCraftStore, usePersistenceStatusStore } from '../store/useCraftStore'
import { App } from './App'

const storageKey = 'craft-calc-versioned-data'
const originalRecord = '{broken'
const emptyData: PersistedCraftData = testCraftData({
  items: {},
  ownedProfessions: [],
  currencyDisplay: 'icons',
  itemLanguage: 'ru',
})
const backupData: PersistedCraftData = testCraftData({
  items: {
    cloth: {
      id: 'cloth',
      name: 'Восстановленная ткань',
      names: { ru: null, en: null },
      iconUrl: '',
      sections: ['crafts'],
      purchasePriceCopper: 42,
      salePriceCopper: null,
      recipe: null,
    },
  },
  ownedProfessions: ['tailoring'],
  currencyDisplay: 'text',
  itemLanguage: 'ru',
})

describe('возврат наверх страницы', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each([false, true])(
    'поднимает страницу с учётом уменьшения анимации: %s',
    async (reducedMotion) => {
      const scrollTo = vi.fn()
      const matchMedia = vi.fn().mockReturnValue({ matches: reducedMotion })
      vi.stubGlobal('scrollTo', scrollTo)
      vi.stubGlobal('matchMedia', matchMedia)
      const user = userEvent.setup()
      render(<App />)

      await user.tab()
      screen.getByRole('button', { name: 'Наверх страницы' }).focus()
      await user.keyboard('{Enter}')

      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
      expect(scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: reducedMotion ? 'instant' : 'smooth',
      })
    },
  )
})

describe('восстановление сохранения в App', () => {
  beforeEach(async () => {
    localStorage.clear()
    useCraftStore.getState().replaceData(emptyData)
    localStorage.setItem(storageKey, originalRecord)
    await useCraftStore.persist.rehydrate()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useCraftStore.getState().replaceData(emptyData)
    localStorage.clear()
  })

  function setup() {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const input = container.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Поле импорта не найдено')
    }
    const upload = async (rawJson: string) => {
      const file = new File([rawJson], 'backup.json', { type: 'application/json' })
      Object.defineProperty(file, 'text', { value: () => Promise.resolve(rawJson) })
      await user.upload(input, file)
    }
    return { user, upload, input }
  }

  it('показывает приостановку сохранения после изменения настроек', async () => {
    const { user } = setup()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Автоматическое сохранение приостановлено',
    )
    await user.click(screen.getByRole('button', { name: 'Настройки' }))
    await user.click(screen.getByRole('radio', { name: /^Буквы/ }))
    expect(useCraftStore.getState().currencyDisplay).toBe('text')
    expect(localStorage.getItem(storageKey)).toBe(originalRecord)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'исходная запись в браузере защищена',
    )
  })

  it('сохраняет оригинал при неверном импорте и разрешает повторную попытку', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user, upload } = setup()
    await upload('{invalid')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Файл не является корректным JSON',
    )
    expect(confirm).not.toHaveBeenCalled()
    expect(localStorage.getItem(storageKey)).toBe(originalRecord)
    expect(screen.getByRole('alert')).toBeVisible()

    await upload(createExportJson(backupData))
    expect(screen.getByRole('dialog', { name: 'Импорт JSON' })).toBeVisible()
    expect(localStorage.getItem(storageKey)).toBe(originalRecord)
    expect(confirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Импортировать' }))
    expect(screen.getByRole('status')).toHaveTextContent('Данные успешно импортированы')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['импорт', 'сброс'])('сохраняет оригинал при отмене: %s', async (action) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user, upload } = setup()
    if (action === 'импорт') {
      await upload(createExportJson(backupData))
      expect(screen.getByRole('dialog')).toHaveTextContent('исходную запись')
      await user.click(screen.getByRole('button', { name: 'Отмена' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(confirm).not.toHaveBeenCalled()
    } else {
      await user.click(screen.getByRole('button', { name: 'Сбросить данные' }))
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('исходную запись'))
    }
    expect(localStorage.getItem(storageKey)).toBe(originalRecord)
    expect(
      useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
    ).toEqual({})
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('восстанавливает каталог и настройки и убирает предупреждение', async () => {
    const { user, upload } = setup()
    await upload(createExportJson(backupData))
    await user.click(screen.getByRole('button', { name: 'Импортировать' }))

    expect(useCraftStore.getState()).toMatchObject(backupData)
    expect(screen.getByText('Восстановленная ткань')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Сбросить данные' }),
    ).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown).toEqual({
      state: backupData,
      version: 1,
    })
  })

  it.each(['импорт', 'сброс'])(
    'сообщает об отказе записи без ложного успеха: %s',
    async (action) => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Хранилище переполнено')
      })
      const { user, upload } = setup()
      if (action === 'импорт') {
        await upload(createExportJson(backupData))
        await user.click(screen.getByRole('button', { name: 'Импортировать' }))
      } else {
        await user.click(screen.getByRole('button', { name: 'Сбросить данные' }))
      }
      expect(screen.getByRole('status')).toHaveTextContent(
        'не выполнен: Хранилище переполнено',
      )
      expect(localStorage.getItem(storageKey)).toBe(originalRecord)
      expect(
        useCraftStore.getState().workspaces[useCraftStore.getState().activeVersion].items,
      ).toEqual({})
      expect(screen.getByRole('alert')).toBeVisible()
    },
  )

  it('сбрасывает данные только после подтверждения и убирает предупреждение', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Сбросить данные' }))
    expect(screen.getByRole('status')).toHaveTextContent('Данные сброшены')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(usePersistenceStatusStore.getState().recoveryRequired).toBe(false)
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown).toEqual({
      state: emptyData,
      version: 1,
    })
  })

  it('сохраняет исходную запись при ошибке чтения файла', async () => {
    const { user, input } = setup()
    const file = new File([], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', {
      value: () => Promise.reject(new Error('Файл недоступен')),
    })
    await user.upload(input, file)
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось прочитать файл')
    expect(localStorage.getItem(storageKey)).toBe(originalRecord)
    expect(screen.getByRole('alert')).toBeVisible()
  })

  it('не показывает восстановление при нормальном первом запуске', () => {
    useCraftStore.getState().resetData()
    localStorage.clear()
    setup()
    act(() => {
      useCraftStore.getState().setCurrencyDisplay('text')
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Сбросить данные' }),
    ).not.toBeInTheDocument()
    expect(localStorage.getItem(storageKey)).toContain('"currencyDisplay":"text"')
  })
})
