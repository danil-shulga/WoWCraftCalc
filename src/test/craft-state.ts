import type { PersistedCraftData, VersionWorkspace } from '../domain/item.types'
import type { GameVersion } from '../domain/game-version'
import { createEmptyCraftData } from '../store/persistence'
import { useCraftStore } from '../store/useCraftStore'

export function testCraftData(
  workspace: Partial<VersionWorkspace> &
    Partial<Pick<PersistedCraftData, 'currencyDisplay' | 'itemLanguage'>> = {},
  version: GameVersion = 'forever',
): PersistedCraftData {
  const data = createEmptyCraftData()
  return {
    ...data,
    activeVersion: version,
    currencyDisplay: workspace.currencyDisplay ?? data.currencyDisplay,
    itemLanguage: workspace.itemLanguage ?? data.itemLanguage,
    workspaces: {
      ...data.workspaces,
      [version]: {
        items: workspace.items ?? {},
        ownedProfessions: workspace.ownedProfessions ?? [],
      },
    },
  }
}

export function setTestCraftState(
  patch: Partial<VersionWorkspace> &
    Partial<Pick<PersistedCraftData, 'currencyDisplay' | 'itemLanguage'>>,
) {
  const state = useCraftStore.getState()
  const { items, ownedProfessions, ...settings } = patch
  useCraftStore.setState({
    ...settings,
    workspaces: {
      ...state.workspaces,
      [state.activeVersion]: {
        ...state.workspaces[state.activeVersion],
        ...(items === undefined ? {} : { items }),
        ...(ownedProfessions === undefined ? {} : { ownedProfessions }),
      },
    },
  })
}
