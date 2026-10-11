import { z } from 'zod'

import { resolveIconUrl } from '../item-editor/icon-url'

const WOWHEAD_HOSTS = new Set(['wowhead.com', 'www.wowhead.com'])
const SPELL_PATH_PATTERN = /\/(classic|tbc|forever)\/(?:[a-z]{2}\/)?spell=(\d+)(?:\/|$)/i
const ITEM_PATH_PATTERN = /\/item=(\d+)(?:\/|$)/i

type WowheadVersion = 'classic' | 'tbc' | 'forever'

interface WowheadSpellReference {
  version: WowheadVersion
  spellId: number
}

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

function parseWowheadSpellReference(value: string): WowheadSpellReference | null {
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
  const version = match?.[1]?.toLowerCase()
  const spellId = match?.[2] === undefined ? null : parsePositiveId(match[2])

  if (
    (version !== 'classic' && version !== 'tbc' && version !== 'forever') ||
    spellId === null
  ) {
    return null
  }

  return { version, spellId }
}

function getTooltipBaseUrl(version: WowheadVersion): string {
  return `https://nether.wowhead.com/${version}/ru/tooltip`
}

function getSectionTitle(container: Element): string {
  let sibling = container.previousSibling

  while (sibling !== null) {
    const text = sibling.textContent?.trim() ?? ''

    if (sibling.nodeName !== 'BR' && text.length > 0) {
      return text
    }

    sibling = sibling.previousSibling
  }

  return ''
}

export function parseWowheadSpellUrl(value: string): number | null {
  return parseWowheadSpellReference(value)?.spellId ?? null
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
  const reagentContainers = [...document.querySelectorAll<HTMLElement>('.indent')]

  const reagentContainer = reagentContainers.find(
    (container) => getSectionTitle(container) === 'Ингредиенты:',
  )

  if (reagentContainer === undefined) {
    throw new Error('В данных Wowhead не найден состав рецепта')
  }

  const reagentAnchors = [...reagentContainer.querySelectorAll<HTMLAnchorElement>('a')]
  const reagents = reagentAnchors
    .map((anchor): WowheadImportReagent | null => {
      const wowheadItemId = getItemIdFromHref(anchor.getAttribute('href') ?? '')
      const quantityMatch = anchor.nextSibling?.textContent?.match(/\((\d+)\)/)
      const quantity =
        quantityMatch?.[1] === undefined ? 1 : parsePositiveId(quantityMatch[1])
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

  const productAnchor = [
    ...document.querySelectorAll<HTMLAnchorElement>('span > a'),
  ].find((anchor) => getItemIdFromHref(anchor.getAttribute('href') ?? '') !== null)
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
  version: WowheadVersion,
): Promise<WowheadImportReagent> {
  try {
    const response = tooltipResponseSchema.parse(
      await fetchTooltip(
        `${getTooltipBaseUrl(version)}/item/${reagent.wowheadItemId.toString()}`,
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
  const reference = parseWowheadSpellReference(value)

  if (reference === null) {
    throw new Error(
      'Введите ссылку на заклинание с сайта Wowhead Classic, TBC или Forever',
    )
  }

  const parsed = parseWowheadSpellTooltip(
    await fetchTooltip(
      `${getTooltipBaseUrl(reference.version)}/spell/${reference.spellId.toString()}`,
    ),
  )
  const reagents = await Promise.all(
    parsed.reagents.map((reagent) => enrichReagent(reagent, reference.version)),
  )

  return {
    wowheadSpellId: reference.spellId,
    product: parsed.product,
    reagents,
  }
}
