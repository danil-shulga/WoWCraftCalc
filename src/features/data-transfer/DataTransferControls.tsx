import { useRef, useState, type ChangeEvent } from 'react'

import type { ItemCatalog } from '../../domain/item.types'
import { createExportJson, parseImportedData } from '../../store/persistence'
import '../../components/ui/Button.css'
import './DataTransferControls.css'

interface DataTransferControlsProps {
  items: ItemCatalog
  onImport: (items: ItemCatalog) => void
}

export function DataTransferControls({ items, onImport }: DataTransferControlsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  const exportData = () => {
    const blob = new Blob([createExportJson(items)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `craft-calc-${new Date().toISOString().slice(0, 10)}.json`
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

    const result = parseImportedData(await file.text())

    if (!result.success) {
      setMessage(result.error)
      return
    }

    if (!window.confirm('Импорт заменит все текущие предметы и рецепты. Продолжить?')) {
      return
    }

    onImport(result.items)
    setMessage('Данные успешно импортированы')
  }

  return (
    <div className="data-transfer">
      <button className="button button--secondary" type="button" onClick={exportData}>
        Экспорт JSON
      </button>
      <button
        className="button button--secondary"
        type="button"
        onClick={() => {
          inputRef.current?.click()
        }}
      >
        Импорт JSON
      </button>
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
