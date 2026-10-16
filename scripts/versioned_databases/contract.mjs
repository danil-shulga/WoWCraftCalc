import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

const id = z.number().int().positive()
const nonnegative = z.number().int().nonnegative()
const gameVersion = z.enum(['classic', 'tbc', 'forever'])
const profession = z.enum([
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
  'jewelcrafting',
])
const string = z.string().min(1)
const source = z.strictObject({
  table: string,
  locale: z.enum(['ruRU', 'enUS']),
  fileName: string,
  path: string,
  rows: nonnegative,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  url: z.url(),
  product: string,
  build: string,
  originalFileName: string.optional(),
})
const item = z.strictObject({
  itemId: id,
  names: z
    .strictObject({ ru: string.nullable(), en: string.nullable() })
    .refine((names) => names.ru !== null || names.en !== null),
  iconUrl: z.union([
    z.literal(''),
    z
      .url()
      .regex(/^https:\/\/wow\.zamimg\.com\/images\/wow\/icons\/large\/[a-z0-9_-]+\.jpg$/),
  ]),
  qualityId: nonnegative,
  requiredLevel: nonnegative,
  bondingId: nonnegative,
  recipeSpellIds: z.array(id),
  vendor: z.strictObject({
    baseBuyPriceCopper: nonnegative.nullable(),
    sellPriceCopper: nonnegative.nullable(),
    stackCount: nonnegative.nullable(),
    availability: z.null(),
  }),
})
const recipe = z.strictObject({
  spellId: id,
  productItemId: id,
  profession,
  skillLineId: id,
  reagents: z.array(z.strictObject({ itemId: id, quantity: id })).min(1),
  output: z.strictObject({
    quantity: z.null(),
    baseQuantityCandidate: id.nullable(),
    status: z.literal('requires-validation'),
    basePoints: z.number(),
    variance: z.number(),
    realPointsPerLevel: z.number(),
    scalingClass: z.number().int().nullable(),
    rawEffectParameters: z.record(string, z.string()),
  }),
  tools: z.strictObject({ itemIds: z.array(id), categoryIds: z.array(id) }),
  skillMetadata: z.strictObject({
    minimumRankRaw: z.number().int(),
    trivialRankLowRaw: z.number().int(),
    trivialRankHighRaw: z.number().int(),
    skillUpsRaw: z.number().int(),
    categoryId: z.number().int(),
    skillupSkillLineId: z.number().int().nullable(),
    acquireMethodRaw: z.number().int(),
    classMaskRaw: z.number().int(),
    raceMaskPartsRaw: z.array(z.number().int()).min(1),
    flagsRaw: z.number().int(),
  }),
  source: z.strictObject({
    effectRowId: id,
    effectIndex: nonnegative,
    difficultyId: nonnegative,
    reagentsRowId: id,
    abilityRowIds: z.array(id).min(1),
  }),
})

export function statistics(db) {
  const recipes = Object.values(db.recipes)
  const products = new Set(recipes.map((r) => r.productItemId))
  const reagents = new Set(recipes.flatMap((r) => r.reagents.map((v) => v.itemId)))
  for (const source of db.reagentSources ?? [])
    for (const reagent of source.reagents) reagents.add(reagent.itemId)
  const counts = {}
  for (const r of recipes) counts[r.profession] = (counts[r.profession] ?? 0) + 1
  return {
    items: Object.keys(db.items).length,
    recipes: recipes.length,
    craftedItems: products.size,
    recipesWithTools: recipes.filter(
      (r) => r.tools.itemIds.length || r.tools.categoryIds.length,
    ).length,
    recipesWithBaseQuantityCandidate: recipes.filter(
      (r) => r.output.baseQuantityCandidate !== null,
    ).length,
    excludedRecipeEffects: db.excludedRecipeEffects.length,
    recipesByProfession: Object.fromEntries(Object.entries(counts).sort()),
    reagentItems: reagents.size,
    itemsBothCraftAndReagent: [...products].filter((v) => reagents.has(v)).length,
  }
}

export const databaseSchema = z
  .strictObject({
    format: z.literal('craftcalc-reference-database'),
    schemaVersion: z.literal(2),
    gameVersion,
    mode: string,
    build: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/),
    product: string,
    snapshotDate: z.iso.date(),
    locales: z.tuple([z.literal('ruRU'), z.literal('enUS')]),
    sources: z.array(source).length(8),
    selection: z.strictObject({
      status: z.literal('client-table-candidates'),
      effect: z.literal(24),
      rules: z.array(string).min(1),
      availability: string,
    }),
    itemScope: z.enum([
      'recipe-products-and-consumed-reagents',
      'recipe-products-and-profession-reagents',
    ]),
    reagentSources: z
      .array(
        z.strictObject({
          spellId: id,
          kind: z.enum(['enchantment', 'item-conversion']),
          productItemId: id.nullable(),
          profession: z.literal('enchanting').nullable(),
          reagents: z.array(z.strictObject({ itemId: id, quantity: id })).min(1),
          source: z.strictObject({
            effectRowId: id,
            reagentsRowId: id,
            abilityRowIds: z.array(id),
          }),
        }),
      )
      .default([]),
    iconSource: z.strictObject({
      provider: z.literal('Wowhead'),
      version: gameVersion,
      endpoint: string,
      imagesDownloaded: z.literal(false),
    }),
    notes: z.array(string),
    statistics: z.strictObject({
      items: id,
      recipes: id,
      craftedItems: id,
      recipesWithTools: nonnegative,
      recipesWithBaseQuantityCandidate: nonnegative,
      excludedRecipeEffects: nonnegative,
      recipesByProfession: z.partialRecord(profession, nonnegative),
      reagentItems: nonnegative,
      itemsBothCraftAndReagent: nonnegative,
    }),
    professions: z.record(
      string,
      z.strictObject({ id: profession, skillLineId: id, nameRu: string }),
    ),
    items: z.record(string, item),
    recipes: z.record(string, recipe),
    excludedRecipeEffects: z.array(
      z.object({ spellId: id, reason: string }).catchall(z.unknown()),
    ),
  })
  .superRefine((db, ctx) => {
    const issue = (message) => ctx.addIssue({ code: 'custom', message })
    const identities = {
      classic: ['era', 'wow_classic_era'],
      tbc: ['anniversary', 'wow_anniversary'],
      forever: ['beta', 'wow_classic_beta'],
    }
    if (
      db.mode !== identities[db.gameVersion][0] ||
      db.product !== identities[db.gameVersion][1]
    )
      issue('Wrong mode/product')
    if (
      db.iconSource.version !== db.gameVersion ||
      db.iconSource.endpoint !==
        `https://nether.wowhead.com/${db.gameVersion}/tooltip/item/{itemId}`
    )
      issue('Wrong icon version')
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
    if (
      JSON.stringify(db.sources.map((s) => `${s.table}:${s.locale}`).sort()) !==
      JSON.stringify(expectedSources)
    )
      issue('Wrong source tables/locales')
    for (const s of db.sources) {
      if (s.build !== db.build || s.product !== db.product) issue('Mixed source identity')
      if (
        s.fileName !== `${s.table}.${s.locale}.${db.build}.csv` ||
        s.url !==
          `https://wago.tools/db2/${s.table}/csv?build=${db.build}&locale=${s.locale}`
      )
        issue('Wrong pinned source filename/URL')
    }
    for (const [key, p] of Object.entries(db.professions))
      if (key !== String(p.skillLineId)) issue('Wrong profession key')
    const referenced = new Set()
    for (const [key, r] of Object.entries(db.recipes)) {
      if (key !== String(r.spellId)) issue('Wrong recipe key')
      if (!db.items[r.productItemId]?.recipeSpellIds.includes(r.spellId))
        issue('Missing product/reverse link')
      if (db.professions[r.skillLineId]?.id !== r.profession)
        issue('Wrong recipe profession')
      if (
        r.output.rawEffectParameters.Effect !== '24' ||
        Number(r.output.rawEffectParameters.EffectItemType) !== r.productItemId
      )
        issue('Raw effect disagrees with recipe')
      referenced.add(r.productItemId)
      const seen = new Set()
      for (const reagent of r.reagents) {
        if (!db.items[reagent.itemId] || seen.has(reagent.itemId))
          issue('Missing/duplicate reagent')
        seen.add(reagent.itemId)
        referenced.add(reagent.itemId)
      }
      for (const values of [r.source.abilityRowIds])
        if (new Set(values).size !== values.length) issue('Duplicate tool/source ID')
    }
    const sourceSpells = new Set()
    const conversions = []
    for (const source of db.reagentSources) {
      if (sourceSpells.has(source.spellId) || db.recipes[source.spellId])
        issue('Duplicate reagent source spell')
      sourceSpells.add(source.spellId)
      if (
        new Set(source.source.abilityRowIds).size !== source.source.abilityRowIds.length
      )
        issue('Duplicate reagent source ability')
      const seen = new Set()
      for (const reagent of source.reagents) {
        if (!db.items[reagent.itemId] || seen.has(reagent.itemId))
          issue('Missing/duplicate source reagent')
        seen.add(reagent.itemId)
      }
      if (source.kind === 'enchantment') {
        if (
          source.profession !== 'enchanting' ||
          source.productItemId !== null ||
          !source.source.abilityRowIds.length ||
          db.professions['333']?.id !== 'enchanting'
        )
          issue('Invalid enchantment reagent source')
        for (const reagent of source.reagents) referenced.add(reagent.itemId)
      } else {
        if (
          source.profession !== null ||
          !source.productItemId ||
          source.source.abilityRowIds.length ||
          source.reagents.length !== 1
        )
          issue('Invalid item conversion reagent source')
        conversions.push(source)
      }
    }
    let pending = conversions
    while (pending.length) {
      const next = []
      for (const source of pending) {
        if (referenced.has(source.productItemId)) {
          for (const reagent of source.reagents) referenced.add(reagent.itemId)
        } else next.push(source)
      }
      if (next.length === pending.length) {
        issue('Disconnected item conversion reagent source')
        break
      }
      pending = next
    }
    if (
      db.itemScope === 'recipe-products-and-consumed-reagents' &&
      db.reagentSources.length
    )
      issue('Legacy scope cannot contain additional reagent sources')
    for (const [key, i] of Object.entries(db.items)) {
      if (key !== String(i.itemId) || !referenced.has(i.itemId))
        issue('Wrong item key/scope')
      if (new Set(i.recipeSpellIds).size !== i.recipeSpellIds.length)
        issue('Duplicate reverse link')
      for (const spell of i.recipeSpellIds)
        if (db.recipes[spell]?.productItemId !== i.itemId) issue('Wrong reverse link')
    }
    if (JSON.stringify(statistics(db)) !== JSON.stringify(db.statistics))
      issue('Statistics do not match final data')
  })

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const file of process.argv.slice(2)) {
    const db = databaseSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    console.log(
      `${db.gameVersion} ${db.build}: schema 2 OK, ${db.statistics.items} items, ${db.statistics.recipes} recipes`,
    )
  }
}
