import type { CatalogDisenchantCalculation } from '../../domain/disenchanting-catalog'
import { splitCopper } from '../../domain/money'

const materialNames: Readonly<Record<number, string>> = {
  10940: 'Странная пыль',
  10938: 'Малая магическая субстанция',
  10939: 'Большая магическая субстанция',
  10998: 'Простая Астральная субстанция',
  11082: 'Великая астральная субстанция',
  11083: 'Пыль духа',
  11084: 'Большой мерцающий осколок',
  10978: 'Малый мерцающий осколок',
  11134: 'Простая Таинственная субстанция',
  11135: 'Великая таинственная субстанция',
  11137: 'Пыль провидения',
  11138: 'Малый светящийся осколок',
  11139: 'Большой светящийся осколок',
  11174: 'Простая субстанция Пустоты',
  11175: 'Великая субстанция Пустоты',
  11176: 'Сонная пыль',
  11177: 'Малый светозарный осколок',
  11178: 'Большой светозарный осколок',
  14343: 'Малый сверкающий осколок',
  14344: 'Большой сверкающий осколок',
  16202: 'Простая Вечная субстанция',
  16203: 'Великая Вечная субстанция',
  16204: 'Пыль иллюзий',
  20725: 'Кристалл-источник',

  22445: 'Чародейская пыль',
  22446: 'Великая планарная субстанция',
  22447: 'Простая планарная субстанция',
  22448: 'Малый радужный осколок',
  22449: 'Большой радужный осколок',
  22450: 'Кристалл Бездны',
}

const materialIcons: Readonly<Record<number, string>> = {
  10940: 'inv_enchant_duststrange',
  10938: 'inv_enchant_essencemagicsmall',
  10939: 'inv_enchant_essencemagiclarge',
  10998: 'inv_enchant_essenceastralsmall',
  11082: 'inv_enchant_essenceastrallarge',
  11083: 'inv_enchant_dustsoul',
  11084: 'inv_enchant_shardglimmeringlarge',
  10978: 'inv_enchant_shardglimmeringsmall',
  11134: 'inv_enchant_essencemysticalsmall',
  11135: 'inv_enchant_essencemysticallarge',
  11137: 'inv_enchant_dustvision',
  11138: 'inv_enchant_shardglowingsmall',
  11139: 'inv_enchant_shardglowinglarge',
  11174: 'inv_enchant_essencenethersmall',
  11175: 'inv_enchant_essencenetherlarge',
  11176: 'inv_enchant_dustdream',
  11177: 'inv_enchant_shardradientsmall',
  11178: 'inv_enchant_shardradientlarge',
  14343: 'inv_enchant_shardbrilliantsmall',
  14344: 'inv_enchant_shardbrilliantlarge',
  16202: 'inv_enchant_essenceeternalsmall',
  16203: 'inv_enchant_essenceeternallarge',
  16204: 'inv_enchant_dustillusion',
  20725: 'inv_enchant_shardnexuslarge',

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
      return 'Для этой версии игры расчёт распыления не подтверждён либо версия источника предмета не совпадает с выбранной.'
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
