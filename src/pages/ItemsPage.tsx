import { Button } from '../components/ui/Button/Button'
import { usePriceContext } from '../features/tsm/tsm-client'
import { PriceModeSelector } from '../features/tsm/PriceModeSelector'
import { useBulkPriceDraft } from '../features/item-editor/useBulkPriceDraft'
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
import { createCatalogDisenchantSnapshot } from '../domain/disenchanting-catalog'
import { describeDisenchantEstimate } from '../features/disenchanting/disenchanting-presentation'
import { DisenchantEstimateDetails } from '../features/disenchanting/DisenchantEstimateDetails'
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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const content = pageContent[section]
  const priceField: ItemPriceField =
    section === 'crafts' ? 'salePriceCopper' : 'purchasePriceCopper'
  const sectionItems = useMemo(
    () => selectItemsBySection(items, section, itemLanguage, rootItemOrder?.[section]),
    [items, section, itemLanguage, rootItemOrder],
  )
  const {
    priceDrafts,
    startPriceEditing,
    changePriceDraft,
    cancelPriceEditing,
    savePriceDrafts,
  } = useBulkPriceDraft(items, sectionItems, priceField, setItemPrices)
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
  const disenchantSnapshot = useMemo(
    () =>
      section === 'disenchanting'
        ? createCatalogDisenchantSnapshot(
            items,
            gameVersion,
            sectionItems.map(({ id }) => id),
            ownedProfessionSet,
            prices,
          )
        : {},
    [section, items, gameVersion, sectionItems, ownedProfessionSet, prices],
  )
  const liveRows = useMemo(
    () =>
      sectionItems.map((item) => ({
        item,
        catalog: items,
        calculationSnapshot,
        disenchant: disenchantSnapshot[item.id],
      })),
    [sectionItems, items, calculationSnapshot, disenchantSnapshot],
  )
  const [previousRows, setPreviousRows] = useState(liveRows)
  const [displayRows, setDisplayRows] = useState(liveRows)
  if (previousRows !== liveRows) {
    setPreviousRows(liveRows)
    setDisplayRows((rows) => {
      const next = [...liveRows]
      rows.forEach((row, index) => {
        if (!liveRows.some(({ item }) => item.id === row.item.id))
          next.splice(Math.min(index, next.length), 0, row)
      })
      return next
    })
  }
  const renderedRows = displayRows.filter(({ item }) =>
    matchesItemName(item, searchQuery),
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
                ({ item, catalog, calculationSnapshot: rowCalculation, disenchant }) => {
                  const removing = !liveRows.some((row) => row.item.id === item.id)
                  return (
                    <ItemTree
                      presence={{
                        removing,
                        onRemoved: () => {
                          setDisplayRows((rows) =>
                            rows.filter((row) => row.item.id !== item.id),
                          )
                        },
                      }}
                      valuation={
                        disenchant
                          ? {
                              label: 'Распыление',
                              value: disenchant.result.expectedValueCopper,
                              profitLabel: 'Прибыль за распыление',
                              profit: disenchant.configuredProfit,
                              allProfessionsProfit: disenchant.allProfessionsProfit,
                              boughtReagentsProfit: disenchant.boughtReagentsProfit,
                              buyProfit: disenchant.buyProfit,
                              description: describeDisenchantEstimate(
                                disenchant,
                                item.recipe !== null,
                              ),
                              tooltip: (
                                <DisenchantEstimateDetails
                                  calculation={disenchant}
                                  hasRecipe={item.recipe !== null}
                                />
                              ),
                            }
                          : undefined
                      }
                      planner={{
                        itemName: getItemName(item, itemLanguage),
                        quantity: plannerTargets.find(
                          (target) => target.itemId === item.id,
                        )?.quantity,
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
                              visibleItems.indexOf(item) +
                                (event.key === 'ArrowUp' ? -1 : 1)
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
                      showPurchasePrice={
                        section !== 'crafts' && section !== 'disenchanting'
                      }
                      rootItemId={item.id}
                      itemLanguage={itemLanguage}
                      catalog={catalog}
                      calculationSnapshot={rowCalculation}
                      {...(priceDrafts === null
                        ? {}
                        : {
                            quickPriceEdit: {
                              field: priceField,
                              value: priceDrafts[item.id] ?? null,
                              onChange: (value: number | null) => {
                                changePriceDraft(item.id, value)
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
                  )
                },
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
