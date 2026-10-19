import type { Item } from '../../domain/item.types'
import type { ProfitabilityResult } from '../../domain/profitability'
import type { ItemLanguage } from '../../domain/user-settings'
import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../../components/ui/MoneyDisplay/MoneyDisplay'
import { Tooltip } from '../../components/ui/Tooltip/Tooltip'
import { DisenchantEstimateDetails } from '../disenchanting/DisenchantEstimateDetails'
import { percentFormat, PROFITABILITY_LABELS } from './profitability-presentation'

export interface ProfitableDisplayRow {
  item: Item
  result: ProfitabilityResult
}

export function ProfitableItemRow({
  item,
  result,
  language,
}: ProfitableDisplayRow & { language: ItemLanguage }) {
  const labels = PROFITABILITY_LABELS[result.mode]
  const costSource =
    result.costSource === 'recipe'
      ? 'Рецепт'
      : result.costSource === 'tsm'
        ? 'TSM'
        : 'Заданная'
  const saleSource = result.saleSource === 'tsm' ? 'TSM' : 'Заданная'
  const gross = (
    <MoneyDisplay value={result.gross === null ? null : Math.round(result.gross)} />
  )
  return (
    <div className="profitable-list__cells" role="presentation">
      <div role="cell">
        <ItemIdentity item={item} language={language} iconSize="small" fitWrappedName />
      </div>
      <div role="cell" className="profitable-list__amount">
        <Tooltip content={`${labels.cost}: ${costSource}`}>
          <MoneyDisplay value={result.cost === null ? null : Math.round(result.cost)} />
        </Tooltip>
      </div>
      {result.mode === 'disenchant' ? (
        <div role="cell" className="profitable-list__amount">
          <Tooltip content="Себестоимость крафта за один предмет по рецепту">
            <MoneyDisplay
              value={result.craftCost === null ? null : Math.round(result.craftCost)}
            />
          </Tooltip>
        </div>
      ) : null}
      <div role="cell" className="profitable-list__amount">
        {result.disenchant ? (
          <Tooltip
            content={
              <>
                <p>Ожидаемый выход материалов до комиссии</p>
                <DisenchantEstimateDetails
                  calculation={{
                    result: result.disenchant,
                    configuredProfit: result.gain,
                    buyProfit: null,
                    allProfessionsProfit: null,
                    boughtReagentsProfit: null,
                    materialIssues: [],
                  }}
                  hasRecipe={false}
                />
              </>
            }
          >
            {gross}
          </Tooltip>
        ) : (
          <Tooltip content={`${labels.sale}: ${saleSource}`}>{gross}</Tooltip>
        )}
      </div>
      <div
        role="cell"
        className="profitable-list__amount profitable-list__gain"
        data-positive={(result.gain !== null && result.gain > 0) || undefined}
        data-negative={(result.gain !== null && result.gain < 0) || undefined}
      >
        <Tooltip
          content={
            result.mode === 'disenchant'
              ? 'После комиссии 5% за вычетом меньшей из известных цены покупки и себестоимости крафта'
              : 'После комиссии 5% за вычетом затрат'
          }
        >
          <MoneyDisplay value={result.gain === null ? null : Math.round(result.gain)} />
        </Tooltip>
      </div>
      <div role="cell" className="profitable-list__amount">
        {result.percent === null
          ? 'Не определена'
          : `${percentFormat.format(result.percent)}%`}
      </div>
    </div>
  )
}
