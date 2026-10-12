import { PROFESSION_IDS, PROFESSION_OPTIONS } from './professions'
import type { Profession } from './professions'
import type { WowheadVersion } from './user-settings'

export const GAME_VERSIONS = ['forever', 'tbc', 'classic'] as const
export type GameVersion = (typeof GAME_VERSIONS)[number]
export const DEFAULT_GAME_VERSION: GameVersion = 'forever'

interface GameVersionDefinition {
  name: string
  databasePath: string
  build: string
  mode: string
  product: string
  wowheadVersion: WowheadVersion
  professions: readonly Profession[]
}

const classicProfessions = PROFESSION_IDS.filter((id) => id !== 'jewelcrafting')
export const GAME_VERSION_REGISTRY: Record<GameVersion, GameVersionDefinition> = {
  forever: {
    name: 'Forever',
    databasePath: 'data/forever/craftcalc-db.1.60.1.70338.json',
    build: '1.60.1.70338',
    mode: 'beta',
    product: 'wow_classic_beta',
    wowheadVersion: 'forever',
    professions: classicProfessions,
  },
  tbc: {
    name: 'TBC',
    databasePath: 'data/tbc/craftcalc-db.2.5.6.69795.json',
    build: '2.5.6.69795',
    mode: 'anniversary',
    product: 'wow_anniversary',
    wowheadVersion: 'tbc',
    professions: PROFESSION_IDS,
  },
  classic: {
    name: 'Classic',
    databasePath: 'data/classic/craftcalc-db.1.14.4.51829.json',
    build: '1.14.4.51829',
    mode: 'era',
    product: 'wow_classic_era',
    wowheadVersion: 'classic',
    professions: classicProfessions,
  },
}

export function professionOptionsFor(version: GameVersion) {
  return PROFESSION_OPTIONS.filter((option) =>
    GAME_VERSION_REGISTRY[version].professions.includes(option.value),
  )
}
