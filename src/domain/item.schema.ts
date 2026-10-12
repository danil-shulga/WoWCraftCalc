import { z } from 'zod'

import { PROFESSION_IDS } from './professions'
import { GAME_VERSIONS } from './game-version'
import { CURRENCY_DISPLAY_MODES, ITEM_LANGUAGES, WOWHEAD_VERSIONS } from './user-settings'

export const itemNamesSchema = z.object({
  ru: z.string().trim().min(1).nullable(),
  en: z.string().trim().min(1).nullable(),
})

const nullableCopperSchema = z
  .number()
  .int('Цена должна быть целым числом медных монет')
  .nonnegative('Цена не может быть отрицательной')
  .nullable()

export const recipeLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  acquisition: z.enum(['auto', 'buy', 'craft']),
})

export const recipeSchema = z.object({
  outputQuantity: z.number().int().positive(),
  profession: z.enum(PROFESSION_IDS).nullable().default(null),
  reagents: z.array(recipeLineSchema).min(1, 'Добавьте хотя бы один реагент'),
})

export const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Введите название предмета'),
  names: itemNamesSchema.default({ ru: null, en: null }),
  iconUrl: z.union([z.literal(''), z.url('Введите корректный URL')]),
  source: z
    .object({
      wowheadItemId: z.number().int().positive(),
      wowheadVersion: z.enum(WOWHEAD_VERSIONS).optional(),
    })
    .optional(),
  sections: z.array(z.enum(['crafts', 'reagents'])).min(1),
  purchasePriceCopper: nullableCopperSchema,
  salePriceCopper: nullableCopperSchema,
  recipe: recipeSchema.nullable(),
})

export const versionWorkspaceSchema = z.object({
  items: z.record(z.string(), itemSchema),
  ownedProfessions: z.array(z.enum(PROFESSION_IDS)),
})

export const persistedCraftDataSchema = z.object({
  activeVersion: z.enum(GAME_VERSIONS),
  workspaces: z.object({
    forever: versionWorkspaceSchema,
    tbc: versionWorkspaceSchema,
    classic: versionWorkspaceSchema,
  }),
  currencyDisplay: z.enum(CURRENCY_DISPLAY_MODES),
  itemLanguage: z.enum(ITEM_LANGUAGES),
})
