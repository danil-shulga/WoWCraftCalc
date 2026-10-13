import { useState } from 'react'

import { useDraftSnapshot } from '../../app/draft-guard'
import type { Item, ItemSection } from '../../domain/item.types'
import type { PriceSource } from '../../domain/tsm'
import type { ItemInput } from '../../store/useCraftStore'
import { resolveIconUrl } from './icon-url'

export interface ItemDescriptionDraft {
  purchasePriceSource?: PriceSource | undefined
  salePriceSource?: PriceSource | undefined
  nameRu: string
  nameEn: string
  iconUrl: string
  sections: ItemSection[]
  purchasePriceCopper: number | null
  salePriceCopper: number | null
}

export function useItemDescriptionDraft(
  initialItem: Item | undefined,
  defaultSection: ItemSection,
) {
  const [draft, setDraft] = useState<ItemDescriptionDraft>(() => ({
    nameRu:
      initialItem?.names?.ru ?? (initialItem?.names?.en ? '' : (initialItem?.name ?? '')),
    nameEn: initialItem?.names?.en ?? '',
    iconUrl: initialItem?.iconUrl ?? '',
    sections: initialItem?.sections ?? [defaultSection],
    purchasePriceCopper: initialItem?.purchasePriceCopper ?? null,
    salePriceCopper: initialItem?.salePriceCopper ?? null,
    purchasePriceSource: initialItem?.purchasePriceSource,
    salePriceSource: initialItem?.salePriceSource,
  }))
  useDraftSnapshot(draft)
  return { draft, setDraft }
}

export function validateItemDescription(
  draft: ItemDescriptionDraft,
): { success: true; input: ItemInput } | { success: false; error: string } {
  const names = { ru: draft.nameRu.trim() || null, en: draft.nameEn.trim() || null }
  const name = names.ru ?? names.en ?? ''
  const iconUrl = resolveIconUrl(draft.iconUrl)
  if (name.length === 0) return { success: false, error: 'Введите название предмета' }
  if (draft.sections.length === 0)
    return { success: false, error: 'Выберите хотя бы один раздел' }
  if (iconUrl === null)
    return { success: false, error: 'Введите корректный URL или короткое имя иконки' }
  return {
    success: true,
    input: {
      name,
      names,
      iconUrl,
      sections: draft.sections,
      purchasePriceCopper: draft.purchasePriceCopper,
      salePriceCopper: draft.salePriceCopper,
      ...(draft.purchasePriceSource === undefined
        ? {}
        : { purchasePriceSource: draft.purchasePriceSource }),
      ...(draft.salePriceSource === undefined
        ? {}
        : { salePriceSource: draft.salePriceSource }),
    },
  }
}
