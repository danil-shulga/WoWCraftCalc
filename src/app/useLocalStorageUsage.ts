import { useSyncExternalStore } from 'react'
import { estimateStorageBytes } from '../domain/storage-usage'

function readStorageBytes(): number | null {
  try {
    return estimateStorageBytes(window.localStorage)
  } catch {
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  // The storage event only reports writes from other tabs; polling also sees
  // this tab's catalog saves and TSM cache writes without changing persistence.
  const timer = window.setInterval(onChange, 2000)
  window.addEventListener('storage', onChange)
  window.addEventListener('focus', onChange)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('storage', onChange)
    window.removeEventListener('focus', onChange)
  }
}

export function useLocalStorageUsage(): number | null {
  return useSyncExternalStore(subscribe, readStorageBytes)
}
