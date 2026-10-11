import type { ItemCatalog, ItemNames, ItemNamesUpdate } from '../../domain/item.types'
import { WOWHEAD_VERSIONS } from '../../domain/user-settings'
import { fetchWowheadItemNames } from './wowhead-import'

export function selectItemsMissingNames(catalog: ItemCatalog) {
  return Object.values(catalog).filter(
    (item) => item.source !== undefined && (!item.names?.ru || !item.names.en),
  )
}

export async function fetchMissingItemNames(
  catalog: ItemCatalog,
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
        const versions = source.wowheadVersion
          ? [source.wowheadVersion]
          : WOWHEAD_VERSIONS
        for (const version of versions) {
          const key = `${version}:${source.wowheadItemId.toString()}`
          let request = cache.get(key)
          if (request === undefined) {
            request = fetchWowheadItemNames(source.wowheadItemId, version)
            cache.set(key, request)
          }
          try {
            return {
              itemId: target.id,
              wowheadItemId: source.wowheadItemId,
              wowheadVersion: version,
              names: await request,
            }
          } catch (error) {
            if (version === versions.at(-1)) throw error
          }
        }
        throw new Error('Wowhead item names unavailable')
      }),
    )
    updates.push(...batch)
  }
  return updates
}
