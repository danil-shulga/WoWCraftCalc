import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useDraftSnapshot } from '../../app/draft-guard'
import { useMemo, useState, type SyntheticEvent } from 'react'

import { AcquisitionMethodPicker } from '../../components/ui/AcquisitionMethodPicker/AcquisitionMethodPicker'
import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { ItemName } from '../../components/ui/ItemName/ItemName'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import {
  getAutomaticAcquisitionMethod,
  getCraftUnitCost,
} from '../../domain/calculations'
import type { Item, ItemCatalog, Recipe, RecipeLine } from '../../domain/item.types'
import type { Profession } from '../../domain/professions'
import { professionOptionsFor } from '../../domain/game-version'
import type { GameVersion } from '../../domain/game-version'
import { resolveItemPrice } from '../../domain/tsm'
import type { PriceContext } from '../../domain/tsm'
import { selectAvailableReagents } from '../../store/craft.selectors'
import {
  getItemName,
  getItemSearchNames,
  getSecondaryItemName,
} from '../../domain/item-names'
import type { ItemLanguage } from '../../domain/user-settings'
import '../EditorForm.css'
import './RecipeEditor.css'

interface RecipeEditorProps {
  prices?: PriceContext | undefined
  gameVersion?: GameVersion
  item: Item
  itemLanguage?: ItemLanguage
  catalog: ItemCatalog
  ownedProfessions: readonly Profession[]
  onDraftChange?: (recipe: Recipe) => void
  onSave: (recipe: Recipe) => string | null
  onRemove: () => void
  onCancel: () => void
}

export function RecipeEditor({
  prices,
  item,
  gameVersion = 'forever',
  itemLanguage = 'ru',
  catalog,
  ownedProfessions,
  onDraftChange,
  onSave,
  onRemove,
  onCancel,
}: RecipeEditorProps) {
  const PROFESSION_OPTIONS = professionOptionsFor(gameVersion)
  const [outputQuantity, setOutputQuantity] = useState(item.recipe?.outputQuantity ?? 1)
  const [profession, setProfession] = useState<Profession | ''>(
    item.recipe?.profession ?? '',
  )
  const [reagents, setReagents] = useState<RecipeLine[]>(
    item.recipe?.reagents.map((line) => ({ ...line })) ?? [],
  )
  const [selectedItemId, setSelectedItemId] = useState('')
  useDraftSnapshot({ outputQuantity, profession, reagents, selectedItemId })
  const [error, setError] = useState<string | null>(null)
  const ownedProfessionSet = useMemo(() => new Set(ownedProfessions), [ownedProfessions])

  const selectedIds = useMemo(
    () => new Set(reagents.map((line) => line.itemId)),
    [reagents],
  )
  const availableItems = useMemo(
    () => selectAvailableReagents(catalog, item.id, selectedIds, itemLanguage),
    [catalog, item.id, selectedIds, itemLanguage],
  )
  const availableOptions = useMemo(
    () =>
      availableItems.map((availableItem) => ({
        value: availableItem.id,
        label: getItemName(availableItem, itemLanguage),
        secondaryLabel: getSecondaryItemName(availableItem, itemLanguage),
        searchNames: getItemSearchNames(availableItem),
      })),
    [availableItems, itemLanguage],
  )

  const changeDraft = (updates: Partial<Recipe>) => {
    const next = {
      outputQuantity,
      profession: profession === '' ? null : profession,
      reagents,
      ...updates,
    }
    setOutputQuantity(next.outputQuantity)
    setProfession(next.profession ?? '')
    setReagents(next.reagents)
    onDraftChange?.(next)
  }

  const addReagent = () => {
    const selectedItem = catalog[selectedItemId]

    if (selectedItem === undefined) {
      return
    }

    changeDraft({
      reagents: [
        ...reagents,
        {
          itemId: selectedItem.id,
          quantity: 1,
          acquisition: 'auto',
        },
      ],
    })
    setSelectedItemId('')
  }

  const updateLine = (
    reagentItemId: string,
    updates: Partial<Pick<RecipeLine, 'quantity' | 'acquisition'>>,
  ) => {
    changeDraft({
      reagents: reagents.map((line) =>
        line.itemId === reagentItemId ? { ...line, ...updates } : line,
      ),
    })
  }

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()

    if (outputQuantity < 1) {
      setError('Количество результата должно быть не меньше одного')
      return
    }

    if (reagents.length === 0) {
      setError('Добавьте хотя бы один реагент')
      return
    }

    const saveError = onSave({
      outputQuantity,
      profession: profession === '' ? null : profession,
      reagents,
    })

    if (saveError !== null) {
      setError(saveError)
    }
  }

  return (
    <form className="editor-form recipe-editor" onSubmit={handleSubmit}>
      <div className="recipe-editor__settings">
        <div className="compact-field">
          <label htmlFor="recipe-output-quantity">Предметов за один крафт</label>
          <NumberInput
            id="recipe-output-quantity"
            min={1}
            step={1}
            value={outputQuantity}
            onChange={(nextValue) => {
              changeDraft({ outputQuantity: nextValue })
            }}
          />
        </div>
        <SearchableSelect
          label="Профессия"
          options={PROFESSION_OPTIONS}
          value={profession}
          placeholder="Не указано"
          onChange={(nextProfession) => {
            const selectedProfession = PROFESSION_OPTIONS.find(
              (option) => option.value === nextProfession,
            )

            changeDraft({ profession: selectedProfession?.value ?? null })
          }}
        />
      </div>

      <section>
        <h3>Состав рецепта</h3>
        {reagents.length === 0 ? (
          <p className="empty-hint">Добавьте хотя бы один реагент.</p>
        ) : (
          <ul className="recipe-editor__list">
            {reagents.map((line) => {
              const reagent = catalog[line.itemId]

              if (reagent === undefined) {
                return null
              }

              const calculationOptions = { ownedProfessions: ownedProfessionSet, prices }
              const purchasePrice = resolveItemPrice(
                reagent,
                'purchasePriceCopper',
                prices,
              )
              const craftUnitCost = getCraftUnitCost(
                catalog,
                reagent.id,
                calculationOptions,
              )
              const automaticMethod = getAutomaticAcquisitionMethod(
                catalog,
                reagent.id,
                ownedProfessionSet,
                prices,
              )

              return (
                <li key={line.itemId}>
                  <strong>
                    <ItemName item={reagent} language={itemLanguage} />
                  </strong>
                  <div className="recipe-editor__quantity">
                    <label htmlFor={`reagent-quantity-${line.itemId}`}>Количество</label>
                    <NumberInput
                      id={`reagent-quantity-${line.itemId}`}
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={(nextValue) => {
                        updateLine(line.itemId, {
                          quantity: nextValue,
                        })
                      }}
                    />
                  </div>
                  <AcquisitionMethodPicker
                    value={line.acquisition}
                    purchasePrice={purchasePrice}
                    craftPrice={craftUnitCost}
                    automaticMethod={automaticMethod}
                    canBuy={purchasePrice !== null}
                    canCraft={reagent.recipe !== null}
                    showLegend
                    onChange={(acquisition) => {
                      updateLine(line.itemId, { acquisition })
                    }}
                  />
                  <Button
                    variant="danger-text"
                    type="button"
                    onClick={() => {
                      changeDraft({
                        reagents: reagents.filter(
                          (currentLine) => currentLine.itemId !== line.itemId,
                        ),
                      })
                    }}
                  >
                    Удалить
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="add-reagent">
        <SearchableSelect
          hideLabel
          label="Поиск и выбор реагента"
          options={availableOptions}
          value={selectedItemId}
          placeholder="Выберите предмет…"
          onChange={setSelectedItemId}
        />
        <Button
          variant="secondary"
          type="button"
          disabled={selectedItemId.length === 0}
          onClick={addReagent}
        >
          Добавить реагент
        </Button>
      </div>

      <FormError message={error} />

      <footer className="editor-form__actions">
        {item.recipe === null ? null : (
          <Button variant="danger-text" type="button" onClick={onRemove}>
            Удалить рецепт
          </Button>
        )}
        <span className="actions-spacer" />
        <Button variant="secondary" type="button" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="primary" type="submit">
          Сохранить рецепт
        </Button>
      </footer>
    </form>
  )
}
