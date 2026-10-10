import { resolveIconUrl } from './icon-url'

describe('resolveIconUrl', () => {
  it('добавляет адрес Wowhead и расширение для короткого имени', () => {
    expect(resolveIconUrl('inv_ingot_10')).toBe(
      'https://wow.zamimg.com/images/wow/icons/large/inv_ingot_10.jpg',
    )
  })

  it('сохраняет полные URL и указанные расширения', () => {
    expect(resolveIconUrl('https://example.com/icon.png')).toBe(
      'https://example.com/icon.png',
    )
    expect(resolveIconUrl('inv_ingot_10.png')).toBe(
      'https://wow.zamimg.com/images/wow/icons/large/inv_ingot_10.png',
    )
  })

  it('принимает пустое значение и отклоняет некорректное короткое имя', () => {
    expect(resolveIconUrl('  ')).toBe('')
    expect(resolveIconUrl('неверное имя')).toBeNull()
  })
})
