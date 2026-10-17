import { FormError } from '../../components/ui/FormError/FormError'
import {
  referenceItemToImport,
  referenceRecipeToImport,
} from '../../domain/reference-database-import'
import type { ReferenceImportEntry } from '../../domain/recipe-import.types'
import { ReferenceSelection } from './ReferenceSelection'
import { useReferenceDrafts } from './useReferenceDrafts'
import { Button } from '../../components/ui/Button/Button'
import { useDraftGuard } from '../../app/draft-guard'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { SearchField } from '../../components/ui/SearchField/SearchField'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import { getItemSearchNames, normalizeItemName } from '../../domain/item-names'
import { GAME_VERSION_REGISTRY, professionOptionsFor } from '../../domain/game-version'
import {
  referenceItemName,
  searchReferenceItems,
  type ReferenceDatabaseIndex,
} from '../../domain/reference-database-index'
import type { ReferenceDatabaseFormProps } from './reference-database-form.types'
import { ReferenceReview } from './ReferenceReview'

export function ReferenceBrowser(
  props: ReferenceDatabaseFormProps & { index: ReferenceDatabaseIndex },
) {
  const { index, section, itemLanguage, targetItem, catalog } = props
  const isBatch = targetItem === undefined
  const [error, setError] = useState<string | null>(null)
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
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      list.scrollTop = 0
      return
    }
    const startTop = list.scrollTop
    const startTime = performance.now()
    const animate = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - startTime) / 150))
      list.scrollTop = startTop * (1 - progress) ** 3
      scrollFrameRef.current = progress < 1 ? requestAnimationFrame(animate) : null
    }
    scrollFrameRef.current = requestAnimationFrame(animate)
  }
  const selection = useReferenceDrafts({
    index,
    catalog,
    itemLanguage,
    targetItem,
    initialItem,
    profession,
  })
  const selectedId = selection.previewId
  const recipeId = selection.preview?.recipeId ?? ''
  useDraftGuard(selection.selectedIds.length > 0 || selectedId !== null)
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
  const fail = (message: string, sourceId?: number) => {
    const item =
      sourceId === undefined ? undefined : index.database.items[String(sourceId)]
    setError(item ? `${referenceItemName(item, itemLanguage)}: ${message}` : message)
    if (sourceId !== undefined && item) selection.open(sourceId)
  }
  const confirm = () => {
    setError(null)
    if (props.targetItem !== undefined) {
      if (!recipe || !selection.preview) return
      try {
        const data = referenceRecipeToImport(
          index.database,
          recipe,
          selection.preview.output,
          itemLanguage,
        )
        const result = props.onImport({ ...data, productSection: section })
        if (!result.success) {
          fail(result.error)
          return
        }
        const created = Number(result.productCreated) + result.reagentsCreated
        props.onSuccess(
          `Из базы: добавлено предметов ${String(created)}, переиспользовано ${String(recipe.reagents.length + 1 - created)}. Рецепт сохранён.`,
        )
        props.onClose()
      } catch (caught) {
        fail(
          caught instanceof Error
            ? caught.message
            : 'Не удалось добавить предмет из базы',
        )
      }
      return
    }
    const entries: ReferenceImportEntry[] = []
    for (const id of selection.selectedIds) {
      const item = index.database.items[String(id)]
      const draft = selection.drafts.find((entry) => entry.itemId === id)
      if (!item || !draft) return
      const recipe = index.database.recipes[draft.recipeId]
      try {
        if (!recipe && section === 'crafts') throw new Error('Выберите рецепт для крафта')
        entries.push(
          recipe
            ? {
                kind: 'recipe',
                data: referenceRecipeToImport(
                  index.database,
                  recipe,
                  draft.output,
                  itemLanguage,
                ),
              }
            : {
                kind: 'item',
                item: referenceItemToImport(
                  item,
                  index.database.gameVersion,
                  itemLanguage,
                ),
              },
        )
      } catch (caught) {
        fail(
          caught instanceof Error ? caught.message : 'Не удалось подготовить предмет',
          id,
        )
        return
      }
    }
    try {
      const result = props.onImportBatch(entries)
      if (!result.success) {
        fail(result.error, result.sourceItemId)
        return
      }
      props.onSuccess(
        `Из базы: выбрано ${String(entries.length)}, добавлено предметов ${String(result.created)}, переиспользовано ${String(result.reused)}. Сохранено рецептов: ${String(result.recipes)}.`,
      )
      props.onClose()
    } catch (caught) {
      fail(
        caught instanceof Error ? caught.message : 'Не удалось добавить предметы из базы',
      )
    }
  }
  return (
    <div className="editor-form reference-db">
      <p className="reference-db__intro">
        База {GAME_VERSION_REGISTRY[index.database.gameVersion].name} ·{' '}
        {index.database.mode} · сборка {index.database.build}
        <br />
        {initialItem === undefined
          ? isBatch
            ? 'Выберите один или несколько предметов и проверьте данные перед добавлением'
            : 'Выберите рецепт редактируемого предмета'
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
            label={section !== 'reagents' ? 'Профессия' : 'Используется в профессии'}
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
                  key={item.itemId}
                  variant="plain"
                  type="button"
                  className="reference-db__result"
                  aria-pressed={
                    isBatch
                      ? selection.selectedIds.includes(item.itemId)
                      : selectedId === item.itemId
                  }
                  onClick={() => {
                    if (isBatch)
                      selection.toggle(
                        item.itemId,
                        !selection.selectedIds.includes(item.itemId),
                      )
                    else selection.open(item.itemId)
                  }}
                >
                  <ItemIdentity
                    item={{ ...item, name: String(item.itemId) }}
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
      {isBatch ? (
        <ReferenceSelection
          index={index}
          itemLanguage={itemLanguage}
          selectedIds={selection.selectedIds}
          rows={selection.rows}
          previewId={selectedId}
          onOpen={selection.open}
          onRemove={(id) => {
            selection.toggle(id, false)
          }}
          onClear={selection.clear}
          onExit={selection.finishExit}
        />
      ) : null}
      {selected ? (
        <>
          {recipes.length > 0 ? (
            <SearchableSelect
              label="Рецепт"
              disabled={section === 'crafts' && recipes.length === 1}
              value={recipeId}
              placeholder="Выберите рецепт…"
              options={[
                ...(section !== 'crafts'
                  ? [
                      {
                        value: '',
                        label:
                          section === 'disenchanting'
                            ? 'Только предмет, без импорта рецепта'
                            : 'Только реагент, без импорта рецепта',
                      },
                    ]
                  : []),
                ...recipes.map((option) => ({
                  value: String(option.spellId),
                  label:
                    PROFESSION_OPTIONS.find(
                      (professionOption) => professionOption.value === option.profession,
                    )?.label ?? option.profession,
                })),
              ]}
              onChange={selection.setRecipeId}
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
              key={String(selected.itemId)}
              index={index}
              item={selected}
              recipe={recipe}
              catalog={catalog}
              section={section}
              itemLanguage={itemLanguage}
              targetItem={targetItem}
              output={selection.preview?.output ?? 1}
              onOutputChange={selection.setOutput}
            />
          )}
        </>
      ) : null}
      <FormError message={error} />
      <div className="editor-form__actions">
        <Button variant="secondary" type="button" onClick={props.onClose}>
          Отмена
        </Button>
        {isBatch || recipe !== null ? (
          <Button
            variant="primary"
            type="button"
            onClick={confirm}
            disabled={isBatch ? selection.selectedIds.length === 0 : recipe === null}
          >
            {isBatch
              ? `Добавить выбранные (${String(selection.selectedIds.length)})`
              : 'Подтвердить импорт'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
