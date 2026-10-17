import { findImportedItem } from '../../domain/imported-item-matching'
import { ItemQuantityList } from '../../components/ui/ItemQuantityList/ItemQuantityList'
import { useId } from 'react'
import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { getItemName } from '../../domain/item-names'
import { referenceItemToImport } from '../../domain/reference-database-import'
import type { ReferenceDatabaseIndex } from '../../domain/reference-database-index'
import type {
  ReferenceItem,
  ReferenceRecipe,
} from '../../domain/reference-database.types'
import type { Item, ItemCatalog, ItemSection } from '../../domain/item.types'
import type { ItemLanguage } from '../../domain/user-settings'

interface ReviewProps {
  catalog: ItemCatalog
  section: ItemSection
  itemLanguage: ItemLanguage
  targetItem?: Item | undefined
  output: number
  onOutputChange: (value: number) => void
  index: ReferenceDatabaseIndex
  item: ReferenceItem
  recipe: ReferenceRecipe | null
}

export function ReferenceReview({
  index,
  item,
  recipe,
  catalog,
  section,
  itemLanguage,
  output,
  onOutputChange,
  targetItem,
}: ReviewProps) {
  const outputId = useId()
  const imported = referenceItemToImport(item, index.database.gameVersion, itemLanguage)
  const savedRecipe =
    targetItem === undefined
      ? (findImportedItem(catalog, imported)?.recipe ?? null)
      : targetItem.recipe
  return (
    <section className="reference-db__review" aria-label="Предпросмотр из базы">
      <ItemIdentity
        item={imported}
        language={itemLanguage}
        iconSize="medium"
        nameAs="h3"
        className="reference-db__product"
      />
      {recipe === null ? (
        <p>
          {section === 'disenchanting'
            ? 'Предмет будет показан в разделе «Распыление».'
            : 'Будет добавлен реагент.'}{' '}
          Существующий рецепт сохранится.
        </p>
      ) : (
        <>
          <ItemQuantityList
            label="Состав рецепта"
            language={itemLanguage}
            showSecondaryName={false}
            items={recipe.reagents.flatMap((line) => {
              const reagent = index.database.items[String(line.itemId)]
              if (!reagent) return []
              return [
                {
                  key: line.itemId,
                  quantity: line.quantity,
                  item: {
                    name: String(reagent.itemId),
                    names: reagent.names,
                    iconUrl: reagent.iconUrl,
                    qualityId: reagent.qualityId,
                  },
                },
              ]
            })}
          />
          <div className="reference-db__output">
            <label htmlFor={outputId}>Предметов за один крафт</label>
            <NumberInput
              id={outputId}
              min={1}
              step={1}
              value={output}
              onChange={onOutputChange}
            />
          </div>
          {savedRecipe !== null ? (
            <div className="reference-db__warning">
              <p>Сохранённый активный рецепт будет заменён составом выше.</p>
              <small>
                Сейчас: выход {savedRecipe.outputQuantity};{' '}
                {savedRecipe.reagents
                  .map((line) => {
                    const savedItem = catalog[line.itemId]
                    return `${savedItem ? getItemName(savedItem, itemLanguage) : line.itemId} × ${String(line.quantity)}`
                  })
                  .join(', ')}
                .
              </small>
            </div>
          ) : null}
          <small>
            Пользовательские цены, вложенные рецепты и ручной выбор получения сохранятся.
          </small>
        </>
      )}
    </section>
  )
}
