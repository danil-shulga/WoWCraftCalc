import type { Ref } from 'react'

import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import { MoneyInput } from '../../components/ui/MoneyInput/MoneyInput'
import type { ItemSection } from '../../domain/item.types'
import type { ItemDescriptionDraft } from './useItemDescriptionDraft'
import './ItemForm.css'

interface ItemDescriptionFieldsProps {
  draft: ItemDescriptionDraft
  onChange: (draft: ItemDescriptionDraft) => void
  nameInputRef?: Ref<HTMLInputElement>
}

export function ItemDescriptionFields({
  draft,
  onChange,
  nameInputRef,
}: ItemDescriptionFieldsProps) {
  const toggleSection = (section: ItemSection, enabled: boolean) => {
    onChange({
      ...draft,
      sections: enabled
        ? [...new Set([...draft.sections, section])]
        : draft.sections.filter((current) => current !== section),
    })
  }

  return (
    <>
      <label>
        <span>Название RU</span>
        <input
          ref={nameInputRef}
          autoFocus
          value={draft.nameRu}
          onChange={(event) => {
            onChange({ ...draft, nameRu: event.target.value })
          }}
        />
      </label>

      <label>
        <span>Название EN</span>
        <input
          value={draft.nameEn}
          onChange={(event) => {
            onChange({ ...draft, nameEn: event.target.value })
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
          value={draft.iconUrl}
          onChange={(event) => {
            onChange({ ...draft, iconUrl: event.target.value })
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
          checked={draft.sections.includes('crafts')}
          onChange={(checked) => {
            toggleSection('crafts', checked)
          }}
        />
        <Checkbox
          label="Реагенты"
          checked={draft.sections.includes('reagents')}
          onChange={(checked) => {
            toggleSection('reagents', checked)
          }}
        />
      </fieldset>

      <div className="price-grid">
        <MoneyInput
          label="Цена покупки за единицу"
          value={draft.purchasePriceCopper}
          onChange={(value) => {
            onChange({ ...draft, purchasePriceCopper: value })
          }}
        />
        <MoneyInput
          label="Цена продажи за единицу"
          value={draft.salePriceCopper}
          onChange={(value) => {
            onChange({ ...draft, salePriceCopper: value })
          }}
        />
      </div>
    </>
  )
}
