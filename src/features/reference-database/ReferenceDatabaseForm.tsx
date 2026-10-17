import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useEffect, useState } from 'react'
import { GAME_VERSION_REGISTRY } from '../../domain/game-version'
import type { ReferenceDatabaseIndex } from '../../domain/reference-database-index'
import { loadReferenceDatabase } from './reference-database-loader'
import '../EditorForm.css'
import './ReferenceDatabaseForm.css'
import type { ReferenceDatabaseFormProps } from './reference-database-form.types'
import { ReferenceBrowser } from './ReferenceBrowser'

function ReferenceDatabaseFormForVersion(props: ReferenceDatabaseFormProps) {
  const gameVersion = props.gameVersion ?? 'forever'
  const [index, setIndex] = useState<ReferenceDatabaseIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!props.isActive || index !== null) return
    let active = true
    void loadReferenceDatabase(gameVersion).then(
      (loaded) => {
        if (active) setIndex(loaded)
      },
      (caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Не удалось загрузить базу. Проверьте соединение.',
          )
      },
    )
    return () => {
      active = false
    }
  }, [props.isActive, index, attempt, gameVersion])
  if (index !== null) return <ReferenceBrowser {...props} index={index} />
  return (
    <div className="editor-form reference-db">
      <p>База {GAME_VERSION_REGISTRY[gameVersion].name}</p>
      {error === null ? (
        <p role="status">Загрузка базы…</p>
      ) : (
        <>
          <FormError message={error} />
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              setError(null)
              setAttempt(attempt + 1)
            }}
          >
            Повторить загрузку
          </Button>
        </>
      )}
      <div className="editor-form__actions">
        <Button variant="secondary" type="button" onClick={props.onClose}>
          Отмена
        </Button>
      </div>
    </div>
  )
}

export function ReferenceDatabaseForm(props: ReferenceDatabaseFormProps) {
  return (
    <ReferenceDatabaseFormForVersion key={props.gameVersion ?? 'forever'} {...props} />
  )
}
