import { useMemo, useState } from 'react'

import { ItemTree } from '../components/item-tree/ItemTree/ItemTree'
import { ConfirmDialog } from '../components/ui/ConfirmDialog/ConfirmDialog'
import { Modal } from '../components/ui/Modal/Modal'
import { SearchField } from '../components/ui/SearchField/SearchField'
import { createCatalogCalculationSnapshot } from '../domain/calculations'
import type { ItemId, ItemPriceField, ItemSection, Recipe } from '../domain/item.types'
import { ItemForm } from '../features/item-editor/ItemForm'
import { RecipeEditor } from '../features/recipe-editor/RecipeEditor'
import { selectItemsBySection } from '../store/craft.selectors'
import { useCraftStore } from '../store/useCraftStore'
import '../components/ui/Button.css'
import './ItemsPage.css'
import './PageLayout.css'

interface ItemsPageProps {
  section: ItemSection
}

const pageContent: Record<
  ItemSection,
  { title: string; description: string; addLabel: string }
> = {
  crafts: {
    title: 'Крафты',
    description:
      'Добавляйте готовые предметы, задавайте цену продажи и составляйте рецепты.',
    addLabel: 'Добавить крафт',
  },
  reagents: {
    title: 'Реагенты',
    description:
      'Укажите цену покупки или добавьте рецепт, если реагент можно изготовить.',
    addLabel: 'Добавить реагент',
  },
}

export function ItemsPage({ section }: ItemsPageProps) {
  const items = useCraftStore((state) => state.items)
  const ownedProfessions = useCraftStore((state) => state.ownedProfessions)
  const createItem = useCraftStore((state) => state.createItem)
  const updateItem = useCraftStore((state) => state.updateItem)
  const setItemPrice = useCraftStore((state) => state.setItemPrice)
  const removeItem = useCraftStore((state) => state.removeItem)
  const setRecipe = useCraftStore((state) => state.setRecipe)
  const setAcquisition = useCraftStore((state) => state.setAcquisition)

  const [isCreating, setIsCreating] = useState(false)
  const [editingItemId, setEditingItemId] = useState<ItemId | null>(null)
  const [editingRecipeId, setEditingRecipeId] = useState<ItemId | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<ItemId | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [priceDrafts, setPriceDrafts] = useState<Record<ItemId, number | null> | null>(
    null,
  )

  const content = pageContent[section]
  const priceField: ItemPriceField =
    section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
  const sectionItems = useMemo(
    () => selectItemsBySection(items, section),
    [items, section],
  )
  const visibleItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ru-RU')

    if (normalizedQuery.length === 0) {
      return sectionItems
    }

    return sectionItems.filter((item) =>
      item.name.toLocaleLowerCase('ru-RU').includes(normalizedQuery),
    )
  }, [searchQuery, sectionItems])
  const ownedProfessionSet = useMemo(() => new Set(ownedProfessions), [ownedProfessions])
  const calculationSnapshot = useMemo(
    () =>
      createCatalogCalculationSnapshot(
        items,
        ownedProfessionSet,
        new Set(visibleItems.map((item) => item.id)),
      ),
    [items, ownedProfessionSet, visibleItems],
  )
  const editingItem = editingItemId === null ? undefined : items[editingItemId]
  const recipeItem = editingRecipeId === null ? undefined : items[editingRecipeId]
  const deletingItem = deletingItemId === null ? undefined : items[deletingItemId]

  const toggleExpanded = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current)

      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }

      return next
    })
  }

  const saveRecipe = (itemId: ItemId, recipe: Recipe): string | null => {
    const error = setRecipe(itemId, recipe)

    if (error === null) {
      setEditingRecipeId(null)
    }

    return error
  }

  const startPriceEditing = () => {
    const drafts: Record<ItemId, number | null> = {}

    for (const item of sectionItems) {
      drafts[item.id] = item[priceField]
    }

    setPriceDrafts(drafts)
  }

  const savePriceDrafts = () => {
    if (priceDrafts === null) {
      return
    }

    for (const [itemId, value] of Object.entries(priceDrafts)) {
      setItemPrice(itemId, priceField, value)
    }

    setPriceDrafts(null)
  }

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <div className="page__actions">
          {priceDrafts === null ? (
            <>
              {sectionItems.length === 0 ? null : (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={startPriceEditing}
                >
                  Редактировать цены
                </button>
              )}
              <button
                className="button button--primary"
                type="button"
                onClick={() => {
                  setIsCreating(true)
                }}
              >
                + {content.addLabel}
              </button>
            </>
          ) : (
            <>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setPriceDrafts(null)
                }}
              >
                Отмена
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={savePriceDrafts}
              >
                Сохранить все
              </button>
            </>
          )}
        </div>
      </header>

      {sectionItems.length === 0 ? (
        <div className="empty-state">
          <strong>Здесь пока ничего нет</strong>
          <p>Создайте первый предмет, затем добавьте ему рецепт и цены.</p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => {
              setIsCreating(true)
            }}
          >
            {content.addLabel}
          </button>
        </div>
      ) : (
        <div className="items-content">
          <SearchField value={searchQuery} onChange={setSearchQuery} />

          {visibleItems.length === 0 ? (
            <div className="search-empty-state">
              <strong>Ничего не найдено</strong>
              <p>Попробуйте изменить поисковый запрос.</p>
            </div>
          ) : (
            <div className="item-list">
              {visibleItems.map((item) => (
                <ItemTree
                  key={item.id}
                  rootItemId={item.id}
                  catalog={items}
                  calculationSnapshot={calculationSnapshot}
                  {...(priceDrafts === null
                    ? {}
                    : {
                        quickPriceEdit: {
                          field: priceField,
                          value: priceDrafts[item.id] ?? null,
                          onChange: (value: number | null) => {
                            setPriceDrafts((current) =>
                              current === null ? null : { ...current, [item.id]: value },
                            )
                          },
                        },
                      })}
                  expandedPaths={expandedPaths}
                  onToggleExpanded={toggleExpanded}
                  onEditItem={setEditingItemId}
                  onEditRecipe={setEditingRecipeId}
                  onDeleteItem={setDeletingItemId}
                  onSetAcquisition={setAcquisition}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {isCreating ? (
        <Modal
          title={content.addLabel}
          onClose={() => {
            setIsCreating(false)
          }}
        >
          <ItemForm
            defaultSection={section}
            onCancel={() => {
              setIsCreating(false)
            }}
            onSave={(input) => {
              createItem(input)
              setIsCreating(false)
            }}
          />
        </Modal>
      ) : null}

      {editingItem === undefined ? null : (
        <Modal
          title={`Редактировать: ${editingItem.name}`}
          onClose={() => {
            setEditingItemId(null)
          }}
        >
          <ItemForm
            initialItem={editingItem}
            defaultSection={section}
            onCancel={() => {
              setEditingItemId(null)
            }}
            onSave={(input) => {
              updateItem(editingItem.id, input)
              setEditingItemId(null)
            }}
          />
        </Modal>
      )}

      {recipeItem === undefined ? null : (
        <Modal
          title={`Рецепт: ${recipeItem.name}`}
          onClose={() => {
            setEditingRecipeId(null)
          }}
        >
          <RecipeEditor
            item={recipeItem}
            catalog={items}
            ownedProfessions={ownedProfessions}
            onCancel={() => {
              setEditingRecipeId(null)
            }}
            onRemove={() => {
              setRecipe(recipeItem.id, null)
              setEditingRecipeId(null)
            }}
            onSave={(recipe) => saveRecipe(recipeItem.id, recipe)}
          />
        </Modal>
      )}

      {deletingItem === undefined ? null : (
        <ConfirmDialog
          title="Удалить предмет?"
          message={`«${deletingItem.name}» также исчезнет из всех рецептов. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          onCancel={() => {
            setDeletingItemId(null)
          }}
          onConfirm={() => {
            removeItem(deletingItem.id)
            setDeletingItemId(null)
          }}
        />
      )}
    </section>
  )
}
