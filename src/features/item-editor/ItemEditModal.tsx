import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useEffect, useRef, useState } from 'react'

import { Modal } from '../../components/ui/Modal/Modal'
import { Tabs } from '../../components/ui/Tabs/Tabs'
import type { GameVersion } from '../../domain/game-version'
import { getItemName, getSecondaryItemName } from '../../domain/item-names'
import type { Item, ItemCatalog, ItemSection, Recipe } from '../../domain/item.types'
import type { Profession } from '../../domain/professions'
import type { ItemLanguage } from '../../domain/user-settings'
import type {
  ItemInput,
  RecipeImportData,
  RecipeImportResult,
} from '../../store/useCraftStore'
import { RecipeEditor } from '../recipe-editor/RecipeEditor'
import { ItemDescriptionFields } from './ItemDescriptionFields'
import { ItemSourceForm } from './ItemSourceForm'
import {
  useItemDescriptionDraft,
  validateItemDescription,
} from './useItemDescriptionDraft'
import '../EditorForm.css'

type EditTab = 'description' | 'recipe'
const editTabs: readonly { value: EditTab; label: string }[] = [
  { value: 'description', label: 'Описание' },
  { value: 'recipe', label: 'Рецепт' },
]

interface ItemEditModalProps {
  item: Item
  catalog: ItemCatalog
  gameVersion: GameVersion
  itemLanguage: ItemLanguage
  defaultSection: ItemSection
  ownedProfessions: readonly Profession[]
  onSave: (input: ItemInput, recipe: Recipe | null) => string | null
  onImport: (data: RecipeImportData, input: ItemInput) => RecipeImportResult
  onSuccess: (message: string) => void
  onClose: () => void
}

export function ItemEditModal({
  item,
  catalog,
  gameVersion,
  itemLanguage,
  defaultSection,
  ownedProfessions,
  onSave,
  onImport,
  onSuccess,
  onClose,
}: ItemEditModalProps) {
  const [tab, setTab] = useState<EditTab>('description')
  const { draft, setDraft } = useItemDescriptionDraft(item, defaultSection)
  const [recipeDraft, setRecipeDraft] = useState(item.recipe)
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (error !== null && tab === 'description') nameInputRef.current?.focus()
  }, [error, tab])
  const [returnFocus] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  const close = () => {
    onClose()
    returnFocus?.focus()
  }
  const description = () => {
    const result = validateItemDescription(draft)
    if (!result.success) {
      setError(result.error)
      setTab('description')
    }
    return result
  }
  const save = (recipe: Recipe | null) => {
    setError(null)
    const result = description()
    if (!result.success) return result.error
    const saveError = onSave(result.input, recipe)
    if (saveError === null) close()
    else setError(saveError)
    return saveError
  }

  return (
    <Modal
      title={`Редактировать: ${getItemName(item, itemLanguage)}`}
      subtitle={getSecondaryItemName(item, itemLanguage)}
      onClose={close}
    >
      <Tabs tabs={editTabs} value={tab} onChange={setTab} />
      <div hidden={tab !== 'description'} inert={tab !== 'description'}>
        <form
          className="editor-form"
          onSubmit={(event) => {
            event.preventDefault()
            save(recipeDraft)
          }}
        >
          <ItemDescriptionFields
            draft={draft}
            onChange={setDraft}
            nameInputRef={nameInputRef}
          />
          <FormError message={error} />
          <footer className="editor-form__actions">
            <Button variant="secondary" type="button" onClick={close}>
              Отмена
            </Button>
            <Button variant="primary" type="submit">
              Сохранить
            </Button>
          </footer>
        </form>
      </div>
      <div hidden={tab !== 'recipe'} inert={tab !== 'recipe'}>
        <ItemSourceForm
          gameVersion={gameVersion}
          itemLanguage={itemLanguage}
          defaultSection="crafts"
          catalog={catalog}
          isActive={tab === 'recipe'}
          initialMethod={item.recipe === null ? 'database' : 'manual'}
          targetItem={item}
          onImport={(data) => {
            const result = description()
            if (!result.success) return { success: false, error: result.error }
            return onImport(data, result.input)
          }}
          onAddReferenceItem={() => ({
            success: false,
            error: 'Выберите предмет с рецептом',
          })}
          onSuccess={onSuccess}
          onClose={close}
          renderManual={() => (
            <RecipeEditor
              gameVersion={gameVersion}
              item={item}
              catalog={catalog}
              itemLanguage={itemLanguage}
              ownedProfessions={ownedProfessions}
              onDraftChange={setRecipeDraft}
              onSave={save}
              onRemove={() => {
                save(null)
              }}
              onCancel={close}
            />
          )}
        />
      </div>
    </Modal>
  )
}
