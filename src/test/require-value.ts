// Фикстура должна падать явно, если нужное значение отсутствует.
export function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Нет ожидаемого значения в тестовой фикстуре')
  return value
}
