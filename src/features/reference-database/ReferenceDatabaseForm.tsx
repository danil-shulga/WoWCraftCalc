import { ItemQuantityList } from '../../components/ui/ItemQuantityList/ItemQuantityList'
import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useDraftGuard } from '../../app/draft-guard'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { SearchField } from '../../components/ui/SearchField/SearchField'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import {
  getItemName,
  getItemSearchNames,
  normalizeItemName,
} from '../../domain/item-names'
import type { Item, ItemCatalog, ItemSection } from '../../domain/item.types'
import { GAME_VERSION_REGISTRY, professionOptionsFor } from '../../domain/game-version'
import type { GameVersion } from '../../domain/game-version'
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
  gameVersion?: GameVersion
  catalog: ItemCatalog
  section: ItemSection
  itemLanguage: ItemLanguage
  isActive: boolean
  targetItem?: Item
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
        <p>Будет добавлен реагент. Существующий рецепт сохранится.</p>
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
          {recipe === null ? 'Добавить реагент' : 'Подтвердить импорт'}
        </Button>
      </div>
    </section>
  )
}

function ReferenceBrowser(
  props: ReferenceDatabaseFormProps & { index: ReferenceDatabaseIndex },
) {
  const { index, section, itemLanguage, targetItem } = props
  const PROFESSION_OPTIONS = professionOptionsFor(index.database.gameVersion)
  const [initialItem] = useState(() => {
    if (targetItem === undefined) return undefined
    if (targetItem.source !== undefined)
      return index.database.items[String(targetItem.source.wowheadItemId)]
    const names = new Set(getItemSearchNames(targetItem).map(normalizeItemName))
    const matches = searchReferenceItems(index, 'crafts', '').filter((item) =>
      index.searchNames.get(item.itemId)?.some((name) => names.has(name)),
    )
    return matches.length === 1 ? matches[0] : undefined
  })
  const [query, setQuery] = useState(() =>
    initialItem === undefined ? '' : referenceItemName(initialItem, itemLanguage),
  )
  const [profession, setProfession] = useState('')
  const [page, setPage] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
    },
    [],
  )
  const changePage = (nextPage: number) => {
    setPage(nextPage)
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
    const list = resultsRef.current
    if (!list) return
    const startTop = list.scrollTop
    const startTime = performance.now()
    const animate = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - startTime) / 150))
      list.scrollTop = startTop * (1 - progress) ** 3
      scrollFrameRef.current = progress < 1 ? requestAnimationFrame(animate) : null
    }
    scrollFrameRef.current = requestAnimationFrame(animate)
  }
  const [selectedId, setSelectedId] = useState<number | null>(initialItem?.itemId ?? null)
  const [recipeId, setRecipeId] = useState(() => {
    const recipe =
      initialItem === undefined
        ? undefined
        : index.recipesByProduct.get(initialItem.itemId)?.[0]
    return recipe === undefined ? '' : String(recipe.spellId)
  })
  useDraftGuard(selectedId !== null)
  const selectedProfession =
    PROFESSION_OPTIONS.find((option) => option.value === profession)?.value ?? null
  const results = useMemo(
    () =>
      searchReferenceItems(
        index,
        section,
        query,
        professionOptionsFor(index.database.gameVersion).find(
          (option) => option.value === profession,
        )?.value ?? null,
        itemLanguage,
      ),
    [index, section, query, profession, itemLanguage],
  )
  const selected =
    selectedId === null ? undefined : index.database.items[String(selectedId)]
  const recipes =
    selectedId === null ? [] : (index.recipesByProduct.get(selectedId) ?? [])
  const recipe = index.database.recipes[recipeId] ?? null
  return (
    <div className="editor-form reference-db">
      <p className="reference-db__intro">
        База {GAME_VERSION_REGISTRY[index.database.gameVersion].name} ·{' '}
        {index.database.mode} · сборка {index.database.build}
        <br />
        {initialItem === undefined
          ? ' Выберите предмет и проверьте данные перед добавлением'
          : null}
      </p>
      {initialItem === undefined ? (
        <>
          <SearchField
            value={query}
            placeholder="Название RU или EN"
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
            ref={resultsRef}
            className="reference-db__results"
            role="group"
            aria-label="Результаты поиска в базе"
          >
            {results.length === 0 ? (
              <p>Ничего не найдено</p>
            ) : (
              results.slice(page * 50, (page + 1) * 50).map((item) => (
                <Button
                  variant="plain"
                  className="reference-db__result"
                  type="button"
                  key={item.itemId}
                  aria-pressed={selectedId === item.itemId}
                  onClick={() => {
                    setSelectedId(item.itemId)
                    const options = index.recipesByProduct.get(item.itemId) ?? []
                    const defaultRecipe =
                      options.find(
                        (option) => option.profession === selectedProfession,
                      ) ?? options[0]
                    setRecipeId(
                      defaultRecipe === undefined ? '' : String(defaultRecipe.spellId),
                    )
                  }}
                >
                  <ItemIdentity
                    item={{
                      name: String(item.itemId),
                      names: item.names,
                      iconUrl: item.iconUrl,
                    }}
                    language={itemLanguage}
                  />
                </Button>
              ))
            )}
          </div>
          <div className="reference-db__pages">
            <Button
              variant="secondary"
              type="button"
              disabled={page === 0}
              onClick={() => {
                changePage(page - 1)
              }}
            >
              Назад
            </Button>
            <span role="status">
              Найдено: {results.length} · Страница {page + 1} из{' '}
              {Math.max(1, Math.ceil(results.length / 50))}
            </span>
            <Button
              variant="secondary"
              type="button"
              disabled={(page + 1) * 50 >= results.length}
              onClick={() => {
                changePage(page + 1)
              }}
            >
              Далее
            </Button>
          </div>
        </>
      ) : null}
      {selected ? (
        <>
          {recipes.length > 0 ? (
            <SearchableSelect
              label="Рецепт"
              disabled={section !== 'reagents' && recipes.length === 1}
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
            <p>
              {recipes.length === 0
                ? 'В базе нет рецепта для этого предмета. Используйте ссылку Wowhead или ручной ввод.'
                : 'Выберите рецепт для предпросмотра.'}
            </p>
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
          <Button variant="secondary" type="button" onClick={props.onClose}>
            Отмена
          </Button>
        </div>
      )}
    </div>
  )
}

function ReferenceDatabaseFormForVersion(props: ReferenceDatabaseFormProps) {
  const gameVersion = props.gameVersion ?? 'forever'
  const [index, setIndex] = useState<ReferenceDatabaseIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!props.isActive || index !== null) return
    let active = true
    void loadReferenceDatabase(gameVersion).then(
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
  }, [props.isActive, index, attempt, gameVersion])
  if (index !== null) return <ReferenceBrowser {...props} index={index} />
  return (
    <div className="editor-form reference-db">
      <p>База {GAME_VERSION_REGISTRY[gameVersion].name}</p>
      {error === null ? (
        <p role="status">Загрузка базы…</p>
      ) : (
        <>
          <FormError message={error} />
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              setError(null)
              setAttempt(attempt + 1)
            }}
          >
            Повторить загрузку
          </Button>
        </>
      )}
      <div className="editor-form__actions">
        <Button variant="secondary" type="button" onClick={props.onClose}>
          Отмена
        </Button>
      </div>
    </div>
  )
}

export function ReferenceDatabaseForm(props: ReferenceDatabaseFormProps) {
  return (
    <ReferenceDatabaseFormForVersion key={props.gameVersion ?? 'forever'} {...props} />
  )
}
