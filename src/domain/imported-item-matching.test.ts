import { findImportedItem } from './imported-item-matching'
import type { Item } from './item.types'

const item: Item = {
  id: 'reagent',
  name: 'Реагент',
  names: { ru: null, en: null },
  iconUrl: '',
  sections: ['reagents'],
  purchasePriceCopper: 10,
  salePriceCopper: null,
  recipe: null,
}

it('сопоставляет ручной предмет по EN и не объединяет разные версии игры', () => {
  const catalog = { reagent: { ...item, names: { ru: 'Нефрит', en: 'Jade' } } }
  expect(
    findImportedItem(catalog, {
      wowheadItemId: 1529,
      name: 'Другое имя',
      names: { ru: 'Другое имя', en: 'JADE' },
      iconUrl: '',
    })?.id,
  ).toBe('reagent')
  const sourced = {
    reagent: {
      ...catalog.reagent,
      source: { wowheadItemId: 1529, wowheadVersion: 'forever' as const },
    },
  }
  expect(
    findImportedItem(sourced, {
      wowheadItemId: 1529,
      wowheadVersion: 'tbc',
      name: 'Jade',
      iconUrl: '',
    }),
  ).toBeUndefined()
  expect(
    findImportedItem(
      { ...catalog, duplicate: { ...catalog.reagent, id: 'duplicate' } },
      { wowheadItemId: 1529, name: 'Jade', iconUrl: '' },
    ),
  ).toBeUndefined()
})
