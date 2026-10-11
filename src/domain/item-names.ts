import type { ItemNames } from './item.types'
import type { ItemLanguage } from './user-settings'

interface NamedItem {
  name: string
  names?: ItemNames | undefined
}

export function getItemName(item: NamedItem, language: ItemLanguage = 'ru'): string {
  return item.names?.[language] ?? item.names?.ru ?? item.names?.en ?? item.name
}

export function getSecondaryItemName(
  item: NamedItem,
  language: ItemLanguage = 'ru',
): string | null {
  const name = item.names?.[language === 'ru' ? 'en' : 'ru']
  return name && name !== getItemName(item, language) ? name : null
}

export function getItemSearchNames(item: NamedItem): string[] {
  return [...new Set([item.names?.ru, item.names?.en, item.name])].filter(
    (name): name is string => typeof name === 'string' && name.length > 0,
  )
}

export function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
}

export function matchesItemName(item: NamedItem, query: string): boolean {
  const normalizedQuery = normalizeItemName(query)
  return getItemSearchNames(item).some((name) =>
    normalizeItemName(name).includes(normalizedQuery),
  )
}
