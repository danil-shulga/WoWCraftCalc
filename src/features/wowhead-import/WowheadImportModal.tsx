import { useState, type SyntheticEvent } from 'react'

import { Modal } from '../../components/ui/Modal/Modal'
import type { RecipeImportData, RecipeImportResult } from '../../store/useCraftStore'
import '../../components/ui/Button.css'
import '../EditorForm.css'
import { fetchWowheadRecipe } from './wowhead-import'
import './WowheadImportModal.css'

interface WowheadImportModalProps {
  onImport: (data: RecipeImportData) => RecipeImportResult
  onClose: () => void
}

function getSuccessMessage(
  result: Extract<RecipeImportResult, { success: true }>,
): string {
  const action = result.productCreated ? 'создан' : 'обновлён'
  const reagentMessage =
    result.reagentsCreated === 0
      ? 'Новые реагенты не потребовались.'
      : `Добавлено реагентов: ${result.reagentsCreated.toString()}.`

  return `Крафт ${action}. ${reagentMessage}`
}

export function WowheadImportModal({ onImport, onClose }: WowheadImportModalProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const recipe = await fetchWowheadRecipe(url)
      const result = onImport(recipe)

      if (!result.success) {
        setError(result.error)
        return
      }

      setSuccessMessage(getSuccessMessage(result))
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Не удалось импортировать рецепт',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal title="Импорт рецепта из Wowhead" onClose={onClose}>
      {successMessage === null ? (
        <form
          className="editor-form wowhead-import"
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
        >
          <label>
            <span>Ссылка на рецепт Wowhead Classic, TBC или Forever</span>
            <input
              autoFocus
              required
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://www.wowhead.com/classic/ru/spell=…"
              value={url}
              disabled={isLoading}
              onChange={(event) => {
                setUrl(event.target.value)
              }}
            />
          </label>
          <small>
            Будут обновлены название, иконка и состав крафта. Цены и вложенные рецепты
            сохранятся.
          </small>

          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <footer className="editor-form__actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={isLoading}
              onClick={onClose}
            >
              Отмена
            </button>
            <button className="button button--primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Импорт…' : 'Импортировать'}
            </button>
          </footer>
        </form>
      ) : (
        <div className="wowhead-import wowhead-import__success">
          <p role="status">{successMessage}</p>
          <footer className="editor-form__actions">
            <button className="button button--primary" type="button" onClick={onClose}>
              Закрыть
            </button>
          </footer>
        </div>
      )}
    </Modal>
  )
}
