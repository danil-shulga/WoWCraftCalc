import { z } from 'zod'

import { itemNamesSchema } from './item.schema'
import { PROFESSION_IDS } from './professions'

const id = z.number().int().positive()
const copper = z.number().int().nonnegative().nullable()

export const referenceItemSchema = z.object({
  itemId: id,
  names: itemNamesSchema.refine((names) => names.ru !== null || names.en !== null),
  iconUrl: z.union([z.literal(''), z.url()]),
  qualityId: z.number().int().nonnegative(),
  recipeSpellIds: z.array(id),
  vendor: z.object({ baseBuyPriceCopper: copper, sellPriceCopper: copper }),
  bondingId: z.number().int().nonnegative(),
})

export const referenceRecipeSchema = z.object({
  spellId: id,
  productItemId: id,
  profession: z.enum(PROFESSION_IDS),
  skillLineId: id,
  reagents: z.array(z.object({ itemId: id, quantity: id })).min(1),
  output: z.object({
    quantity: id.nullable(),
    baseQuantityCandidate: id.nullable(),
    status: z.literal('requires-validation'),
    variance: z.number(),
  }),
  tools: z.object({ itemIds: z.array(id), categoryIds: z.array(id) }),
})

export const referenceDatabaseSchema = z
  .object({
    format: z.literal('craftcalc-reference-database'),
    schemaVersion: z.literal(1),
    build: z.literal('1.60.1.70338'),
    iconSource: z.object({
      provider: z.literal('Wowhead'),
      version: z.literal('forever'),
    }),
    professions: z.record(
      z.string(),
      z.object({
        id: z.enum(PROFESSION_IDS),
        skillLineId: id,
        nameRu: z.string().min(1),
      }),
    ),
    items: z.record(z.string(), referenceItemSchema),
    recipes: z.record(z.string(), referenceRecipeSchema),
  })
  .superRefine((db, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: 'custom', path, message })
    }
    for (const [key, profession] of Object.entries(db.professions)) {
      if (key !== String(profession.skillLineId))
        issue(['professions', key], 'Ключ профессии не совпадает с ID')
    }
    for (const [key, item] of Object.entries(db.items)) {
      if (key !== String(item.itemId))
        issue(['items', key], 'Ключ предмета не совпадает с ID')
      if (new Set(item.recipeSpellIds).size !== item.recipeSpellIds.length)
        issue(['items', key, 'recipeSpellIds'], 'Повтор рецепта')
      for (const spellId of item.recipeSpellIds) {
        if (db.recipes[String(spellId)]?.productItemId !== item.itemId)
          issue(['items', key, 'recipeSpellIds'], 'Неверная ссылка на рецепт результата')
      }
    }
    for (const [key, recipe] of Object.entries(db.recipes)) {
      const path = ['recipes', key]
      if (key !== String(recipe.spellId)) issue(path, 'Ключ рецепта не совпадает с ID')
      if (
        !db.items[String(recipe.productItemId)]?.recipeSpellIds.includes(recipe.spellId)
      )
        issue(path, 'Отсутствует результат или обратная ссылка на рецепт')
      if (db.professions[String(recipe.skillLineId)]?.id !== recipe.profession)
        issue(path, 'Неверная профессия рецепта')
      const seen = new Set<number>()
      for (const reagent of recipe.reagents) {
        if (!db.items[String(reagent.itemId)]) issue(path, 'Отсутствует реагент')
        if (seen.has(reagent.itemId)) issue(path, 'Повтор реагента')
        seen.add(reagent.itemId)
      }
    }
  })

export function parseReferenceDatabase(value: unknown) {
  return referenceDatabaseSchema.parse(value)
}
