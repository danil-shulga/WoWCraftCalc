# Рабочая памятка CraftCalc

Этот файл помогает быстро найти код и команды. Обязательные инструкции и ссылки
на тематические правила находятся в [AGENTS.md](../AGENTS.md).
Описание возможностей для пользователя — в [README.md](../README.md).

## Где искать реализацию

- [App.tsx](../src/app/App.tsx) — разделы, настройки, переключение версии,
  подключение общего расчёта плана и клиента TSM.
- [ItemsPage.tsx](../src/pages/ItemsPage.tsx) — крафты, реагенты, распыление и избранное;
  [PlannerPage.tsx](../src/pages/PlannerPage.tsx) — цели, закупка и этапы изготовления.
  «Выгодные» пока показывают заглушку.
- [calculations.ts](../src/domain/calculations.ts) — себестоимость и прибыль каталога;
  [planner.ts](../src/domain/planner.ts) — планирование целых партий.
  Это разные расчёты: каталог усредняет стоимость единицы, план учитывает излишки.
- [disenchanting.ts](../src/domain/disenchanting.ts) — чистая справочная оценка
  дизенчанта TBC: зелёные ilvl 79–120 и синие ilvl 100–115.
  [disenchanting-catalog.ts](../src/domain/disenchanting-catalog.ts) разрешает цены
  материалов из каталога и собирает расчёты для вкладки «Распыление».
  Правила, явные допущения и контракт — в [документации](disenchanting-tbc.md).
- [useCraftStore.ts](../src/store/useCraftStore.ts) — действия над каталогом и планом;
  [craft.selectors.ts](../src/store/craft.selectors.ts) — выборки активной версии;
  [persistence.ts](../src/store/persistence.ts) — сохранение и резервные копии.
- [game-version.ts](../src/domain/game-version.ts) — версии, профессии и пути баз;
  [item.schema.ts](../src/domain/item.schema.ts) — проверка пользовательских данных.
- [src/features](../src/features) — редакторы и интеграции;
  [src/components/ui](../src/components/ui) — общие контролы.
  Карта компонентов и правила переиспользования — в
  [ui-and-features.mdc](../.cursor/rules/ui-and-features.mdc).

## Запуск

Версию Node.js сверяй с `engines` в [package.json](../package.json).
Для скриптов TSM нужен Python 3.12+.

```shell
npm ci
npm run dev
```

`dev` сначала вызывает сетевое обновление TSM через `predev`. Для проверки
интерфейса с уже подготовленными снимками запускай Vite напрямую:

```shell
node node_modules/vite/bin/vite.js
```

Обычная сборка: `npm run build`, просмотр: `npm run preview`.
Для сборки со свежими ценами порядок такой: `npm run build` →
`npm run tsm:refresh` → `npm run preview`, поскольку сборка очищает `dist`.
Подробности — в [документации TSM](tsm-tbc.md).

## Проверки

- Начинай с ближайших тестов: `npm run test -- путь/к/файлу.test.ts`.
- После изменения кода запускай `npm run check` и `npm run build`.
  `check` последовательно выполняет TypeScript, ESLint, Prettier и Vitest;
  если один этап упал, следующие не запускались.
- `npm run typecheck` проверяет оба TS-проекта. Сборка Vite сама по себе
  не заменяет эту проверку.
- Скрипты справочников: `npm run data:test`; скрипты цен: `npm run tsm:test`.
  Эти проверки не входят в `check`.
- Для документации достаточно Prettier изменённых файлов, проверки ссылок
  и `git diff --check`. Для `.mdc` указывай `--parser markdown`.
- Если общая проверка падает на неизменённых файлах, отдели исходные проблемы
  от результата своей правки и явно укажи, какие этапы действительно выполнены.
  Не используй прежние результаты проверки как подтверждение текущего состояния.

## Данные, которые легко перепутать

- Пользовательские каталоги и планы трёх версий хранятся в `localStorage`
  под ключом `craft-calc-versioned-data`, версия сохранения — 1.
  Экспорт `craftcalc-versioned-backup` v1 включает все три workspace и настройки.
- Справочники schema 2 в `public/data/<version>` отделены от пользовательских
  данных. Происхождение и пересборка описаны в [документации баз](versioned-databases.md).
- Старый `public/data/craftcalc-db.1.60.1.70338.json` нужен скриптам сравнения
  и тестам. Отсутствие импорта в приложении не делает его ненужным.
- Кэш TSM хранится отдельно в `sessionStorage` и не входит в JSON backup.
  Снимки сайта готовятся Python-скриптами; браузер читает опубликованные JSON.
- Несохранённые формы регистрируются в [draft-guard.ts](../src/app/draft-guard.ts).
  Асинхронные изменения проверяют версию и `workspaceRevision`, чтобы ответ
  старого запроса не изменил другой каталог.
