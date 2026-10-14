import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useDraftSnapshot } from '../../app/draft-guard'
import { useMemo, useState, type SyntheticEvent } from 'react'

import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import type { Item, ItemCatalog, Recipe, RecipeLine } from '../../domain/item.types'
import type { Profession } from '../../domain/professions'
import { professionOptionsFor } from '../../domain/game-version'
import type { GameVersion } from '../../domain/game-version'
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
  item,
  gameVersion = 'forever',
  itemLanguage = 'ru',
  catalog,
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
  const [reagentRows, setReagentRows] = useState(reagents)
  const [selectedItemId, setSelectedItemId] = useState('')
  useDraftSnapshot({ outputQuantity, profession, reagents, selectedItemId })
  const [error, setError] = useState<string | null>(null)

  const selectedIds = useMemo(
    () => new Set(reagentRows.map((line) => line.itemId)),
    [reagentRows],
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
        item: availableItem,
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
    setReagentRows((rows) =>
      rows.map((row) => next.reagents.find((line) => line.itemId === row.itemId) ?? row),
    )
    onDraftChange?.(next)
  }

  const addReagent = () => {
    const selectedItem = catalog[selectedItemId]

    if (selectedItem === undefined) {
      return
    }

    const line: RecipeLine = { itemId: selectedItem.id, quantity: 1, acquisition: 'auto' }
    changeDraft({ reagents: [...reagents, line] })
    setReagentRows((rows) => [...rows, line])
    setSelectedItemId('')
  }

  const updateLine = (
    reagentItemId: string,
    updates: Partial<Pick<RecipeLine, 'quantity'>>,
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
        <div className="recipe-editor__composition">
          <p
            className="empty-hint"
            data-populated={reagentRows.length > 0 || undefined}
            aria-hidden={reagentRows.length > 0}
          >
            Добавьте хотя бы один реагент.
          </p>
          <ul className="recipe-editor__list">
            {reagentRows.map((row) => {
              const activeLine = reagents.find((line) => line.itemId === row.itemId)
              const line = activeLine ?? row
              const isRemoving = activeLine === undefined
              const reagent = catalog[line.itemId]

              if (reagent === undefined) {
                return null
              }

              return (
                <li
                  key={line.itemId}
                  className="recipe-editor__reagent"
                  data-removing={isRemoving || undefined}
                  aria-hidden={isRemoving}
                  inert={isRemoving}
                  onAnimationEnd={(event) => {
                    if (event.target === event.currentTarget && isRemoving) {
                      setReagentRows((rows) =>
                        rows.filter((current) => current.itemId !== line.itemId),
                      )
                    }
                  }}
                >
                  <div className="recipe-editor__reagent-clip">
                    <div className="recipe-editor__reagent-content">
                      <ItemIdentity
                        item={reagent}
                        language={itemLanguage}
                        nameAs="strong"
                      />
                      <NumberInput
                        id={`reagent-quantity-${line.itemId}`}
                        ariaLabel={`Количество: ${getItemName(reagent, itemLanguage)}`}
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(nextValue) => {
                          updateLine(line.itemId, {
                            quantity: nextValue,
                          })
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
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <div className="add-reagent">
        <SearchableSelect
          hideLabel
          showSecondaryLabel={false}
          label="Поиск и выбор реагента"
          itemLanguage={itemLanguage}
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
