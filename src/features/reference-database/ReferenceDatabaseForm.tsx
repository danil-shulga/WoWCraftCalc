import { useEffect, useId, useMemo, useState } from 'react'

import { ItemIcon } from '../../components/ui/ItemIcon/ItemIcon'
import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { SearchField } from '../../components/ui/SearchField/SearchField'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import { getItemName } from '../../domain/item-names'
import type { ItemCatalog, ItemSection } from '../../domain/item.types'
import { PROFESSION_OPTIONS } from '../../domain/professions'
import {
  referenceItemToImport,
  referenceRecipeToImport,
} from '../../domain/reference-database-import'
import {
  referenceItemName,
  searchReferenceItems,
  type ReferenceDatabaseIndex,
} from '../../domain/reference-database-index'
import type {
  ReferenceItem,
  ReferenceRecipe,
} from '../../domain/reference-database.types'
import type { ItemLanguage } from '../../domain/user-settings'
import {
  findImportedItem,
  type RecipeImportData,
  type RecipeImportItem,
  type RecipeImportResult,
  type ReferenceItemAddResult,
} from '../../store/useCraftStore'
import { loadReferenceDatabase } from './reference-database-loader'
import '../EditorForm.css'
import './ReferenceDatabaseForm.css'

interface ReferenceDatabaseFormProps {
  catalog: ItemCatalog
  section: ItemSection
  itemLanguage: ItemLanguage
  isActive: boolean
  onImport: (data: RecipeImportData) => RecipeImportResult
  onAddItem: (data: RecipeImportItem) => ReferenceItemAddResult
  onSuccess: (message: string) => void
  onClose: () => void
}

interface ReviewProps extends ReferenceDatabaseFormProps {
  index: ReferenceDatabaseIndex
  item: ReferenceItem
  recipe: ReferenceRecipe | null
}

function ReferenceReview({
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
}: ReviewProps) {
  const outputId = useId()
  const imported = referenceItemToImport(item, itemLanguage)
  const [savedRecipe] = useState(
    () => findImportedItem(catalog, imported)?.recipe ?? null,
  )
  const [output, setOutput] = useState(
    () =>
      savedRecipe?.outputQuantity ??
      recipe?.output.quantity ??
      recipe?.output.baseQuantityCandidate ??
      1,
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
      <div className="reference-db__item reference-db__product">
        <ItemIcon
          iconUrl={item.iconUrl}
          itemName={referenceItemName(item, itemLanguage)}
        />
        <div>
          <h3>{referenceItemName(item, itemLanguage)}</h3>
          <small>{item.names[itemLanguage === 'ru' ? 'en' : 'ru']}</small>
        </div>
      </div>
      {recipe === null ? (
        <p>Будет добавлен реагент. Существующий рецепт сохранится.</p>
      ) : (
        <>
          <ul className="reference-db__ingredients" aria-label="Состав рецепта">
            {recipe.reagents.map((line) => {
              const reagent = index.database.items[String(line.itemId)]
              if (!reagent) return null
              return (
                <li key={line.itemId}>
                  <span className="reference-db__item">
                    <ItemIcon
                      iconUrl={reagent.iconUrl}
                      itemName={referenceItemName(reagent, itemLanguage)}
                    />
                    <span>{referenceItemName(reagent, itemLanguage)}</span>
                  </span>
                  <strong>× {line.quantity}</strong>
                </li>
              )
            })}
          </ul>
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
            Цены из базы заполнят только незаданные поля. Цены, вложенные рецепты и ручной
            выбор получения сохранятся.
          </small>
        </>
      )}
      {error !== null ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <div className="editor-form__actions">
        <button className="button button--secondary" type="button" onClick={onClose}>
          Отмена
        </button>
        <button className="button button--primary" type="button" onClick={confirm}>
          {recipe === null ? 'Добавить реагент' : 'Подтвердить импорт'}
        </button>
      </div>
    </section>
  )
}

function ReferenceBrowser(
  props: ReferenceDatabaseFormProps & { index: ReferenceDatabaseIndex },
) {
  const { index, section, itemLanguage } = props
  const [query, setQuery] = useState('')
  const [profession, setProfession] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [recipeId, setRecipeId] = useState('')
  const selectedProfession =
    PROFESSION_OPTIONS.find((option) => option.value === profession)?.value ?? null
  const results = useMemo(
    () => searchReferenceItems(index, section, query, selectedProfession, itemLanguage),
    [index, section, query, selectedProfession, itemLanguage],
  )
  const selected =
    selectedId === null ? undefined : index.database.items[String(selectedId)]
  const recipes =
    selectedId === null ? [] : (index.recipesByProduct.get(selectedId) ?? [])
  const recipe = index.database.recipes[recipeId] ?? null
  return (
    <div className="editor-form reference-db">
      <p className="reference-db__intro">
        База Forever · сборка {index.database.build}. Выберите предмет и проверьте данные
        перед добавлением. Наличие рецепта в базе не гарантирует его доступность в игре.
      </p>
      <SearchField
        value={query}
        placeholder="Название RU или EN…"
        onChange={(value) => {
          setQuery(value)
          setPage(0)
        }}
      />
      <SearchableSelect
        label={section === 'crafts' ? 'Профессия' : 'Используется в профессии'}
        value={profession}
        options={[{ value: '', label: 'Все профессии' }, ...PROFESSION_OPTIONS]}
        onChange={(value) => {
          setProfession(value)
          setPage(0)
        }}
      />
      <div
        className="reference-db__results"
        role="group"
        aria-label="Результаты поиска в базе"
      >
        {results.length === 0 ? (
          <p>Ничего не найдено</p>
        ) : (
          results.slice(page * 50, (page + 1) * 50).map((item) => (
            <button
              className="reference-db__result"
              type="button"
              key={item.itemId}
              aria-pressed={selectedId === item.itemId}
              onClick={() => {
                setSelectedId(item.itemId)
                const options = index.recipesByProduct.get(item.itemId) ?? []
                const defaultRecipe =
                  options.find((option) => option.profession === selectedProfession) ??
                  options[0]
                setRecipeId(
                  defaultRecipe === undefined ? '' : String(defaultRecipe.spellId),
                )
              }}
            >
              <ItemIcon
                iconUrl={item.iconUrl}
                itemName={referenceItemName(item, itemLanguage)}
              />
              <span>
                {referenceItemName(item, itemLanguage)}
                <small>{item.names[itemLanguage === 'ru' ? 'en' : 'ru']}</small>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="reference-db__pages">
        <button
          className="button button--secondary"
          type="button"
          disabled={page === 0}
          onClick={() => {
            setPage(page - 1)
          }}
        >
          Назад
        </button>
        <span role="status">
          Найдено: {results.length} · Страница {page + 1} из{' '}
          {Math.max(1, Math.ceil(results.length / 50))}
        </span>
        <button
          className="button button--secondary"
          type="button"
          disabled={(page + 1) * 50 >= results.length}
          onClick={() => {
            setPage(page + 1)
          }}
        >
          Далее
        </button>
      </div>
      {selected ? (
        <>
          {recipes.length > 0 ? (
            <SearchableSelect
              label="Рецепт"
              value={recipeId}
              placeholder="Выберите рецепт…"
              options={[
                ...(section === 'reagents'
                  ? [{ value: '', label: 'Только реагент, без импорта рецепта' }]
                  : []),
                ...recipes.map((option) => ({
                  value: String(option.spellId),
                  label:
                    PROFESSION_OPTIONS.find(
                      (professionOption) => professionOption.value === option.profession,
                    )?.label ?? option.profession,
                })),
              ]}
              onChange={setRecipeId}
            />
          ) : null}
          {section === 'crafts' && recipe === null ? (
            <p>У предмета несколько рецептов. Выберите один для предпросмотра.</p>
          ) : (
            <ReferenceReview
              key={`${String(selected.itemId)}-${recipeId}`}
              {...props}
              item={selected}
              recipe={recipe}
            />
          )}
        </>
      ) : (
        <div className="editor-form__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={props.onClose}
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  )
}

export function ReferenceDatabaseForm(props: ReferenceDatabaseFormProps) {
  const [index, setIndex] = useState<ReferenceDatabaseIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!props.isActive || index !== null) return
    let active = true
    void loadReferenceDatabase().then(
      (loaded) => {
        if (active) setIndex(loaded)
      },
      (caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Не удалось загрузить базу. Проверьте соединение.',
          )
      },
    )
    return () => {
      active = false
    }
  }, [props.isActive, index, attempt])
  if (index !== null) return <ReferenceBrowser {...props} index={index} />
  return (
    <div className="editor-form reference-db">
      <p>База Forever</p>
      {error === null ? (
        <p role="status">Загрузка базы…</p>
      ) : (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              setError(null)
              setAttempt(attempt + 1)
            }}
          >
            Повторить загрузку
          </button>
        </>
      )}
      <div className="editor-form__actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={props.onClose}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
