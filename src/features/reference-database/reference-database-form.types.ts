import type {
  RecipeImportData,
  ReferenceImportEntry,
} from '../../domain/recipe-import.types'
import type { Item, ItemCatalog, ItemSection } from '../../domain/item.types'
import type { GameVersion } from '../../domain/game-version'
import type { ItemLanguage } from '../../domain/user-settings'
import type { RecipeImportResult, ReferenceBatchResult } from '../../store/useCraftStore'

export type ReferenceDatabaseModeProps =
  | { targetItem: Item; onImport: (data: RecipeImportData) => RecipeImportResult }
  | {
      targetItem?: undefined
      onImportBatch: (entries: readonly ReferenceImportEntry[]) => ReferenceBatchResult
    }

export type ReferenceDatabaseFormProps = ReferenceDatabaseModeProps & {
  gameVersion?: GameVersion
  catalog: ItemCatalog
  section: ItemSection
  itemLanguage: ItemLanguage
  isActive: boolean
  onSuccess: (message: string) => void
  onClose: () => void
}
