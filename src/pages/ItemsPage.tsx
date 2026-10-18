import { Button } from '../components/ui/Button/Button'
import { usePriceContext } from '../features/tsm/tsm-client'
import { PriceModeSelector } from '../features/tsm/PriceModeSelector'
import { useBulkPriceDraft } from '../features/item-editor/useBulkPriceDraft'
import { selectActiveItems, selectActiveProfessions } from '../store/craft.selectors'
import { useCallback, useMemo, useRef, useState } from 'react'
import { selectActiveWorkspace } from '../store/craft.selectors'
import { useRootItemDrag } from './useRootItemDrag'

import { ItemsPageTree } from './ItemsPageTree'
import { ConfirmDialog } from '../components/ui/ConfirmDialog/ConfirmDialog'
import { ItemIdentity } from '../components/ui/ItemIdentity/ItemIdentity'
import { SearchField } from '../components/ui/SearchField/SearchField'
import { Toast } from '../components/ui/Toast/Toast'
import { createCatalogCalculationSnapshot } from '../domain/calculations'
import { createCatalogDisenchantSnapshot } from '../domain/disenchanting-catalog'
import { getItemSearchNames, normalizeItemName } from '../domain/item-names'
import type { ItemId, ItemPriceField, ItemSection } from '../domain/item.types'
import { ItemAddModal } from '../features/item-editor/ItemAddModal'
import { ItemEditModal } from '../features/item-editor/ItemEditModal'
import { selectItemsBySection, selectSectionItems } from '../store/craft.selectors'
import { useCraftStore } from '../store/useCraftStore'
import './ItemsPage.css'
import './PageLayout.css'
import { selectPlannerTargets } from '../store/craft.selectors'

interface ItemsPageProps {
  section: ItemSection | 'favorites'
}

const emptyExpandedPaths: ReadonlySet<string> = new Set()

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
  disenchanting: {
    title: 'Распыление',
    description: 'Ожидаемая стоимость материалов и прибыль за распыление предмета.',
    addLabel: 'Добавить предмет',
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
  const plannerTargetsById = useMemo(
    () => new Map(plannerTargets.map((target) => [target.itemId, target])),
    [plannerTargets],
  )
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
  const importReferenceBatch = useCraftStore((state) => state.importReferenceBatch)

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
  const [expandedByRoot, setExpandedByRoot] = useState<
    ReadonlyMap<ItemId, ReadonlySet<string>>
  >(() => new Map())
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedQuery = useMemo(() => normalizeItemName(searchQuery), [searchQuery])
  const searchNamesById = useMemo(
    () =>
      new Map(
        Object.values(items).map((item) => [
          item.id,
          getItemSearchNames(item).map(normalizeItemName),
        ]),
      ),
    [items],
  )
  const content = pageContent[section]
  const priceField: ItemPriceField =
    section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
  const sectionItems = useMemo(
    () => selectItemsBySection(items, section, itemLanguage, rootItemOrder?.[section]),
    [items, section, itemLanguage, rootItemOrder],
  )
  const calculationItems = useMemo(
    () => selectSectionItems(items, section),
    [items, section],
  )
  // Прибыль готовится для всего раздела: поиск её не пересчитывает,
  // но правка цены обновляет и скрытые строки.
  const profitItemIds = useMemo(
    () => new Set(calculationItems.map(({ id }) => id)),
    [calculationItems],
  )
  const {
    priceDrafts,
    startPriceEditing,
    changePriceDraft,
    cancelPriceEditing,
    savePriceDrafts,
  } = useBulkPriceDraft(items, sectionItems, priceField, setItemPrices)
  const visibleItems = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return sectionItems
    }

    return sectionItems.filter((item) =>
      searchNamesById.get(item.id)?.some((name) => name.includes(normalizedQuery)),
    )
  }, [normalizedQuery, sectionItems, searchNamesById])
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
      createCatalogCalculationSnapshot(items, ownedProfessionSet, profitItemIds, prices),
    [items, ownedProfessionSet, profitItemIds, prices],
  )
  const disenchantSnapshot = useMemo(
    () =>
      section === 'disenchanting'
        ? createCatalogDisenchantSnapshot(
            items,
            gameVersion,
            calculationItems.map(({ id }) => id),
            ownedProfessionSet,
            prices,
          )
        : {},
    [section, items, gameVersion, calculationItems, ownedProfessionSet, prices],
  )
  const liveRows = useMemo(
    () =>
      sectionItems.map((item) => ({
        item,
        searchNames: searchNamesById.get(item.id) ?? [],
        catalog: items,
        calculationSnapshot,
        disenchant: disenchantSnapshot[item.id],
      })),
    [sectionItems, searchNamesById, items, calculationSnapshot, disenchantSnapshot],
  )
  const [previousRows, setPreviousRows] = useState(liveRows)
  const [displayRows, setDisplayRows] = useState(liveRows)
  const liveRowIds = useMemo(
    () => new Set(liveRows.map(({ item }) => item.id)),
    [liveRows],
  )
  if (previousRows !== liveRows) {
    setPreviousRows(liveRows)
    setDisplayRows((rows) => {
      const next = [...liveRows]
      rows.forEach((row, index) => {
        if (!liveRowIds.has(row.item.id))
          next.splice(Math.min(index, next.length), 0, row)
      })
      return next
    })
  }
  const renderedRows = displayRows.filter(({ searchNames }) =>
    searchNames.some((name) => name.includes(normalizedQuery)),
  )
  const editingItem = editingItemId === null ? undefined : items[editingItemId]
  const deletingItem = deletingItemId === null ? undefined : items[deletingItemId]
  const removingFavorite =
    removingFavoriteId === null ? undefined : items[removingFavoriteId]

  const toggleFavorite = useCallback(
    (itemId: ItemId) => {
      if (items[itemId]?.isFavorite) {
        favoriteTriggerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        setRemovingFavoriteId(itemId)
      } else setItemFavorite(itemId, true)
    },
    [items, setItemFavorite],
  )

  const closeFavoriteConfirmation = () => {
    favoriteTriggerRef.current?.focus()
    setRemovingFavoriteId(null)
  }

  const toggleExpanded = useCallback((rootItemId: ItemId, path: string) => {
    setExpandedByRoot((current) => {
      const next = new Set(current.get(rootItemId))

      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }

      const roots = new Map(current)
      if (next.size === 0) roots.delete(rootItemId)
      else roots.set(rootItemId, next)
      return roots
    })
  }, [])

  const finishRemoving = useCallback((itemId: ItemId) => {
    setDisplayRows((rows) => rows.filter((row) => row.item.id !== itemId))
    setExpandedByRoot((current) => {
      if (!current.has(itemId)) return current
      const next = new Map(current)
      next.delete(itemId)
      return next
    })
  }, [])

  const moveRelative = useCallback(
    (itemId: ItemId, position: 'before' | 'after') => {
      const index = visibleItems.findIndex((item) => item.id === itemId)
      const neighbor = visibleItems[index + (position === 'before' ? -1 : 1)]
      if (index !== -1 && neighbor) moveRootItem(section, itemId, neighbor.id, position)
    },
    [visibleItems, moveRootItem, section],
  )

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
                {sectionItems.length === 0 || section === 'disenchanting' ? null : (
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
                <Button variant="secondary" type="button" onClick={cancelPriceEditing}>
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

      {section === 'disenchanting' && gameVersion === 'forever' ? (
        <p className="items-calculation-note">
          Для Forever таблицы распыления пока не подтверждены. Формулы Classic и TBC не
          учитывают бонусы распыления Forever.
        </p>
      ) : null}

      {sectionItems.length === 0 && renderedRows.length === 0 ? (
        <div className="empty-state">
          <strong>Здесь пока ничего нет</strong>
          <p>
            {section === 'favorites'
              ? 'Нажмите звёздочку рядом с названием крафта или реагента, чтобы добавить его в избранное.'
              : section === 'disenchanting'
                ? 'Добавьте экипировку из базы или включите «Распыление» в настройках уже добавленного предмета.'
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
      ) : null}
      {renderedRows.length === 0 && sectionItems.length === 0 ? null : (
        <div className="items-content">
          {sectionItems.length > 0 ? (
            <SearchField value={searchQuery} onChange={setSearchQuery} />
          ) : null}

          {sectionItems.length > 0 && visibleItems.length === 0 ? (
            <div className="search-empty-state">
              <strong>Ничего не найдено</strong>
              <p>Попробуйте изменить поисковый запрос.</p>
            </div>
          ) : null}
          {renderedRows.length > 0 ? (
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
              {renderedRows.map(
                ({ item, catalog, calculationSnapshot: rowCalculation, disenchant }) => (
                  <ItemsPageTree
                    key={item.id}
                    item={item}
                    catalog={catalog}
                    calculationSnapshot={rowCalculation}
                    disenchant={disenchant}
                    itemLanguage={itemLanguage}
                    removing={!liveRowIds.has(item.id)}
                    dragging={draggingId === item.id}
                    plannerQuantity={plannerTargetsById.get(item.id)?.quantity}
                    isEditingPrices={priceDrafts !== null}
                    priceField={priceField}
                    priceDraft={priceDrafts?.[item.id] ?? null}
                    showPurchasePrice={
                      section !== 'crafts' && section !== 'disenchanting'
                    }
                    expandedPaths={expandedByRoot.get(item.id) ?? emptyExpandedPaths}
                    onToggleExpanded={toggleExpanded}
                    onRemoved={finishRemoving}
                    onSetPlannerQuantity={setPlannerQuantity}
                    onRemovePlannerTarget={removePlannerTarget}
                    onChangePriceDraft={changePriceDraft}
                    onStartPointerDrag={startPointerDrag}
                    onSuppressDragClick={suppressDragClick}
                    onMoveRelative={moveRelative}
                    onEditItem={setEditingItemId}
                    onDeleteItem={setDeletingItemId}
                    onToggleFavorite={toggleFavorite}
                    onSetAcquisition={setAcquisition}
                  />
                ),
              )}
            </div>
          ) : null}
        </div>
      )}

      <PriceModeSelector
        gameVersion={gameVersion}
        settings={prices.settings}
        onChange={setTbcPricing}
      />
      {isCreating && section !== 'favorites' ? (
        <ItemAddModal
          prices={prices}
          gameVersion={gameVersion}
          title={content.addLabel}
          defaultSection={section}
          itemLanguage={itemLanguage}
          catalog={items}
          onSave={createItem}
          onImport={(data) => importRecipe({ ...data, productSection: section }, request)}
          onImportBatch={(entries) => importReferenceBatch(entries, request, section)}
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
