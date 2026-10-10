const WOW_ICON_BASE_URL = 'https://wow.zamimg.com/images/wow/icons/large/'
const shortIconNamePattern = /^[a-z\d_-]+(?:\.[a-z\d]+)?$/i

export function resolveIconUrl(value: string): string | null {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return ''
  }

  try {
    new URL(trimmedValue)
    return trimmedValue
  } catch {
    if (!shortIconNamePattern.test(trimmedValue)) {
      return null
    }
  }

  const fileName = trimmedValue.includes('.') ? trimmedValue : `${trimmedValue}.jpg`

  return `${WOW_ICON_BASE_URL}${fileName}`
}
