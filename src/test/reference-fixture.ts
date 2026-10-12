export function referenceFixture() {
  return {
    format: 'craftcalc-reference-database',
    schemaVersion: 1,
    build: '1.60.1.70338',
    iconSource: { provider: 'Wowhead', version: 'forever' },
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
        vendor: { baseBuyPriceCopper: 20, sellPriceCopper: 4 },
        bondingId: 2,
      },
      '2': {
        itemId: 2,
        names: { ru: 'Ткань', en: 'Cloth' },
        iconUrl: '',
        qualityId: 1,
        recipeSpellIds: [],
        vendor: { baseBuyPriceCopper: 0, sellPriceCopper: null },
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
