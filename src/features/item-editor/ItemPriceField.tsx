import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import { MoneyDisplay } from '../../components/ui/MoneyDisplay/MoneyDisplay'
import { MoneyInput } from '../../components/ui/MoneyInput/MoneyInput'
import { canUseTsm, getTsmPrice, TSM_METRIC_LABELS } from '../../domain/tsm'
import type { PriceContext, PriceSource } from '../../domain/tsm'
import type { Item } from '../../domain/item.types'

interface ItemPriceFieldProps {
  label: string
  value: number | null
  source: PriceSource
  item: Pick<Item, 'source'>
  prices?: PriceContext | undefined
  onChange: (value: number | null) => void
  onSourceChange: (source: PriceSource) => void
}
export function ItemPriceField({
  label,
  value,
  source,
  item,
  prices,
  onChange,
  onSourceChange,
}: ItemPriceFieldProps) {
  const available = prices && canUseTsm(item, prices.version)
  return (
    <div className="item-price-field">
      <MoneyInput
        label={label}
        value={value}
        onChange={onChange}
        disabled={prices?.version === 'tbc' && source === 'tsm'}
      />
      {prices?.version === 'tbc' ? (
        <>
          <Checkbox
            label="Использовать цену TSM"
            aria-label={`Использовать цену TSM: ${label}`}
            checked={source === 'tsm'}
            disabled={!available && source !== 'tsm'}
            onChange={(checked) => {
              onSourceChange(checked ? 'tsm' : 'manual')
            }}
          />
          <small>
            {available ? (
              <>
                <MoneyDisplay value={getTsmPrice(item, prices)} /> ·{' '}
                {TSM_METRIC_LABELS[prices.settings.metric]}
                {!prices.settings.market ? ' · выберите рынок в настройках' : ''}
              </>
            ) : (
              'TSM недоступен: у предмета нет игрового ID TBC.'
            )}
          </small>
        </>
      ) : null}
    </div>
  )
}
