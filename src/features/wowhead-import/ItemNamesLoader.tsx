import { useEffect, useRef, useState } from 'react'

import type { ItemCatalog, ItemNamesUpdate } from '../../domain/item.types'
import type { ItemLanguage } from '../../domain/user-settings'
import { ItemName } from '../../components/ui/ItemName/ItemName'
import { fetchMissingItemNames, selectItemsMissingNames } from './item-names-loader'

interface ItemNamesLoaderProps {
  catalog: ItemCatalog
  itemLanguage?: ItemLanguage
  onApply: (updates: readonly ItemNamesUpdate[]) => string | null
}

export function ItemNamesLoader({
  catalog,
  itemLanguage = 'ru',
  onApply,
}: ItemNamesLoaderProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [updates, setUpdates] = useState<ItemNamesUpdate[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const pending = selectItemsMissingNames(catalog)
  const manualCount = Object.values(catalog).filter(
    (item) => item.source === undefined && (!item.names?.ru || !item.names.en),
  ).length

  const load = async () => {
    setIsLoading(true)
    setError(null)
    setMessage(null)
    try {
      const loaded = await fetchMissingItemNames(catalog)
      if (active.current) setUpdates(loaded)
    } catch (caughtError) {
      if (active.current)
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Не удалось загрузить названия',
        )
    } finally {
      if (active.current) setIsLoading(false)
    }
  }

  if (pending.length === 0) return null

  return (
    <fieldset className="user-settings__section">
      <legend>Недостающие названия</legend>
      <p>Предметов Wowhead без названия RU или EN: {pending.length}.</p>
      {manualCount > 0 ? (
        <p>
          Без Wowhead ID: {manualCount}. Названия можно заполнить в редакторе предмета.
        </p>
      ) : null}
      {updates === null ? (
        <>
          <button
            className="button button--secondary"
            type="button"
            disabled={isLoading || pending.length === 0}
            onClick={() => {
              void load()
            }}
          >
            {isLoading ? 'Загрузка названий…' : 'Загрузить недостающие названия'}
          </button>
        </>
      ) : (
        <>
          <ul className="user-settings__names-preview" aria-label="Загруженные названия">
            {updates.map((update) => (
              <li key={update.itemId}>
                <ItemName
                  language={itemLanguage}
                  item={{
                    name: catalog[update.itemId]?.name ?? '',
                    names: {
                      ru: catalog[update.itemId]?.names?.ru ?? update.names.ru,
                      en: catalog[update.itemId]?.names?.en ?? update.names.en,
                    },
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="user-settings__language-options">
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                const result = onApply(updates)
                setError(result)
                if (result === null)
                  setMessage(`Названия обновлены: ${updates.length.toString()}.`)
                setUpdates(null)
              }}
            >
              Сохранить названия
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setUpdates(null)
              }}
            >
              Отмена
            </button>
          </div>
        </>
      )}
      {message === null ? null : <p role="status">{message}</p>}
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
