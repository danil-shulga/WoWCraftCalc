import {
  fetchWowheadRecipe,
  parseWowheadSpellTooltip,
  parseWowheadSpellUrl,
} from './wowhead-import'

const spellTooltip = {
  name: 'Сапоги из паучьего шелка',
  icon: 'inv_boots_05',
  tooltip: `
    <a href="/classic/ru/spell=3855">Сапоги из паучьего шелка</a>
    <div class="indent">
      <a href="/classic/ru/item=4305/рулон-шелка">Рулон шелка</a>&nbsp;(2),
      <a href="/classic/ru/item=2319/жесткая-кожа">Жесткая кожа</a>&nbsp;(4)
    </div>
    <a href="/classic/ru/item=4320/сапоги">Сапоги из паучьего шелка</a>
  `,
}

describe('импорт Wowhead', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('извлекает spell ID только из ссылки Wowhead Classic', () => {
    expect(
      parseWowheadSpellUrl(
        'https://www.wowhead.com/classic/ru/spell=3855/сапоги-из-паучьего-шелка',
      ),
    ).toBe(3855)
    expect(parseWowheadSpellUrl('https://example.com/classic/ru/spell=3855')).toBeNull()
    expect(parseWowheadSpellUrl('https://www.wowhead.com/ru/spell=3855')).toBeNull()
  })

  it('разбирает создаваемый предмет и реагенты с количествами', () => {
    expect(parseWowheadSpellTooltip(spellTooltip)).toEqual({
      product: {
        wowheadItemId: 4320,
        name: 'Сапоги из паучьего шелка',
        iconUrl: 'https://wow.zamimg.com/images/wow/icons/large/inv_boots_05.jpg',
      },
      reagents: [
        { wowheadItemId: 4305, name: 'Рулон шелка', quantity: 2, iconUrl: '' },
        { wowheadItemId: 2319, name: 'Жесткая кожа', quantity: 4, iconUrl: '' },
      ],
    })
  })

  it('отклоняет ответ без состава рецепта', () => {
    expect(() =>
      parseWowheadSpellTooltip({ ...spellTooltip, tooltip: '<p>Нет реагентов</p>' }),
    ).toThrow('не найден состав рецепта')
  })

  it('добавляет данные иконок реагентов из item tooltip', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

      if (url.endsWith('/spell/3855')) {
        return Promise.resolve(Response.json(spellTooltip))
      }

      const itemId = url.endsWith('/item/4305') ? 4305 : 2319
      return Promise.resolve(
        Response.json({
          name: itemId === 4305 ? 'Рулон шелка' : 'Жесткая кожа',
          icon: itemId === 4305 ? 'inv_fabric_silk_03' : 'inv_misc_leatherscrap_05',
          tooltip: '<p>Предмет</p>',
        }),
      )
    })

    const result = await fetchWowheadRecipe(
      'https://www.wowhead.com/classic/ru/spell=3855/сапоги',
    )

    expect(result.reagents.map((reagent) => reagent.iconUrl)).toEqual([
      'https://wow.zamimg.com/images/wow/icons/large/inv_fabric_silk_03.jpg',
      'https://wow.zamimg.com/images/wow/icons/large/inv_misc_leatherscrap_05.jpg',
    ])
  })
})
