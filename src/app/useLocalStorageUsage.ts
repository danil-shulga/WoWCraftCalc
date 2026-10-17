import { useSyncExternalStore } from 'react'
import { estimateStorageBytes } from '../domain/storage-usage'
import { LOCAL_STORAGE_CHANGED_EVENT } from '../store/local-storage-events'

let storageBytes: number | null = null
const listeners = new Set<() => void>()

function readStorageBytes(): number | null {
  try {
    return estimateStorageBytes(window.localStorage)
  } catch {
    return null
  }
}

function refresh(): void {
  const next = readStorageBytes()
  if (next === storageBytes) return
  storageBytes = next
  for (const onChange of listeners) onChange()
}

function getSnapshot(): number | null {
  return storageBytes
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  if (listeners.size === 1) {
    window.addEventListener(LOCAL_STORAGE_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    // Refresh on mounting, including writes made while no consumer was mounted.
    refresh()
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0) {
      window.removeEventListener(LOCAL_STORAGE_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }
}

export function useLocalStorageUsage(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}
