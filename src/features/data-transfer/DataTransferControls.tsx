import { Button } from '../../components/ui/Button/Button'
import { useRef, useState, type ChangeEvent } from 'react'

import type { PersistedCraftData } from '../../domain/item.types'
import { createExportJson, parseImportedData } from '../../store/persistence'
import './DataTransferControls.css'

interface DataTransferControlsProps {
  data: PersistedCraftData
  onImport: (data: PersistedCraftData) => string | null
  recoveryRequired?: boolean
  onReset?: () => string | null
}

export function DataTransferControls({
  data,
  onImport,
  recoveryRequired = false,
  onReset,
}: DataTransferControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  const exportData = () => {
    const blob = new Blob([createExportJson(data)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `craft-calc-all-versions-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Резервная копия сохранена')
  }

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (file === undefined) {
      return
    }

    let rawJson: string
    try {
      rawJson = await file.text()
    } catch {
      setMessage('Не удалось прочитать файл резервной копии')
      return
    }
    const result = parseImportedData(rawJson)

    if (!result.success) {
      setMessage(result.error)
      return
    }

    if (
      !window.confirm(
        recoveryRequired
          ? 'Импорт заменит исходную запись в браузере, все три каталога и общие настройки. Продолжить?'
          : 'Импорт заменит все три каталога, их предметы, рецепты и общие настройки. Продолжить?',
      )
    ) {
      return
    }

    const error = onImport(result.data)
    setMessage(
      error === null ? 'Данные успешно импортированы' : `Импорт не выполнен: ${error}`,
    )
  }

  return (
    <div className="data-transfer">
      <Button variant="secondary" type="button" onClick={exportData}>
        Экспорт JSON
      </Button>
      <Button
        variant="secondary"
        type="button"
        onClick={() => {
          inputRef.current?.click()
        }}
      >
        Импорт JSON
      </Button>
      {recoveryRequired && onReset !== undefined ? (
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            if (
              !window.confirm(
                'Сброс удалит исходную запись в браузере, все три каталога и общие настройки. Продолжить?',
              )
            ) {
              return
            }
            const error = onReset()
            setMessage(error === null ? 'Данные сброшены' : `Сброс не выполнен: ${error}`)
          }}
        >
          Сбросить данные
        </Button>
      ) : null}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          void importData(event)
        }}
      />
      {message === null ? null : (
        <output className="data-transfer__message">{message}</output>
      )}
    </div>
  )
}
