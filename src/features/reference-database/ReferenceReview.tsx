import { findImportedItem } from '../../domain/imported-item-matching'
import { ItemQuantityList } from '../../components/ui/ItemQuantityList/ItemQuantityList'
import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useEffect, useId, useRef, useState } from 'react'
import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { getItemName } from '../../domain/item-names'
import {
  referenceItemToImport,
  referenceRecipeToImport,
} from '../../domain/reference-database-import'
import type { ReferenceDatabaseIndex } from '../../domain/reference-database-index'
import type {
  ReferenceItem,
  ReferenceRecipe,
} from '../../domain/reference-database.types'
import type { ReferenceDatabaseFormProps } from './reference-database-form.types'

interface ReviewProps extends ReferenceDatabaseFormProps {
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
  onImport,
  onAddItem,
  onSuccess,
  onClose,
  targetItem,
  isActive,
}: ReviewProps) {
  const outputId = useId()
  const actionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = actionsRef.current?.closest<HTMLElement>('[role="dialog"]')
    if (!isActive || targetItem !== undefined || !dialog) return

    const startTop = dialog.scrollTop
    const startTime = performance.now()
    let frameId: number
    const animate = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - startTime) / 150))
      const bottom = Math.max(0, dialog.scrollHeight - dialog.clientHeight)
      const eased = 1 - (1 - progress) ** 3
      dialog.scrollTop = startTop + (bottom - startTop) * eased
      if (progress < 1) frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [isActive, targetItem])
  const imported = referenceItemToImport(item, index.database.gameVersion, itemLanguage)
  const [savedRecipe] = useState(() =>
    targetItem === undefined
      ? (findImportedItem(catalog, imported)?.recipe ?? null)
      : targetItem.recipe,
  )
  const [output, setOutput] = useState(
    () => savedRecipe?.outputQuantity ?? recipe?.output.quantity ?? 1,
  )
  const [error, setError] = useState<string | null>(null)
  const confirm = () => {
    setError(null)
    try {
      if (recipe === null) {
        const result = onAddItem(imported)
        if (!result.success) {
          setError(result.error)
          return
        }
        onSuccess(
          `Из базы: добавлено предметов ${result.created ? '1' : '0'}, переиспользовано ${result.created ? '0' : '1'}.`,
        )
      } else {
        const data = referenceRecipeToImport(index.database, recipe, output, itemLanguage)
        const result = onImport({ ...data, productSection: section })
        if (!result.success) {
          setError(result.error)
          return
        }
        const created = Number(result.productCreated) + result.reagentsCreated
        const reused = recipe.reagents.length + 1 - created
        onSuccess(
          `Из базы: добавлено предметов ${String(created)}, переиспользовано ${String(reused)}. Рецепт сохранён.`,
        )
      }
      onClose()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось добавить предмет из базы',
      )
    }
  }
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
              onChange={setOutput}
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
      <FormError message={error} />
      <div ref={actionsRef} className="editor-form__actions">
        <Button variant="secondary" type="button" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="primary" type="button" onClick={confirm}>
          {recipe === null
            ? section === 'disenchanting'
              ? 'Добавить предмет'
              : 'Добавить реагент'
            : 'Подтвердить импорт'}
        </Button>
      </div>
    </section>
  )
}
