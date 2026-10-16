import { parseReferenceDatabase } from './reference-database.schema'
import { referenceFixture } from '../test/reference-fixture'
import { referenceRecipeToImport } from './reference-database-import'

it('преобразует только непосредственный состав, явно передаёт Forever и подтверждённый выход', () => {
  const db = parseReferenceDatabase(referenceFixture())
  const recipe = db.recipes['10']
  if (!recipe) throw new Error('Нет фикстуры')
  const data = referenceRecipeToImport(db, recipe, 7, 'en')
  expect(data.product).toMatchObject({
    name: 'Dream Crown',
    wowheadVersion: 'forever',
    wowheadItemId: 1,
    defaultPurchasePriceCopper: null,
    requiredLevel: 70,
    qualityId: 3,
  })
  expect(data.outputQuantity).toBe(7)
  expect(data.reagents).toHaveLength(1)
  expect(data.reagents[0]).toMatchObject({
    wowheadItemId: 2,
    defaultPurchasePriceCopper: null,
    defaultSalePriceCopper: null,
    quantity: 3,
    requiredLevel: 0,
    qualityId: 1,
  })
  expect(() => referenceRecipeToImport(db, recipe, 0)).toThrow()
})
