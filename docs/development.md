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
  распыления Classic и TBC: версии, диапазоны и распределения материалов.
  Для Forever проверенного набора пока нет.
  [disenchanting-catalog.ts](../src/domain/disenchanting-catalog.ts) разрешает цены
  материалов из каталога и собирает расчёты для вкладки «Распыление».
  Правила, явные допущения и контракт — в [документации](disenchanting.md).
- [useCraftStore.ts](../src/store/useCraftStore.ts) — действия над каталогом и планом;
  [craft.selectors.ts](../src/store/craft.selectors.ts) — выборки активной версии;
  [persistence.ts](../src/store/persistence.ts) — сохранение и резервные копии.
- [recipe-import.types.ts](../src/domain/recipe-import.types.ts) — предметные типы
  импорта; [imported-item-matching.ts](../src/domain/imported-item-matching.ts) —
  чистое сопоставление по источнику и именам. Результаты действий и запрос workspace
  остаются в store.
- [game-version.ts](../src/domain/game-version.ts) — версии, профессии и пути баз;
  [item.schema.ts](../src/domain/item.schema.ts) — проверка пользовательских данных.
- [useBulkPriceDraft.ts](../src/features/item-editor/useBulkPriceDraft.ts) —
  локальные черновики массовых цен и защита переключения версии.
- [ReferenceReview.tsx](../src/features/reference-database/ReferenceReview.tsx) —
  управляемый предпросмотр базы; поиск и подтверждение набора — в `ReferenceBrowser.tsx`,
  черновики — в `useReferenceDrafts.ts`, список выбора — в `ReferenceSelection.tsx`,
  загрузка и повтор — в `ReferenceDatabaseForm.tsx` рядом.
  [reference-import.ts](../src/store/reference-import.ts) готовит пакет без записи;
  действие `importReferenceBatch` в `useCraftStore.ts` применяет его одним обновлением.
- [src/features](../src/features) — редакторы и интеграции;
  [src/components/ui](../src/components/ui) — общие контролы.
  Краткая [карта компонентов](ui-components.md) помогает выбрать реализацию;
  [подробности UI](ui-features.md) читай по затрагиваемому сценарию.

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
Оба сервера используют `http://localhost:5173/` и завершаются с ошибкой, если
порт занят, без перехода на другой порт. Для проверки используй уже работающий
сервер или останови его перед запуском другого. Каталог хранится в браузере
для конкретного адреса и профиля: открывай именно `localhost`, а не `127.0.0.1`,
и тот же профиль браузера, чтобы использовать сохранённые данные.
Для сборки со свежими ценами порядок такой: `npm run build` →
`npm run tsm:refresh` → `npm run preview`, поскольку сборка очищает `dist`.
Подробности — в [документации TSM](tsm-tbc.md).

## Проверки

- Начинай с ближайших тестов: `npm run test -- путь/к/файлу.test.ts`.
- Тесты каталога: `src/pages/ItemsPage.test.tsx` — базовые сценарии;
  соседние `ItemsPage.drag/favorites/prices/planner.test.tsx` — перенос, избранное,
  массовые цены и план. Общая фикстура — `src/test/items-page-fixture.ts`.
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
