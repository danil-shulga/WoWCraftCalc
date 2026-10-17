import { useState } from 'react'
import { findImportedItem } from '../../domain/imported-item-matching'
import type { Item, ItemCatalog } from '../../domain/item.types'
import { referenceItemToImport } from '../../domain/reference-database-import'
import type { ReferenceDatabaseIndex } from '../../domain/reference-database-index'
import type { ReferenceItem } from '../../domain/reference-database.types'
import type { ItemLanguage } from '../../domain/user-settings'

export interface ReferenceDraft {
  itemId: number
  recipeId: string
  output: number
}

export function useReferenceDrafts({
  index,
  catalog,
  itemLanguage,
  targetItem,
  initialItem,
  profession,
}: {
  index: ReferenceDatabaseIndex
  catalog: ItemCatalog
  itemLanguage: ItemLanguage
  targetItem: Item | undefined
  initialItem: ReferenceItem | undefined
  profession: string
}) {
  const savedOutput = (item: ReferenceItem, recipeId: string) => {
    const imported = referenceItemToImport(item, index.database.gameVersion, itemLanguage)
    const saved = targetItem ?? findImportedItem(catalog, imported)
    return (
      saved?.recipe?.outputQuantity ??
      index.database.recipes[recipeId]?.output.quantity ??
      1
    )
  }
  const createDraft = (itemId: number): ReferenceDraft => {
    const item = index.database.items[String(itemId)]
    if (!item) throw new Error('Предмет отсутствует в базе')
    const recipes = index.recipesByProduct.get(itemId) ?? []
    const recipe =
      recipes.find((recipe) => recipe.profession === profession) ?? recipes[0]
    const recipeId = recipe ? String(recipe.spellId) : ''
    return { itemId, recipeId, output: savedOutput(item, recipeId) }
  }
  const [state, setState] = useState<{
    drafts: ReferenceDraft[]
    selectedIds: number[]
    rows: number[]
    previewId: number | null
  }>(() => ({
    drafts: initialItem ? [createDraft(initialItem.itemId)] : [],
    selectedIds: [],
    rows: [],
    previewId: initialItem?.itemId ?? null,
  }))
  const preview = state.drafts.find((draft) => draft.itemId === state.previewId)
  const open = (itemId: number) => {
    const draft = createDraft(itemId)
    setState((state) => ({
      ...state,
      previewId: itemId,
      drafts: state.drafts.some((entry) => entry.itemId === itemId)
        ? state.drafts
        : [...state.drafts, draft],
    }))
  }
  const toggle = (itemId: number, checked: boolean) => {
    const draft = createDraft(itemId)
    setState((state) => {
      if (checked)
        return {
          ...state,
          drafts: state.drafts.some((entry) => entry.itemId === itemId)
            ? state.drafts
            : [...state.drafts, draft],
          selectedIds: state.selectedIds.includes(itemId)
            ? state.selectedIds
            : [itemId, ...state.selectedIds],
          rows: [itemId, ...state.rows.filter((id) => id !== itemId)],
          previewId: itemId,
        }
      const position = state.selectedIds.indexOf(itemId)
      const selectedIds = state.selectedIds.filter((id) => id !== itemId)
      return {
        ...state,
        selectedIds,
        previewId:
          state.previewId === itemId
            ? (selectedIds[position] ?? selectedIds[position - 1] ?? null)
            : state.previewId,
      }
    })
  }
  const updatePreview = (updates: Partial<ReferenceDraft>) => {
    setState((state) => ({
      ...state,
      drafts: state.drafts.map((draft) =>
        draft.itemId === state.previewId ? { ...draft, ...updates } : draft,
      ),
    }))
  }
  return {
    ...state,
    preview,
    open,
    toggle,
    setOutput: (output: number) => {
      updatePreview({ output })
    },
    setRecipeId: (recipeId: string) => {
      const item = preview && index.database.items[String(preview.itemId)]
      if (item) updatePreview({ recipeId, output: savedOutput(item, recipeId) })
    },
    clear: () => {
      setState((state) => ({ ...state, selectedIds: [], previewId: null }))
    },
    finishExit: (itemId: number) => {
      setState((state) =>
        state.selectedIds.includes(itemId)
          ? state
          : {
              ...state,
              rows: state.rows.filter((id) => id !== itemId),
              drafts: state.drafts.filter(
                (draft) => draft.itemId !== itemId || state.previewId === itemId,
              ),
            },
      )
    },
  }
}
