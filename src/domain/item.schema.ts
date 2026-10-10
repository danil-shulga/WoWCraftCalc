import { z } from 'zod'

import { PROFESSION_IDS } from './professions'

const nullableCopperSchema = z
  .number()
  .int('Цена должна быть целым числом медных монет')
  .nonnegative('Цена не может быть отрицательной')
  .nullable()

export const recipeLineSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
  acquisition: z.enum(['buy', 'craft']),
})

export const recipeSchema = z.object({
  outputQuantity: z.number().int().positive(),
  profession: z.enum(PROFESSION_IDS).nullable().default(null),
  reagents: z.array(recipeLineSchema),
})

export const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Введите название предмета'),
  iconUrl: z.union([z.literal(''), z.url('Введите корректный URL')]),
  sections: z.array(z.enum(['crafts', 'reagents'])).min(1),
  purchasePriceCopper: nullableCopperSchema,
  salePriceCopper: nullableCopperSchema,
  recipe: recipeSchema.nullable(),
})

export const persistedCraftDataSchema = z.object({
  items: z.record(z.string(), itemSchema),
})
