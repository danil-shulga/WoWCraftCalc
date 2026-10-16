import type { CatalogDisenchantCalculation } from '../../domain/disenchanting-catalog'
import { splitCopper } from '../../domain/money'

const materialNames: Readonly<Record<number, string>> = {
  22445: 'Чародейская пыль',
  22446: 'Великая планарная субстанция',
  22447: 'Простая планарная субстанция',
  22448: 'Малый радужный осколок',
  22449: 'Большой радужный осколок',
  22450: 'Кристалл Бездны',
}

const materialIcons: Readonly<Record<number, string>> = {
  22445: 'inv_enchant_dustarcane',
  22446: 'inv_enchant_essencearcanelarge',
  22447: 'inv_enchant_essencearcanesmall',
  22448: 'inv_enchant_shardprismaticsmall',
  22449: 'inv_enchant_shardprismaticlarge',
  22450: 'inv_enchant_voidcrystal',
}

export function getDisenchantMaterialIdentity(itemId: number) {
  const icon = materialIcons[itemId]
  return {
    name: materialNames[itemId] ?? `Материал (ID ${String(itemId)})`,
    iconUrl: icon ? `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg` : '',
  }
}

function describeMaterialPrice(value: number | null): string {
  if (value === null) return 'не указана'
  const { gold, silver, copper } = splitCopper(value)
  return [
    ...(gold > 0 ? [`${String(gold)} з.`] : []),
    ...(silver > 0 || gold > 0 ? [`${String(silver)} с.`] : []),
    `${String(copper)} м.`,
  ].join(' ')
}

export const disenchantChanceFormat = new Intl.NumberFormat('ru-RU', {
  style: 'percent',
  maximumFractionDigits: 2,
})

export function describeDisenchantEstimate(
  calculation: CatalogDisenchantCalculation,
  hasRecipe: boolean,
): string {
  switch (calculation.result.status) {
    case 'not-disenchantable':
      return 'Этот предмет нельзя распылить: найден подтверждённый запрет.'
    case 'missing-metadata':
      return 'Недостаточно данных о предмете. Импортируйте его из базы: нужны игровой ID, качество, ilvl и тип экипировки.'
    case 'unsupported-rule':
      return 'Для этого качества, ilvl или типа экипировки правило распыления пока не поддерживается.'
    case 'unsupported-version':
      return 'Расчёт распыления доступен только для предметов TBC.'
    case 'supported': {
      const materials = calculation.result.materials
        .filter(({ chance }) => chance.numerator > 0)
        .map(({ itemId, chance, rangeOnDrop, salePriceCopper }) => {
          const name = materialNames[itemId] ?? `Материал (ID ${String(itemId)})`
          const quantity =
            rangeOnDrop.min === rangeOnDrop.max
              ? String(rangeOnDrop.min)
              : `${String(rangeOnDrop.min)}–${String(rangeOnDrop.max)}`
          return `${name}: ${quantity} шт., шанс ${disenchantChanceFormat.format(chance.numerator / chance.denominator)}; цена продажи за 1 шт.: ${describeMaterialPrice(salePriceCopper)}`
        })
      const issues = calculation.materialIssues.map((issue) => {
        const name = `${materialNames[issue.itemId] ?? 'Материал'} (ID ${String(issue.itemId)})`
        switch (issue.kind) {
          case 'missing-material':
            return `${name}: добавьте материал в каталог и укажите цену продажи.`
          case 'ambiguous-material':
            return `${name}: несколько записей в каталоге. Оставьте одну запись с этим игровым ID, чтобы однозначно выбрать цену.`
          case 'missing-price':
            return `${name}: не указана используемая цена продажи.`
        }
      })
      return [
        'Возможные результаты за один предмет:',
        ...materials,
        ...issues,
        'Ожидаемая стоимость материалов за один предмет, до комиссии аукциона.',
        hasRecipe
          ? 'Прибыль учитывает себестоимость крафта за единицу.'
          : 'Без рецепта прибыль учитывает цену покупки предмета.',
        ...(calculation.result.assumptions.length
          ? ['Количество внутри диапазона считается равновероятным.']
          : []),
      ].join('\n')
    }
  }
}
