import { PROFITABILITY_MODES, type ProfitabilityMode } from '../../domain/profitability'

export const PROFITABILITY_LABELS = {
  buy: {
    label: 'Покупка',
    cost: 'Текущая оценка',
    sale: 'Рыночная цена',
    gain: 'Потенц. прибыль',
    rate: 'Отклонение',
  },
  sell: {
    label: 'Продажа',
    cost: 'Рыночная цена',
    sale: 'Текущая оценка',
    gain: 'Потенц. прибыль',
    rate: 'Отклонение',
  },
  craft: {
    label: 'Крафт и продажа',
    cost: 'Крафт',
    sale: 'Продажа',
    gain: 'Прибыль',
    rate: 'Доходность',
  },
  disenchant: {
    label: 'Распыление',
    cost: 'Покупка',
    sale: 'Материалы',
    gain: 'Ожид. прибыль',
    rate: 'Доходность',
  },
} satisfies Record<
  ProfitabilityMode,
  {
    label: string
    cost: string
    sale: string
    gain: string
    rate: string
  }
>

export const PROFITABILITY_TABS = PROFITABILITY_MODES.map((value) => ({
  value,
  label: PROFITABILITY_LABELS[value].label,
}))

export const percentFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

export type ProfitabilitySortKey =
  'name' | 'cost' | 'craftCost' | 'gross' | 'gain' | 'percent'
export interface ProfitabilitySort {
  key: ProfitabilitySortKey
  direction: 'ascending' | 'descending'
}
