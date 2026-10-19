# Рабочая памятка CraftCalc

Этот файл помогает быстро найти код и команды. Обязательные инструкции и ссылки
на тематические правила находятся в [AGENTS.md](../AGENTS.md).
Описание возможностей для пользователя — в [README.md](../README.md).

## Где искать реализацию

- [App.tsx](../src/app/App.tsx) — разделы, настройки, переключение версии,
  подключение общего расчёта плана и клиента TSM.
- [ItemsPage.tsx](../src/pages/ItemsPage.tsx) — крафты, реагенты, распыление и избранное;
  [PlannerPage.tsx](../src/pages/PlannerPage.tsx) — цели, закупка и этапы изготовления.
  [ProfitablePage.tsx](../src/pages/ProfitablePage.tsx) — возможности среди добавленных
  предметов; формулы и ограничения — в [описании](profitable.md).
- [calculations.ts](../src/domain/calculations.ts) — себестоимость и прибыль каталога;
  [planner.ts](../src/domain/planner.ts) — планирование целых партий.
  Это разные расчёты: каталог усредняет стоимость единицы, план учитывает излишки.
- [profitability.ts](../src/domain/profitability.ts) — снимок возможностей,
  фиксированная комиссия 5%, включая отрицательные и неизвестные результаты.
  Параметры страницы не сохраняются; прежнее `workspace.profitableSettings`
  игнорируется при чтении и импорте без изменения остальных данных.
- [essence-conversion.ts](../src/domain/essence-conversion.ts) — встроенные пары
  эссенций и эффективный рецепт для расчётов и отображения. Пропорция 3 ↔ 1,
  исходный материал всегда покупается; преобразования не записываются в store
  и резервные копии. Нужны обе формы с однозначными игровыми ID; ручной рецепт
  имеет приоритет. Планарная пара доступна в TBC; остальные пять пар — общие.
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

`dev` сначала вызывает сетевое обновление TSM через `predev`. Для агентских
проверок интерфейса с уже подготовленными снимками используй отдельный сервер:

```shell
npm run dev:agent
```

Обычная сборка: `npm run build`, просмотр: `npm run preview`.
Пользовательские `dev` и `preview` используют `http://localhost:5173/`.
Агентские `dev:agent` и `preview:agent` используют только `http://localhost:5174/`;
они не запускают сетевое обновление TSM. Все команды завершаются с ошибкой, если
их порт занят, без перехода на другой порт. Агент переиспользует свой работающий
сервер и не запускает и не останавливает пользовательский сервер на `5173`.
Каталог хранится в браузере для конкретного адреса и профиля: открывай именно
`localhost`, а не `127.0.0.1`, и тот же профиль браузера. Данные на `5173` и `5174`
независимы; сохраняй тестовые данные на `5174` между проверками.
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
- Замеры чистых функций без HTTP-сервера:
  `node scripts/measure-performance.mjs --output путь-к-отчёту.json`.
  Добавь `--full --compare data-preparation/reports/optimization/optimization-baseline.json`
  для проверки совпадения
  входных данных и результатов с исходным замером. Время не является порогом CI.
  Методика и фактические результаты — в
  [отчёте оптимизации](../data-preparation/reports/optimization/README.md).
- Браузерный замер `ItemsPage`: на работающем `dev:agent` открыть
  `http://localhost:5174/src/test/items-page-benchmark.html` и нажать
  «Запустить замер». Страница использует отдельный каталог в памяти и отключает
  его запись; не заменяет сохранённый каталог. Сравнение операций по ID:
  `node scripts/measure-row-indexes.mjs`.
- Кнопка «Замерить раскрытие дерева» на том же стенде сравнивает 100/1000 корней,
  реагенты/избранное с одинаковым составом, глубокие и широкие ветки. После
  прогрева выполняются 20 переключений с наблюдением RAF в течение 250 мс:
  отдельно сохраняются время синтетических Pointer Events + click, задержка
  первого RAF-кадра и ещё 250 мс интервалов после него. Восемь соседних деревьев
  уже раскрыты; начальное появление списка исключено. Стенд использует встроенную
  корректную иконку, исключая ошибки заглушки и сетевую загрузку из измерений.
  React render измеряется только в dev; production возвращает для него `null`.
  `node scripts/measure-tree-builds.mjs <git-ref>` собирает исходный и текущий
  production-варианты с одинаковым стендом, не заменяя рабочие исходники.
  Адреса на `5174` и SHA-256 исходников записываются в `dist/tree-builds.json`.
  Эти тестовые пакеты исключены из обычной сборки и удаляются следующей
  `npm run build`. Реальные клики проверяют отдельно; RAF — приближение
  плавности, а не непосредственная запись Layout/Paint или экранного FPS.
- Поиск и память индексов:
  `node --expose-gc scripts/measure-search.mjs --full --compare data-preparation/reports/optimization/optimization-search-before-4.json --output путь-к-новому-отчёту.json`.
  `--full` у обоих скриптов читает полные артефакты из `releases`, чтобы повторять
  замеры этапов 1–4 после переноса файлов. Сравнение проверяет содержимое и результаты,
  допуская смену пути файла. Без флага читается текущая браузерная проекция.
  Парное сравнение полного и компактного файла, gzip/Brotli, разбора, валидации
  и индексации: `node scripts/measure-reference-payloads.mjs --output путь-к-отчёту.json`.
  Сценарий проверяет входы и порядок результатов на трёх базах; `--expose-gc`
  позволяет оценить удерживаемый объём индекса, без него поле памяти равно `null`.
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
  данных. Это компактные проекции runtime-схемы; полные артефакты для подготовки
  и проверок лежат в `data-preparation/releases/<version>` и не попадают на сайт.
  Происхождение и пересборка описаны в [документации баз](versioned-databases.md).
- Старый `public/data/craftcalc-db.1.60.1.70338.json` нужен скриптам сравнения
  и тестам. Отсутствие импорта в приложении не делает его ненужным.
- Настройки TSM хранятся независимо в `tbcPricing` и `classicPricing`;
  `selectActivePricing` выбирает настройки активной версии.
- Кэш TSM хранится отдельно в `sessionStorage` и не входит в JSON backup.
  Снимки сайта готовятся Python-скриптами; браузер читает опубликованные JSON.
- Индикатор localStorage использует общий снимок в `src/app/useLocalStorageUsage.ts`,
  без таймера. После успешной записи/удаления вызывай `notifyLocalStorageChanged`
  из `src/store/local-storage-events.ts`; массовое удаление уведомляет один раз.
  `storage` и `focus` обновляют оценку сторонних записей. SessionStorage не учитывается.
- Несохранённые формы регистрируются в [draft-guard.ts](../src/app/draft-guard.ts).
  Асинхронные изменения проверяют версию и `workspaceRevision`, чтобы ответ
  старого запроса не изменил другой каталог.
