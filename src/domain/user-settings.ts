export const CURRENCY_DISPLAY_MODES = ['icons', 'text'] as const

export type CurrencyDisplayMode = (typeof CURRENCY_DISPLAY_MODES)[number]
