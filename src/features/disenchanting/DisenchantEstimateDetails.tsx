import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { MoneyDisplay } from '../../components/ui/MoneyDisplay/MoneyDisplay'
import type { CatalogDisenchantCalculation } from '../../domain/disenchanting-catalog'
import {
  describeDisenchantEstimate,
  disenchantChanceFormat,
  getDisenchantMaterialIdentity,
} from './disenchanting-presentation'
import './DisenchantEstimateDetails.css'

interface DisenchantEstimateDetailsProps {
  calculation: CatalogDisenchantCalculation
  hasRecipe: boolean
}

export function DisenchantEstimateDetails({
  calculation,
  hasRecipe,
}: DisenchantEstimateDetailsProps) {
  if (calculation.result.status !== 'supported') {
    return (
      <p className="disenchant-details__note">
        {describeDisenchantEstimate(calculation, hasRecipe)}
      </p>
    )
  }

  return (
    <div className="disenchant-details">
      <strong className="disenchant-details__heading">Результаты распыления</strong>
      <ul className="disenchant-details__materials" aria-label="Возможные реагенты">
        {calculation.result.materials
          .filter(({ chance }) => chance.numerator > 0)
          .map(({ itemId, chance, rangeOnDrop, salePriceCopper }) => {
            const issue = calculation.materialIssues.find(
              (entry) => entry.itemId === itemId,
            )
            return (
              <li key={itemId}>
                <ItemIdentity
                  item={getDisenchantMaterialIdentity(itemId)}
                  language="ru"
                  iconSize="small"
                  showSecondaryName={false}
                />
                <span className="disenchant-details__drop">
                  <strong>
                    {rangeOnDrop.min === rangeOnDrop.max
                      ? rangeOnDrop.min
                      : `${String(rangeOnDrop.min)}–${String(rangeOnDrop.max)}`}{' '}
                    шт.
                  </strong>
                  <span>
                    Шанс{' '}
                    {disenchantChanceFormat.format(chance.numerator / chance.denominator)}
                  </span>
                </span>
                <span className="disenchant-details__price">
                  <span>Цена продажи за 1 шт.</span>
                  <MoneyDisplay value={salePriceCopper} />
                </span>
                {issue ? (
                  <span className="disenchant-details__issue">
                    {issue.kind === 'missing-material'
                      ? 'Добавьте материал в каталог и укажите цену продажи.'
                      : issue.kind === 'ambiguous-material'
                        ? 'Найдено несколько записей в каталоге. Оставьте одну запись с этим игровым ID.'
                        : 'Не указана используемая цена продажи.'}
                  </span>
                ) : null}
              </li>
            )
          })}
      </ul>
    </div>
  )
}
