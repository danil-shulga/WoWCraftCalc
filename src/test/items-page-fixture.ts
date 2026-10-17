import type { ItemCatalog } from '../domain/item.types'

export const items: ItemCatalog = {
  potion: {
    id: 'potion',
    name: 'Лечебное зелье',
    names: { ru: 'Лечебное зелье', en: 'Healing Potion' },
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 100,
    recipe: null,
  },
  bag: {
    id: 'bag',
    name: 'Шерстяная сумка',
    names: { ru: 'Шерстяная сумка', en: 'Wool Bag' },
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: 200,
    recipe: null,
  },
}
