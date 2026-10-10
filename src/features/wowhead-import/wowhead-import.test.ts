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
    Инструменты:
    <div class="indent">
      <a href="/classic/ru/item=5956/кузнечный-молот">Кузнечный молот</a>
    </div>
    Ингредиенты:
    <div class="indent">
      <a href="/classic/ru/item=4305/рулон-шелка">Рулон шелка</a>&nbsp;(2),
      <a href="/classic/ru/item=2319/жесткая-кожа">Жесткая кожа</a>&nbsp;(4)
    </div>
    <div class="q">
      Создание возможно только рядом с
      <a href="/classic/ru/item=9999/условие">особым объектом</a> (3).
    </div>
    <span class="q1">
      <a href="/classic/ru/item=4320/сапоги">Сапоги из паучьего шелка</a>
    </span>
  `,
}

describe('импорт Wowhead', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('извлекает spell ID из ссылок Wowhead Classic, TBC и Forever', () => {
    expect(
      parseWowheadSpellUrl(
        'https://www.wowhead.com/classic/ru/spell=3855/сапоги-из-паучьего-шелка',
      ),
    ).toBe(3855)
    expect(
      parseWowheadSpellUrl(
        'https://www.wowhead.com/tbc/ru/spell=44391/полевой-ремонтный-робот',
      ),
    ).toBe(44391)
    expect(
      parseWowheadSpellUrl(
        'https://www.wowhead.com/forever/ru/spell=1257390/пламенный-кушак',
      ),
    ).toBe(1257390)
    expect(parseWowheadSpellUrl('https://example.com/classic/ru/spell=3855')).toBeNull()
    expect(parseWowheadSpellUrl('https://www.wowhead.com/ru/spell=3855')).toBeNull()
  })

  it('разбирает только ингредиенты и игнорирует инструменты и условия', () => {
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

  it('считает отсутствующее количество ингредиента равным единице', () => {
    const tooltip = {
      name: 'Полевой ремонтный робот 110G',
      icon: 'inv_misc_enggizmos_01',
      tooltip: `
        Инструменты:<br />
        <div class="indent q1">
          <a href="/tbc/ru/item=5956/кузнечный-молот">Кузнечный молот</a>
        </div>
        Ингредиенты:<br />
        <div class="indent q1">
          <a href="/tbc/ru/item=23446/адамантитовый-слиток">Адамантитовый слиток</a>&nbsp;(8),
          <a href="/tbc/ru/item=23786/кориевое-силовое-ядро">Кориевое силовое ядро</a>
        </div>
        <span class="q1">
          <a href="/tbc/ru/item=34113/полевой-ремонтный-робот-110g">Полевой ремонтный робот 110G</a>
        </span>
        Требует <a href="/tbc/ru/skill=202/инженерное-дело">Инженерное дело</a> (325)
      `,
    }

    expect(parseWowheadSpellTooltip(tooltip).reagents).toEqual([
      {
        wowheadItemId: 23446,
        name: 'Адамантитовый слиток',
        quantity: 8,
        iconUrl: '',
      },
      {
        wowheadItemId: 23786,
        name: 'Кориевое силовое ядро',
        quantity: 1,
        iconUrl: '',
      },
    ])
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

  it('запрашивает TBC tooltip для TBC-ссылки', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

      if (url.endsWith('/spell/44391')) {
        return Promise.resolve(Response.json(spellTooltip))
      }

      return Promise.resolve(
        Response.json({ ...spellTooltip, tooltip: '<p>Предмет</p>' }),
      )
    })

    await fetchWowheadRecipe(
      'https://www.wowhead.com/tbc/ru/spell=44391/полевой-ремонтный-робот',
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://nether.wowhead.com/tbc/ru/tooltip/spell/44391',
    )
  })

  it('запрашивает Forever tooltip для Forever-ссылки', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

      if (url.endsWith('/spell/1257390')) {
        return Promise.resolve(Response.json(spellTooltip))
      }

      return Promise.resolve(
        Response.json({ ...spellTooltip, tooltip: '<p>Предмет</p>' }),
      )
    })

    await fetchWowheadRecipe(
      'https://www.wowhead.com/forever/ru/spell=1257390/пламенный-кушак',
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://nether.wowhead.com/forever/ru/tooltip/spell/1257390',
    )
  })
})
