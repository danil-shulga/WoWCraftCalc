import {
  buildReferenceDatabaseIndex,
  type ReferenceDatabaseIndex,
} from '../../domain/reference-database-index'
import { parseReferenceDatabase } from '../../domain/reference-database.schema'

export const REFERENCE_DATABASE_FILE = 'data/craftcalc-db.1.60.1.70338.json'

export function createReferenceDatabaseLoader(baseUrl: string, timeoutMs = 15000) {
  let pending: Promise<ReferenceDatabaseIndex> | null = null
  return function loadReferenceDatabase(): Promise<ReferenceDatabaseIndex> {
    if (pending !== null) return pending
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(
          new Error('Загрузка базы заняла слишком много времени. Повторите попытку.'),
        )
      }, timeoutMs)
    })
    const request = async () => {
      let response: Response
      try {
        response = await fetch(`${baseUrl}${REFERENCE_DATABASE_FILE}`, {
          signal: controller.signal,
        })
      } catch {
        throw new Error(
          'Не удалось загрузить базу. Проверьте соединение и повторите попытку.',
        )
      }
      if (!response.ok)
        throw new Error(`Не удалось загрузить базу (HTTP ${String(response.status)}).`)
      let value: unknown
      try {
        value = await response.json()
      } catch {
        throw new Error('Файл базы содержит некорректный JSON.')
      }
      try {
        return buildReferenceDatabaseIndex(parseReferenceDatabase(value))
      } catch {
        throw new Error('Формат или связи базы повреждены либо версия не поддерживается.')
      }
    }
    pending = Promise.race([request(), timeout])
      .catch((error: unknown) => {
        pending = null
        throw error
      })
      .finally(() => {
        clearTimeout(timer)
      })
    return pending
  }
}

export const loadReferenceDatabase = createReferenceDatabaseLoader(
  import.meta.env.BASE_URL,
)
