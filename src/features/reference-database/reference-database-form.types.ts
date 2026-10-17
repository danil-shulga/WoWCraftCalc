import type { RecipeImportData, RecipeImportItem } from '../../domain/recipe-import.types'
import type { Item, ItemCatalog, ItemSection } from '../../domain/item.types'
import type { GameVersion } from '../../domain/game-version'
import type { ItemLanguage } from '../../domain/user-settings'
import type {
  RecipeImportResult,
  ReferenceItemAddResult,
} from '../../store/useCraftStore'

export interface ReferenceDatabaseFormProps {
  gameVersion?: GameVersion
  catalog: ItemCatalog
  section: ItemSection
  itemLanguage: ItemLanguage
  isActive: boolean
  targetItem?: Item
  onImport: (data: RecipeImportData) => RecipeImportResult
  onAddItem: (data: RecipeImportItem) => ReferenceItemAddResult
  onSuccess: (message: string) => void
  onClose: () => void
}
