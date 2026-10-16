import { CLASSIC_DISENCHANT_RULES } from './disenchanting-classic'
import { TBC_DISENCHANT_RULES } from './disenchanting-tbc'
import type { DisenchantRuleSet } from './disenchanting.schema'
import type { GameVersion } from './game-version'

export function getDisenchantRuleSet(version: GameVersion): DisenchantRuleSet | null {
  switch (version) {
    case 'classic':
      return CLASSIC_DISENCHANT_RULES
    case 'tbc':
      return TBC_DISENCHANT_RULES
    case 'forever':
      // Forever has Boosted Disenchanting; equivalent baseline tables are unverified.
      return null
  }
}
