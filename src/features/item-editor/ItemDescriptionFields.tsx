import type { Ref } from 'react'

import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import { ItemPriceField } from './ItemPriceField'
import type { Item, ItemSection } from '../../domain/item.types'
import type { PriceContext } from '../../domain/tsm'
import {
  validateItemDescription,
  type ItemDescriptionDraft,
} from './useItemDescriptionDraft'
import './ItemForm.css'

interface ItemDescriptionFieldsProps {
  item?: Pick<Item, 'source'> | undefined
  prices?: PriceContext | undefined
  draft: ItemDescriptionDraft
  onChange: (draft: ItemDescriptionDraft) => void
  nameInputRef?: Ref<HTMLInputElement>
}

export function ItemDescriptionFields({
  draft,
  onChange,
  nameInputRef,
  item = {},
  prices,
}: ItemDescriptionFieldsProps) {
  const description = validateItemDescription(draft)
  const priceItem = description.success ? { source: description.input.source } : item
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
      <div className="item-description-identity">
        <fieldset className="item-name-fields">
          <legend>Название</legend>
          <input
            aria-label="Название RU"
            placeholder="Название RU"
            ref={nameInputRef}
            autoFocus
            value={draft.nameRu}
            onChange={(event) => {
              onChange({ ...draft, nameRu: event.target.value })
            }}
          />
          <input
            aria-label="Название EN"
            placeholder="Название EN"
            value={draft.nameEn}
            onChange={(event) => {
              onChange({ ...draft, nameEn: event.target.value })
            }}
          />
        </fieldset>
        <label className="item-id-field">
          <span>ID предмета</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="ID предмета"
            value={draft.wowheadItemId}
            onChange={(event) => {
              onChange({ ...draft, wowheadItemId: event.target.value })
            }}
          />
        </label>
      </div>
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
        <Checkbox
          label="Распыление"
          checked={draft.sections.includes('disenchanting')}
          onChange={(checked) => {
            toggleSection('disenchanting', checked)
          }}
        />
      </fieldset>

      <div className="price-grid">
        <ItemPriceField
          item={priceItem}
          prices={prices}
          source={draft.purchasePriceSource ?? 'manual'}
          onSourceChange={(source) => {
            onChange({ ...draft, purchasePriceSource: source })
          }}
          label="Цена покупки за единицу"
          value={draft.purchasePriceCopper}
          onChange={(value) => {
            onChange({ ...draft, purchasePriceCopper: value })
          }}
        />
        <ItemPriceField
          item={priceItem}
          prices={prices}
          source={draft.salePriceSource ?? 'manual'}
          onSourceChange={(source) => {
            onChange({ ...draft, salePriceSource: source })
          }}
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
