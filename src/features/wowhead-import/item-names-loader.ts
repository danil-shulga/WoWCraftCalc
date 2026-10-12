import type { ItemCatalog, ItemNames, ItemNamesUpdate } from '../../domain/item.types'
import { GAME_VERSION_REGISTRY } from '../../domain/game-version'
import type { GameVersion } from '../../domain/game-version'
import { fetchWowheadItemNames } from './wowhead-import'

export function selectItemsMissingNames(catalog: ItemCatalog) {
  return Object.values(catalog).filter(
    (item) => item.source !== undefined && (!item.names?.ru || !item.names.en),
  )
}

export async function fetchMissingItemNames(
  catalog: ItemCatalog,
  gameVersion: GameVersion = 'forever',
): Promise<ItemNamesUpdate[]> {
  const targets = selectItemsMissingNames(catalog)
  const cache = new Map<string, Promise<ItemNames>>()
  const updates: ItemNamesUpdate[] = []
  // Limit network concurrency and reuse requests for shared Wowhead IDs.
  for (let offset = 0; offset < targets.length; offset += 4) {
    const batch = await Promise.all(
      targets.slice(offset, offset + 4).map(async (target) => {
        const source = target.source
        if (source === undefined) throw new Error('Missing Wowhead ID')
        const version = GAME_VERSION_REGISTRY[gameVersion].wowheadVersion
        if (source.wowheadVersion !== undefined && source.wowheadVersion !== version)
          throw new Error('Источник предмета относится к другой версии игры')
        const key = `${version}:${source.wowheadItemId.toString()}`
        let request = cache.get(key)
        if (request === undefined) {
          request = fetchWowheadItemNames(source.wowheadItemId, version)
          cache.set(key, request)
        }
        return {
          expectedItem: target,
          itemId: target.id,
          wowheadItemId: source.wowheadItemId,
          wowheadVersion: version,
          names: await request,
        }
      }),
    )
    updates.push(...batch)
  }
  return updates
}
