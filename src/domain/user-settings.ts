export const CURRENCY_DISPLAY_MODES = ['icons', 'text'] as const

export type CurrencyDisplayMode = (typeof CURRENCY_DISPLAY_MODES)[number]

export const ITEM_LANGUAGES = ['ru', 'en'] as const
export type ItemLanguage = (typeof ITEM_LANGUAGES)[number]

export const WOWHEAD_VERSIONS = ['classic', 'tbc', 'forever'] as const
export type WowheadVersion = (typeof WOWHEAD_VERSIONS)[number]
