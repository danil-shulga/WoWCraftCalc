import { z } from 'zod'

import { itemNamesSchema } from './item.schema'
import { PROFESSION_IDS } from './professions'
import { GAME_VERSIONS, GAME_VERSION_REGISTRY } from './game-version'
import type { GameVersion } from './game-version'

const id = z.number().int().positive()
const copper = z.number().int().nonnegative().nullable()

export const referenceItemSchema = z.object({
  itemId: id,
  names: itemNamesSchema.refine((names) => names.ru !== null || names.en !== null),
  iconUrl: z.union([
    z.literal(''),
    z
      .url()
      .regex(/^https:\/\/wow\.zamimg\.com\/images\/wow\/icons\/large\/[a-z0-9_-]+\.jpg$/),
  ]),
  qualityId: z.number().int().nonnegative(),
  requiredLevel: z.number().int().nonnegative(),
  recipeSpellIds: z.array(id),
  vendor: z.object({
    baseBuyPriceCopper: copper,
    sellPriceCopper: copper,
    stackCount: copper,
    availability: z.null(),
  }),
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

const referenceReagentSourceSchema = z.object({
  spellId: id,
  kind: z.enum(['enchantment', 'item-conversion']),
  productItemId: id.nullable(),
  profession: z.literal('enchanting').nullable(),
  reagents: z.array(z.object({ itemId: id, quantity: id })).min(1),
  source: z.object({
    effectRowId: id,
    reagentsRowId: id,
    abilityRowIds: z.array(id),
  }),
})

export const referenceDatabaseSchema = z
  .object({
    format: z.literal('craftcalc-reference-database'),
    schemaVersion: z.literal(2),
    gameVersion: z.enum(GAME_VERSIONS),
    mode: z.string(),
    product: z.string(),
    build: z.string(),
    sources: z
      .array(
        z.object({
          table: z.string().min(1),
          locale: z.enum(['ruRU', 'enUS']),
          fileName: z.string().min(1),
          url: z.url(),
          product: z.string(),
          build: z.string(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .length(8),
    iconSource: z.object({
      provider: z.literal('Wowhead'),
      version: z.enum(GAME_VERSIONS),
      endpoint: z.string(),
      imagesDownloaded: z.literal(false),
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
    reagentSources: z.array(referenceReagentSourceSchema).optional(),
  })
  .superRefine((db, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: 'custom', path, message })
    }
    const definition = GAME_VERSION_REGISTRY[db.gameVersion]
    for (const field of ['mode', 'product', 'build'] as const) {
      if (db[field] !== definition[field])
        issue([field], 'База не соответствует версии игры')
    }
    if (
      db.iconSource.version !== definition.wowheadVersion ||
      db.iconSource.endpoint !==
        `https://nether.wowhead.com/${definition.wowheadVersion}/tooltip/item/{itemId}`
    )
      issue(['iconSource'], 'Неверное происхождение иконок')
    const sourceIds = db.sources
      .map((source) => `${source.table}:${source.locale}`)
      .sort()
    const expectedSources = [
      'Item:enUS',
      'ItemSparse:ruRU',
      'ItemSparse:enUS',
      'SpellReagents:enUS',
      'SpellEffect:enUS',
      'SkillLineAbility:enUS',
      'SkillLine:ruRU',
      'SpellTotems:enUS',
    ].sort()
    if (sourceIds.join(',') !== expectedSources.join(','))
      issue(['sources'], 'Неверные таблицы источников')
    for (const source of db.sources) {
      if (
        source.build !== db.build ||
        source.product !== db.product ||
        source.fileName !== `${source.table}.${source.locale}.${db.build}.csv` ||
        source.url !==
          `https://wago.tools/db2/${source.table}/csv?build=${db.build}&locale=${source.locale}`
      )
        issue(['sources'], 'Смешанные или неверные источники базы')
    }
    for (const [key, profession] of Object.entries(db.professions)) {
      if (!definition.professions.includes(profession.id))
        issue(['professions', key], 'Профессия недоступна в этой версии')
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
    const sourceSpells = new Set<number>()
    for (const source of db.reagentSources ?? []) {
      const path = ['reagentSources', source.spellId]
      if (sourceSpells.has(source.spellId) || db.recipes[String(source.spellId)])
        issue(path, 'Повтор источника реагентов')
      sourceSpells.add(source.spellId)
      if (source.kind === 'enchantment') {
        if (
          source.profession !== 'enchanting' ||
          source.productItemId !== null ||
          !source.source.abilityRowIds.length ||
          db.professions['333']?.id !== 'enchanting'
        )
          issue(path, 'Неверный источник реагентов зачарования')
      } else if (
        source.profession !== null ||
        source.productItemId === null ||
        !db.items[String(source.productItemId)] ||
        source.source.abilityRowIds.length ||
        source.reagents.length !== 1
      ) {
        issue(path, 'Неверный источник реагентов превращения')
      }
      const seen = new Set<number>()
      for (const reagent of source.reagents) {
        if (!db.items[String(reagent.itemId)] || seen.has(reagent.itemId))
          issue(path, 'Отсутствующий или повторный реагент источника')
        seen.add(reagent.itemId)
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

export function parseReferenceDatabase(value: unknown, expectedVersion?: GameVersion) {
  const database = referenceDatabaseSchema.parse(value)
  if (expectedVersion && database.gameVersion !== expectedVersion)
    throw new Error('Версия справочника не совпадает с выбранной версией игры')
  return database
}
