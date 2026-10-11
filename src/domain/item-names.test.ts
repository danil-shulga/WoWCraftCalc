import { getItemName, matchesItemName } from './item-names'

describe('названия предметов', () => {
  const item = {
    name: 'Старое имя',
    names: { ru: 'Венец из ткани Грёз', en: 'Dreamweave Circlet' },
  }

  it('выбирает язык и ищет по обоим названиям', () => {
    expect(getItemName(item, 'en')).toBe('Dreamweave Circlet')
    expect(getItemName(item, 'ru')).toBe('Венец из ткани Грёз')
    expect(matchesItemName(item, '  DREAMWEAVE  ')).toBe(true)
    expect(matchesItemName(item, 'ткани грез')).toBe(true)
    expect(matchesItemName(item, 'другое')).toBe(false)
  })

  it('использует заполненный перевод или исходное имя старой записи', () => {
    expect(getItemName({ ...item, names: { ru: null, en: 'Circlet' } }, 'ru')).toBe(
      'Circlet',
    )
    expect(getItemName({ ...item, names: { ru: 'Венец', en: null } }, 'en')).toBe('Венец')
    expect(getItemName({ name: 'Legacy', names: { ru: null, en: null } }, 'en')).toBe(
      'Legacy',
    )
  })
})
