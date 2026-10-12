import { createContext, useContext, useEffect, useId, useState } from 'react'

export const DraftContext = createContext<Set<string> | null>(null)

export function useDraftGuard(dirty: boolean) {
  const drafts = useContext(DraftContext)
  const id = useId()
  useEffect(() => {
    if (dirty) drafts?.add(id)
    else drafts?.delete(id)
    return () => {
      drafts?.delete(id)
    }
  }, [dirty, drafts, id])
}

export function useDraftSnapshot(value: unknown) {
  const serialized = JSON.stringify(value)
  const [initial] = useState(serialized)
  useDraftGuard(serialized !== initial)
}
