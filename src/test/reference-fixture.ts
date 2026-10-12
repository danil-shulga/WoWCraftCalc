import { GAME_VERSION_REGISTRY } from '../domain/game-version'
import type { GameVersion } from '../domain/game-version'

export function referenceFixture(version: GameVersion = 'forever') {
  const definition = GAME_VERSION_REGISTRY[version]
  return {
    format: 'craftcalc-reference-database',
    schemaVersion: 2,
    gameVersion: version,
    mode: definition.mode,
    product: definition.product,
    build: definition.build,
    sources: [
      'Item:enUS',
      'ItemSparse:ruRU',
      'ItemSparse:enUS',
      'SpellReagents:enUS',
      'SpellEffect:enUS',
      'SkillLineAbility:enUS',
      'SkillLine:ruRU',
      'SpellTotems:enUS',
    ].map((key) => {
      const [table, locale] = key.split(':')
      if (!table || !locale) throw new Error('Invalid fixture source')
      return {
        table,
        locale,
        fileName: `${table}.${locale}.${definition.build}.csv`,
        url: `https://wago.tools/db2/${table}/csv?build=${definition.build}&locale=${locale}`,
        product: definition.product,
        build: definition.build,
        sha256: 'a'.repeat(64),
      }
    }),
    iconSource: {
      provider: 'Wowhead',
      version: definition.wowheadVersion,
      endpoint: `https://nether.wowhead.com/${definition.wowheadVersion}/tooltip/item/{itemId}`,
      imagesDownloaded: false,
    },
    professions: {
      '197': { id: 'tailoring', skillLineId: 197, nameRu: 'Портняжное дело' },
    },
    items: {
      '1': {
        itemId: 1,
        names: { ru: 'Венец Грёз', en: 'Dream Crown' },
        iconUrl: '',
        qualityId: 3,
        recipeSpellIds: [10],
        vendor: {
          baseBuyPriceCopper: 20,
          sellPriceCopper: 4,
          stackCount: 5,
          availability: null,
        },
        bondingId: 2,
      },
      '2': {
        itemId: 2,
        names: { ru: 'Ткань', en: 'Cloth' },
        iconUrl: '',
        qualityId: 1,
        recipeSpellIds: [],
        vendor: {
          baseBuyPriceCopper: 0,
          sellPriceCopper: null,
          stackCount: 1,
          availability: null,
        },
        bondingId: 0,
      },
    },
    recipes: {
      '10': {
        spellId: 10,
        productItemId: 1,
        profession: 'tailoring',
        skillLineId: 197,
        reagents: [{ itemId: 2, quantity: 3 }],
        output: {
          quantity: null,
          baseQuantityCandidate: 3,
          status: 'requires-validation',
          variance: 0,
        },
        tools: { itemIds: [999], categoryIds: [12] },
      },
    },
  }
}
