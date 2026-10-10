const COPPER_PER_SILVER = 100
const COPPER_PER_GOLD = 10_000

export interface MoneyParts {
  gold: number
  silver: number
  copper: number
}

export function splitCopper(totalCopper: number | null): MoneyParts {
  if (totalCopper === null || totalCopper < 0) {
    return { gold: 0, silver: 0, copper: 0 }
  }

  const gold = Math.floor(totalCopper / COPPER_PER_GOLD)
  const afterGold = totalCopper % COPPER_PER_GOLD

  return {
    gold,
    silver: Math.floor(afterGold / COPPER_PER_SILVER),
    copper: afterGold % COPPER_PER_SILVER,
  }
}

export function combineMoney(parts: MoneyParts): number {
  return (
    Math.max(0, Math.floor(parts.gold)) * COPPER_PER_GOLD +
    Math.max(0, Math.floor(parts.silver)) * COPPER_PER_SILVER +
    Math.max(0, Math.floor(parts.copper))
  )
}

export function formatMoney(totalCopper: number | null): string {
  if (totalCopper === null) {
    return 'не указано'
  }

  const sign = totalCopper < 0 ? '−' : ''
  const { gold, silver, copper } = splitCopper(Math.abs(totalCopper))
  const parts: string[] = []

  if (gold > 0) {
    parts.push(`${gold.toString()} з`)
  }

  if (silver > 0 || gold > 0) {
    parts.push(`${silver.toString()} с`)
  }

  parts.push(`${copper.toString()} м`)

  return `${sign}${parts.join(' ')}`
}
