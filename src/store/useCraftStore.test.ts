import { persistedCraftDataSchema } from '../domain/item.schema'
import { useCraftStore } from './useCraftStore'

describe('настройки CraftStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCraftStore.getState().setCurrencyDisplay('icons')
  })

  it('использует иконки для сохранённых данных без настройки валют', () => {
    const parsed = persistedCraftDataSchema.parse({
      items: {},
      ownedProfessions: [],
    })

    expect(parsed.currencyDisplay).toBe('icons')
  })

  it('сохраняет выбранное отображение валют', () => {
    useCraftStore.getState().setCurrencyDisplay('text')

    const persisted = JSON.parse(localStorage.getItem('craft-calc-data') ?? '{}') as {
      state?: { currencyDisplay?: string }
    }

    expect(useCraftStore.getState().currencyDisplay).toBe('text')
    expect(persisted.state?.currencyDisplay).toBe('text')
  })
})
