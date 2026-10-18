import { useCallback, useState } from 'react'

import { useDraftGuard } from '../../app/draft-guard'
import type { Item, ItemCatalog, ItemId, ItemPriceField } from '../../domain/item.types'

export function useBulkPriceDraft(
  items: ItemCatalog,
  sectionItems: readonly Item[],
  priceField: ItemPriceField,
  setItemPrices: (
    field: ItemPriceField,
    prices: Readonly<Record<ItemId, number | null>>,
  ) => void,
) {
  const [priceDrafts, setPriceDrafts] = useState<Record<ItemId, number | null> | null>(
    null,
  )

  useDraftGuard(
    priceDrafts !== null &&
      Object.entries(priceDrafts).some(
        ([id, value]) => value !== items[id]?.[priceField],
      ),
  )

  const startPriceEditing = () => {
    const drafts: Record<ItemId, number | null> = {}

    for (const item of sectionItems) {
      drafts[item.id] = item[priceField]
    }

    setPriceDrafts(drafts)
  }

  const changePriceDraft = useCallback((itemId: ItemId, value: number | null) => {
    setPriceDrafts((current) =>
      current === null ? null : { ...current, [itemId]: value },
    )
  }, [])

  const cancelPriceEditing = () => {
    setPriceDrafts(null)
  }

  const savePriceDrafts = () => {
    if (priceDrafts === null) {
      return
    }

    setItemPrices(priceField, priceDrafts)

    setPriceDrafts(null)
  }

  return {
    priceDrafts,
    startPriceEditing,
    changePriceDraft,
    cancelPriceEditing,
    savePriceDrafts,
  }
}
