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
