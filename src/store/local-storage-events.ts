export const LOCAL_STORAGE_CHANGED_EVENT = 'craftcalc:local-storage-changed'

// Native storage events only reach other documents. Notify this tab after a
// successful localStorage mutation; sessionStorage does not affect this estimate.
export function notifyLocalStorageChanged(): void {
  window.dispatchEvent(new Event(LOCAL_STORAGE_CHANGED_EVENT))
}
