import { useState, type SyntheticEvent } from 'react'

import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import { MoneyInput } from '../../components/ui/MoneyInput/MoneyInput'
import type { Item, ItemSection } from '../../domain/item.types'
import type { ItemInput } from '../../store/useCraftStore'
import '../../components/ui/Button.css'
import '../EditorForm.css'
import { resolveIconUrl } from './icon-url'
import './ItemForm.css'

interface ItemFormProps {
  initialItem?: Item
  defaultSection: ItemSection
  onSave: (input: ItemInput) => void
  onCancel: () => void
}

export function ItemForm({
  initialItem,
  defaultSection,
  onSave,
  onCancel,
}: ItemFormProps) {
  const [nameRu, setNameRu] = useState(
    initialItem?.names?.ru ?? (initialItem?.names?.en ? '' : (initialItem?.name ?? '')),
  )
  const [nameEn, setNameEn] = useState(initialItem?.names?.en ?? '')
  const [iconUrl, setIconUrl] = useState(initialItem?.iconUrl ?? '')
  const [sections, setSections] = useState<ItemSection[]>(
    initialItem?.sections ?? [defaultSection],
  )
  const [purchasePriceCopper, setPurchasePriceCopper] = useState<number | null>(
    initialItem?.purchasePriceCopper ?? null,
  )
  const [salePriceCopper, setSalePriceCopper] = useState<number | null>(
    initialItem?.salePriceCopper ?? null,
  )
  const [error, setError] = useState<string | null>(null)

  const toggleSection = (section: ItemSection, enabled: boolean) => {
    setSections((currentSections) =>
      enabled
        ? [...new Set([...currentSections, section])]
        : currentSections.filter((current) => current !== section),
    )
  }

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()

    const names = { ru: nameRu.trim() || null, en: nameEn.trim() || null }
    const trimmedName = names.ru ?? names.en ?? ''
    const resolvedIconUrl = resolveIconUrl(iconUrl)

    if (trimmedName.length === 0) {
      setError('Введите название предмета')
      return
    }

    if (sections.length === 0) {
      setError('Выберите хотя бы один раздел')
      return
    }

    if (resolvedIconUrl === null) {
      setError('Введите корректный URL или короткое имя иконки')
      return
    }

    onSave({
      name: trimmedName,
      names,
      iconUrl: resolvedIconUrl,
      sections,
      purchasePriceCopper: purchasePriceCopper === 0 ? null : purchasePriceCopper,
      salePriceCopper: salePriceCopper === 0 ? null : salePriceCopper,
    })
  }

  return (
    <form className="editor-form" onSubmit={handleSubmit}>
      <label>
        <span>Название RU</span>
        <input
          autoFocus
          value={nameRu}
          onChange={(event) => {
            setNameRu(event.target.value)
          }}
        />
      </label>

      <label>
        <span>Название EN</span>
        <input
          value={nameEn}
          onChange={(event) => {
            setNameEn(event.target.value)
          }}
        />
      </label>
      <small>
        Достаточно одного названия. Если перевода нет, используется заполненное.
      </small>

      <label>
        <span>URL иконки</span>
        <input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://... или inv_ingot_10"
          value={iconUrl}
          onChange={(event) => {
            setIconUrl(event.target.value)
          }}
        />
        <small className="icon-url-hint">
          Для короткого имени автоматически используются адрес Wowhead и расширение .jpg.
        </small>
      </label>

      <fieldset className="section-checkboxes">
        <legend>Показывать в разделах</legend>
        <Checkbox
          label="Крафты"
          checked={sections.includes('crafts')}
          onChange={(checked) => {
            toggleSection('crafts', checked)
          }}
        />
        <Checkbox
          label="Реагенты"
          checked={sections.includes('reagents')}
          onChange={(checked) => {
            toggleSection('reagents', checked)
          }}
        />
      </fieldset>

      <div className="price-grid">
        <MoneyInput
          label="Цена покупки за единицу"
          value={purchasePriceCopper}
          onChange={setPurchasePriceCopper}
        />
        <MoneyInput
          label="Цена продажи за единицу"
          value={salePriceCopper}
          onChange={setSalePriceCopper}
        />
      </div>

      {error === null ? null : <p className="form-error">{error}</p>}

      <footer className="editor-form__actions">
        <button className="button button--secondary" type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="button button--primary" type="submit">
          Сохранить
        </button>
      </footer>
    </form>
  )
}
