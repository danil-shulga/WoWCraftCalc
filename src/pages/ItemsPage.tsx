import { Button } from '../components/ui/Button/Button'
import { usePriceContext } from '../features/tsm/tsm-client'
import { Checkbox } from '../components/ui/Checkbox/Checkbox'
import { useDraftGuard } from '../app/draft-guard'
import { selectActiveItems, selectActiveProfessions } from '../store/craft.selectors'
import { useCallback, useMemo, useRef, useState } from 'react'
import { selectActiveWorkspace } from '../store/craft.selectors'
import { useRootItemDrag } from './useRootItemDrag'

import { ItemTree } from '../components/item-tree/ItemTree/ItemTree'
import { ConfirmDialog } from '../components/ui/ConfirmDialog/ConfirmDialog'
import { ItemIdentity } from '../components/ui/ItemIdentity/ItemIdentity'
import { SearchField } from '../components/ui/SearchField/SearchField'
import { Toast } from '../components/ui/Toast/Toast'
import { createCatalogCalculationSnapshot } from '../domain/calculations'
import { getItemName, matchesItemName } from '../domain/item-names'
import type { ItemId, ItemPriceField, ItemSection } from '../domain/item.types'
import { ItemAddModal } from '../features/item-editor/ItemAddModal'
import { ItemEditModal } from '../features/item-editor/ItemEditModal'
import { selectItemsBySection } from '../store/craft.selectors'
import { useCraftStore } from '../store/useCraftStore'
import './ItemsPage.css'
import './PageLayout.css'
import { selectPlannerTargets } from '../store/craft.selectors'

interface ItemsPageProps {
  section: ItemSection | 'favorites'
}

const pageContent: Record<
  ItemSection | 'favorites',
  { title: string; description: string; addLabel: string }
> = {
  favorites: {
    title: 'Избранное',
    description: 'Избранные крафты и реагенты текущей версии игры.',
    addLabel: '',
  },
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
  const plannerTargets = useCraftStore(selectPlannerTargets)
  const setPlannerQuantity = useCraftStore((state) => state.setPlannerQuantity)
  const removePlannerTarget = useCraftStore((state) => state.removePlannerTarget)
  const prices = usePriceContext()
  const setTbcPricing = useCraftStore((state) => state.setTbcPricing)
  const gameVersion = useCraftStore((state) => state.activeVersion)
  const [request] = useState(() => ({
    version: useCraftStore.getState().activeVersion,
    revision: useCraftStore.getState().workspaceRevision,
  }))
  const items = useCraftStore(selectActiveItems)
  const rootItemOrder = useCraftStore(
    (state) => selectActiveWorkspace(state).rootItemOrder,
  )
  const moveRootItem = useCraftStore((state) => state.moveRootItem)
  const itemLanguage = useCraftStore((state) => state.itemLanguage)
  const ownedProfessions = useCraftStore(selectActiveProfessions)
  const createItem = useCraftStore((state) => state.createItem)
  const saveItemEdit = useCraftStore((state) => state.saveItemEdit)
  const setItemPrices = useCraftStore((state) => state.setItemPrices)
  const removeItem = useCraftStore((state) => state.removeItem)
  const setItemFavorite = useCraftStore((state) => state.setItemFavorite)
  const setAcquisition = useCraftStore((state) => state.setAcquisition)
  const importRecipe = useCraftStore((state) => state.importRecipe)
  const addReferenceItem = useCraftStore((state) => state.addReferenceItem)

  const [isCreating, setIsCreating] = useState(false)
  const [notification, setNotification] = useState<{
    id: number
    message: string
  } | null>(null)
  const closeNotification = useCallback(() => {
    setNotification(null)
  }, [setNotification])
  const [editingItemId, setEditingItemId] = useState<ItemId | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<ItemId | null>(null)
  const [removingFavoriteId, setRemovingFavoriteId] = useState<ItemId | null>(null)
  const favoriteTriggerRef = useRef<HTMLElement | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [priceDrafts, setPriceDrafts] = useState<Record<ItemId, number | null> | null>(
    null,
  )

  const content = pageContent[section]
  const priceField: ItemPriceField =
    section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
  useDraftGuard(
    priceDrafts !== null &&
      Object.entries(priceDrafts).some(
        ([id, value]) => value !== items[id]?.[priceField],
      ),
  )
  const sectionItems = useMemo(
    () => selectItemsBySection(items, section, itemLanguage, rootItemOrder?.[section]),
    [items, section, itemLanguage, rootItemOrder],
  )
  const visibleItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ru-RU')

    if (normalizedQuery.length === 0) {
      return sectionItems
    }

    return sectionItems.filter((item) => matchesItemName(item, searchQuery))
  }, [searchQuery, sectionItems])
  const moveDraggedItem = useCallback(
    (itemId: ItemId, targetId: ItemId, position: 'before' | 'after') => {
      moveRootItem(section, itemId, targetId, position)
    },
    [moveRootItem, section],
  )
  const {
    listRef,
    draggingId,
    dropTarget,
    onPointerDown: startPointerDrag,
    onClickCapture: suppressDragClick,
  } = useRootItemDrag(visibleItems, moveDraggedItem)
  const ownedProfessionSet = useMemo(() => new Set(ownedProfessions), [ownedProfessions])
  const calculationSnapshot = useMemo(
    () =>
      createCatalogCalculationSnapshot(
        items,
        ownedProfessionSet,
        new Set(visibleItems.map((item) => item.id)),
        prices,
      ),
    [items, ownedProfessionSet, visibleItems, prices],
  )
  const editingItem = editingItemId === null ? undefined : items[editingItemId]
  const deletingItem = deletingItemId === null ? undefined : items[deletingItemId]
  const removingFavorite =
    removingFavoriteId === null ? undefined : items[removingFavoriteId]

  const toggleFavorite = (itemId: ItemId) => {
    if (items[itemId]?.isFavorite) {
      favoriteTriggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setRemovingFavoriteId(itemId)
    } else setItemFavorite(itemId, true)
  }

  const closeFavoriteConfirmation = () => {
    favoriteTriggerRef.current?.focus()
    setRemovingFavoriteId(null)
  }

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

    setItemPrices(priceField, priceDrafts)

    setPriceDrafts(null)
  }

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>
        {section === 'favorites' ? null : (
          <div className="page__actions">
            {priceDrafts === null ? (
              <>
                {sectionItems.length === 0 ? null : (
                  <Button variant="secondary" type="button" onClick={startPriceEditing}>
                    Редактировать цены
                  </Button>
                )}
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => {
                    setIsCreating(true)
                  }}
                >
                  + {content.addLabel}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setPriceDrafts(null)
                  }}
                >
                  Отмена
                </Button>
                <Button variant="primary" type="button" onClick={savePriceDrafts}>
                  Сохранить все
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      {sectionItems.length === 0 ? (
        <div className="empty-state">
          <strong>Здесь пока ничего нет</strong>
          <p>
            {section === 'favorites'
              ? 'Нажмите звёздочку рядом с названием крафта или реагента, чтобы добавить его в избранное.'
              : 'Создайте первый предмет, затем добавьте ему рецепт и цены.'}
          </p>
          {section === 'favorites' ? null : (
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                setIsCreating(true)
              }}
            >
              {content.addLabel}
            </Button>
          )}
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
            <div
              className={`item-list${draggingId === null ? '' : ' item-list--dragging'}`}
              ref={listRef}
            >
              {dropTarget ? (
                <div
                  className="item-list__drop-gap"
                  aria-hidden="true"
                  style={{ top: dropTarget.top, height: dropTarget.height }}
                />
              ) : null}
              {visibleItems.map((item) => (
                <ItemTree
                  planner={{
                    itemName: getItemName(item, itemLanguage),
                    quantity: plannerTargets.find((target) => target.itemId === item.id)
                      ?.quantity,
                    step: item.recipe?.outputQuantity ?? 1,
                    onChange: (quantity) => {
                      setPlannerQuantity(item.id, quantity)
                    },
                    onRemove: () => {
                      removePlannerTarget(item.id)
                    },
                  }}
                  key={item.id}
                  rootDragAndDrop={{
                    draggable: false,
                    className: [
                      'root-item-row--draggable',
                      draggingId === item.id ? 'root-item-row--dragging' : '',
                    ]
                      .filter(Boolean)
                      .join(' '),
                    onPointerDown: (event) => {
                      startPointerDrag(item.id, event)
                    },
                    onClickCapture: suppressDragClick,
                    onDragStart: (event) => {
                      event.preventDefault()
                    },
                    onKeyDown: (event) => {
                      if (
                        event.target !== event.currentTarget ||
                        !event.altKey ||
                        (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
                      )
                        return
                      event.preventDefault()
                      const neighbor =
                        visibleItems[
                          visibleItems.indexOf(item) + (event.key === 'ArrowUp' ? -1 : 1)
                        ]
                      if (neighbor)
                        moveRootItem(
                          section,
                          item.id,
                          neighbor.id,
                          event.key === 'ArrowUp' ? 'before' : 'after',
                        )
                    },
                  }}
                  showPurchasePrice={section !== 'crafts'}
                  rootItemId={item.id}
                  itemLanguage={itemLanguage}
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
                  onDeleteItem={setDeletingItemId}
                  onToggleFavorite={toggleFavorite}
                  onSetAcquisition={setAcquisition}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {gameVersion === 'tbc' ? (
        <fieldset className="items-price-mode">
          <legend>Цены для расчётов</legend>
          {(
            [
              { value: 'individual', label: 'Выбранные' },
              { value: 'tsm', label: 'По TSM' },
            ] as const
          ).map((mode) => (
            <Checkbox
              key={mode.value}
              controlType="radio"
              name="tsm-price-mode"
              label={mode.label}
              checked={prices.settings.priceMode === mode.value}
              onChange={(checked) => {
                if (checked) setTbcPricing({ ...prices.settings, priceMode: mode.value })
              }}
            />
          ))}
        </fieldset>
      ) : null}
      {isCreating && section !== 'favorites' ? (
        <ItemAddModal
          prices={prices}
          gameVersion={gameVersion}
          title={content.addLabel}
          defaultSection={section}
          itemLanguage={itemLanguage}
          catalog={items}
          onSave={createItem}
          onImport={(data) => importRecipe(data, request)}
          onAddReferenceItem={(data) => addReferenceItem(data, request)}
          onSuccess={(message) => {
            setNotification((current) => ({ id: (current?.id ?? 0) + 1, message }))
          }}
          onClose={() => {
            setIsCreating(false)
          }}
        />
      ) : null}

      {notification === null ? null : (
        <Toast
          key={notification.id}
          message={notification.message}
          onClose={closeNotification}
        />
      )}

      {editingItem === undefined ? null : (
        <ItemEditModal
          prices={prices}
          key={editingItem.id}
          item={editingItem}
          catalog={items}
          gameVersion={gameVersion}
          itemLanguage={itemLanguage}
          defaultSection={
            section === 'favorites' ? (editingItem.sections[0] ?? 'crafts') : section
          }
          ownedProfessions={ownedProfessions}
          onSave={(input, recipe) => saveItemEdit(editingItem.id, input, recipe, request)}
          onImport={(data, input) =>
            importRecipe(data, request, { itemId: editingItem.id, input })
          }
          onSuccess={(message) => {
            setNotification((current) => ({ id: (current?.id ?? 0) + 1, message }))
          }}
          onClose={() => {
            setEditingItemId(null)
          }}
        />
      )}

      {removingFavorite === undefined ? null : (
        <ConfirmDialog
          title="Удалить из избранного?"
          message={
            <>
              <ItemIdentity item={removingFavorite} language={itemLanguage} />
              <span className="items-delete-warning">
                Будет удалён только из избранного. Предмет и его рецепты сохранятся в
                каталоге.
              </span>
            </>
          }
          confirmLabel="Удалить из избранного"
          onCancel={closeFavoriteConfirmation}
          onConfirm={() => {
            setItemFavorite(removingFavorite.id, false)
            closeFavoriteConfirmation()
          }}
        />
      )}

      {deletingItem === undefined ? null : (
        <ConfirmDialog
          title="Удалить предмет?"
          message={
            <>
              <ItemIdentity item={deletingItem} language={itemLanguage} />
              <span className="items-delete-warning">
                также исчезнет из всех рецептов. Это действие нельзя отменить.
              </span>
            </>
          }
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
