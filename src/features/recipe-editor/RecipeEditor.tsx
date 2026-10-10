import { useMemo, useState, type SyntheticEvent } from 'react'

import { AcquisitionMethodPicker } from '../../components/ui/AcquisitionMethodPicker/AcquisitionMethodPicker'
import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import { getCraftUnitCost } from '../../domain/calculations'
import type { Item, ItemCatalog, Recipe, RecipeLine } from '../../domain/item.types'
import { PROFESSION_OPTIONS, type Profession } from '../../domain/professions'
import { selectAvailableReagents } from '../../store/craft.selectors'
import '../../components/ui/Button.css'
import '../EditorForm.css'
import './RecipeEditor.css'

interface RecipeEditorProps {
  item: Item
  catalog: ItemCatalog
  onSave: (recipe: Recipe) => string | null
  onRemove: () => void
  onCancel: () => void
}

export function RecipeEditor({
  item,
  catalog,
  onSave,
  onRemove,
  onCancel,
}: RecipeEditorProps) {
  const [outputQuantity, setOutputQuantity] = useState(item.recipe?.outputQuantity ?? 1)
  const [profession, setProfession] = useState<Profession | ''>(
    item.recipe?.profession ?? '',
  )
  const [reagents, setReagents] = useState<RecipeLine[]>(
    item.recipe?.reagents.map((line) => ({ ...line })) ?? [],
  )
  const [selectedItemId, setSelectedItemId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selectedIds = useMemo(
    () => new Set(reagents.map((line) => line.itemId)),
    [reagents],
  )
  const availableItems = useMemo(
    () => selectAvailableReagents(catalog, item.id, selectedIds),
    [catalog, item.id, selectedIds],
  )
  const availableOptions = useMemo(
    () =>
      availableItems.map((availableItem) => ({
        value: availableItem.id,
        label: availableItem.name,
      })),
    [availableItems],
  )

  const addReagent = () => {
    const selectedItem = catalog[selectedItemId]

    if (selectedItem === undefined) {
      return
    }

    setReagents((current) => [
      ...current,
      {
        itemId: selectedItem.id,
        quantity: 1,
        acquisition:
          selectedItem.purchasePriceCopper === null && selectedItem.recipe !== null
            ? 'craft'
            : 'buy',
      },
    ])
    setSelectedItemId('')
  }

  const updateLine = (
    reagentItemId: string,
    updates: Partial<Pick<RecipeLine, 'quantity' | 'acquisition'>>,
  ) => {
    setReagents((current) =>
      current.map((line) =>
        line.itemId === reagentItemId ? { ...line, ...updates } : line,
      ),
    )
  }

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()

    if (outputQuantity < 1) {
      setError('Количество результата должно быть не меньше одного')
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
              setOutputQuantity(nextValue)
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

            setProfession(selectedProfession?.value ?? '')
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

              const craftUnitCost = getCraftUnitCost(catalog, reagent.id)

              return (
                <li key={line.itemId}>
                  <strong>{reagent.name}</strong>
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
                    purchasePrice={reagent.purchasePriceCopper}
                    craftPrice={craftUnitCost}
                    canBuy={reagent.purchasePriceCopper !== null}
                    canCraft={reagent.recipe !== null}
                    showLegend
                    onChange={(acquisition) => {
                      updateLine(line.itemId, { acquisition })
                    }}
                  />
                  <button
                    className="button button--danger-text"
                    type="button"
                    onClick={() => {
                      setReagents((current) =>
                        current.filter(
                          (currentLine) => currentLine.itemId !== line.itemId,
                        ),
                      )
                    }}
                  >
                    Удалить
                  </button>
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
        <button
          className="button button--secondary"
          type="button"
          disabled={selectedItemId.length === 0}
          onClick={addReagent}
        >
          Добавить реагент
        </button>
      </div>

      {error === null ? null : <p className="form-error">{error}</p>}

      <footer className="editor-form__actions">
        {item.recipe === null ? null : (
          <button className="button button--danger-text" type="button" onClick={onRemove}>
            Удалить рецепт
          </button>
        )}
        <span className="actions-spacer" />
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="button button--primary" type="submit">
          Сохранить рецепт
        </button>
      </footer>
    </form>
  )
}
