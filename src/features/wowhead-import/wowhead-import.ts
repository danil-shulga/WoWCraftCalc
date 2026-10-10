import { z } from 'zod'

import { resolveIconUrl } from '../item-editor/icon-url'

const WOWHEAD_HOSTS = new Set(['wowhead.com', 'www.wowhead.com'])
const SPELL_PATH_PATTERN = /\/classic\/(?:[a-z]{2}\/)?spell=(\d+)(?:\/|$)/i
const ITEM_PATH_PATTERN = /\/item=(\d+)(?:\/|$)/i
const WOWHEAD_TOOLTIP_BASE_URL = 'https://nether.wowhead.com/classic/ru/tooltip'

const tooltipResponseSchema = z.object({
  name: z.string().trim().min(1),
  icon: z.string(),
  tooltip: z.string().min(1),
})

export interface WowheadImportItem {
  wowheadItemId: number
  name: string
  iconUrl: string
}

export interface WowheadImportReagent extends WowheadImportItem {
  quantity: number
}

export interface WowheadRecipeImport {
  wowheadSpellId: number
  product: WowheadImportItem
  reagents: WowheadImportReagent[]
}

interface ParsedSpellTooltip {
  product: WowheadImportItem
  reagents: WowheadImportReagent[]
}

function parsePositiveId(value: string): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function getItemIdFromHref(href: string): number | null {
  const match = ITEM_PATH_PATTERN.exec(href)
  return match?.[1] === undefined ? null : parsePositiveId(match[1])
}

function getIconUrl(iconName: string): string {
  return resolveIconUrl(iconName) ?? ''
}

export function parseWowheadSpellUrl(value: string): number | null {
  let url: URL

  try {
    url = new URL(value.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || !WOWHEAD_HOSTS.has(url.hostname.toLowerCase())) {
    return null
  }

  const match = SPELL_PATH_PATTERN.exec(url.pathname)
  return match?.[1] === undefined ? null : parsePositiveId(match[1])
}

export function parseWowheadSpellTooltip(response: unknown): ParsedSpellTooltip {
  const parsedResponse = tooltipResponseSchema.safeParse(response)

  if (!parsedResponse.success) {
    throw new Error('Wowhead вернул данные неизвестного формата')
  }

  const document = new DOMParser().parseFromString(
    parsedResponse.data.tooltip,
    'text/html',
  )
  const reagentContainer = document.querySelector('.indent')

  if (reagentContainer === null) {
    throw new Error('В данных Wowhead не найден состав рецепта')
  }

  const reagents = [...reagentContainer.querySelectorAll<HTMLAnchorElement>('a')]
    .map((anchor): WowheadImportReagent | null => {
      const wowheadItemId = getItemIdFromHref(anchor.getAttribute('href') ?? '')
      const quantityMatch = anchor.nextSibling?.textContent.match(/\((\d+)\)/)
      const quantity =
        quantityMatch?.[1] === undefined ? null : parsePositiveId(quantityMatch[1])
      const name = anchor.textContent.trim()

      if (wowheadItemId === null || quantity === null || name.length === 0) {
        return null
      }

      return { wowheadItemId, name, quantity, iconUrl: '' }
    })
    .filter((reagent): reagent is WowheadImportReagent => reagent !== null)

  if (reagents.length === 0) {
    throw new Error('В данных Wowhead не найдены реагенты')
  }

  const reagentIds = new Set(reagents.map((reagent) => reagent.wowheadItemId))
  const productAnchor = [...document.querySelectorAll<HTMLAnchorElement>('a')].find(
    (anchor) => {
      const itemId = getItemIdFromHref(anchor.getAttribute('href') ?? '')
      return itemId !== null && !reagentIds.has(itemId)
    },
  )
  const productItemId =
    productAnchor === undefined
      ? null
      : getItemIdFromHref(productAnchor.getAttribute('href') ?? '')

  if (productItemId === null) {
    throw new Error('В данных Wowhead не найден создаваемый предмет')
  }

  return {
    product: {
      wowheadItemId: productItemId,
      name: parsedResponse.data.name,
      iconUrl: getIconUrl(parsedResponse.data.icon),
    },
    reagents,
  }
}

async function fetchTooltip(url: string): Promise<unknown> {
  let response: Response

  try {
    response = await fetch(url)
  } catch {
    throw new Error('Не удалось подключиться к Wowhead')
  }

  if (!response.ok) {
    throw new Error(`Wowhead вернул ошибку ${response.status.toString()}`)
  }

  try {
    return (await response.json()) as unknown
  } catch {
    throw new Error('Wowhead вернул некорректный ответ')
  }
}

async function enrichReagent(
  reagent: WowheadImportReagent,
): Promise<WowheadImportReagent> {
  try {
    const response = tooltipResponseSchema.parse(
      await fetchTooltip(
        `${WOWHEAD_TOOLTIP_BASE_URL}/item/${reagent.wowheadItemId.toString()}`,
      ),
    )

    return {
      ...reagent,
      name: response.name,
      iconUrl: getIconUrl(response.icon),
    }
  } catch {
    return reagent
  }
}

export async function fetchWowheadRecipe(value: string): Promise<WowheadRecipeImport> {
  const wowheadSpellId = parseWowheadSpellUrl(value)

  if (wowheadSpellId === null) {
    throw new Error('Введите ссылку на заклинание с сайта Wowhead Classic')
  }

  const parsed = parseWowheadSpellTooltip(
    await fetchTooltip(`${WOWHEAD_TOOLTIP_BASE_URL}/spell/${wowheadSpellId.toString()}`),
  )
  const reagents = await Promise.all(parsed.reagents.map(enrichReagent))

  return {
    wowheadSpellId,
    product: parsed.product,
    reagents,
  }
}
