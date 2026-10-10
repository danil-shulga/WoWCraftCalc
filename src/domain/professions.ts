export const PROFESSION_IDS = [
  'alchemy',
  'blacksmithing',
  'enchanting',
  'engineering',
  'herbalism',
  'mining',
  'skinning',
  'leatherworking',
  'tailoring',
  'first-aid',
  'cooking',
  'fishing',
] as const

export type Profession = (typeof PROFESSION_IDS)[number]

export const PROFESSION_OPTIONS = [
  { value: 'alchemy', label: 'Алхимия (Alchemy)' },
  { value: 'blacksmithing', label: 'Кузнечное дело (Blacksmithing)' },
  { value: 'enchanting', label: 'Наложение чар (Enchanting)' },
  { value: 'engineering', label: 'Инженерное дело (Engineering)' },
  { value: 'herbalism', label: 'Травничество (Herbalism)' },
  { value: 'mining', label: 'Горное дело (Mining)' },
  { value: 'skinning', label: 'Снятие шкур (Skinning)' },
  { value: 'leatherworking', label: 'Кожевничество (Leatherworking)' },
  { value: 'tailoring', label: 'Портняжное дело (Tailoring)' },
  { value: 'first-aid', label: 'Первая помощь (First Aid)' },
  { value: 'cooking', label: 'Кулинария (Cooking)' },
  { value: 'fishing', label: 'Рыбная ловля (Fishing)' },
] as const satisfies readonly { value: Profession; label: string }[]
