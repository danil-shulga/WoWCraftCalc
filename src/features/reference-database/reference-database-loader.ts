import {
  buildReferenceDatabaseIndex,
  type ReferenceDatabaseIndex,
} from '../../domain/reference-database-index'
import { parseReferenceDatabase } from '../../domain/reference-database.schema'
import { GAME_VERSION_REGISTRY } from '../../domain/game-version'
import type { GameVersion } from '../../domain/game-version'

export function createReferenceDatabaseLoader(baseUrl: string, timeoutMs = 15000) {
  const cache = new Map<string, Promise<ReferenceDatabaseIndex>>()
  return function loadReferenceDatabase(
    version: GameVersion = 'forever',
  ): Promise<ReferenceDatabaseIndex> {
    const definition = GAME_VERSION_REGISTRY[version]
    const key = `${version}:${definition.build}`
    const cached = cache.get(key)
    if (cached) return cached
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
        response = await fetch(`${baseUrl}${definition.databasePath}`, {
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
        return buildReferenceDatabaseIndex(parseReferenceDatabase(value, version))
      } catch {
        throw new Error('Формат или связи базы повреждены либо версия не поддерживается.')
      }
    }
    const pending = Promise.race([request(), timeout])
      .catch((error: unknown) => {
        cache.delete(key)
        throw error
      })
      .finally(() => {
        clearTimeout(timer)
      })
    cache.set(key, pending)
    return pending
  }
}

export const loadReferenceDatabase = createReferenceDatabaseLoader(
  import.meta.env.BASE_URL,
)
