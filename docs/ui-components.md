# Краткая карта UI

Перед правкой найди подходящую реализацию здесь, прочитай её код, props,
использования и ближайшие тесты. Затем открой только относящиеся к задаче разделы
[подробного описания](ui-features.md). Общие требования — в [AGENTS.md](../AGENTS.md).

## Общие контролы

Путь: `src/components/ui/<Name>/<Name>.tsx`, CSS рядом.

- `Button`, `IconButton` — обычные кнопки и кнопки с иконкой.
- `Modal`, `ConfirmDialog` — диалоги, подтверждение, фокус и Escape.
- `Toast`, `Tooltip`, `FormError` — уведомления, подсказки и ошибки.
- `Tabs`, `Checkbox` — вкладки и флажки/радиокнопки.
- `NumberInput` — количество; `SearchField` — поиск;
  `SearchableSelect` — выбор с поиском, клавиатурой и порталом.
- `MoneyInput`, `InlineMoneyInput` — денежный ввод в форме и строке;
  `MoneyDisplay`, `CurrencyIcon` — суммы и монеты. Сохраняй различие `null` и нуля.
- `ItemIdentity` — иконка и названия; `ItemIcon`, `ItemName` — составные части.
  `ItemQuantityList` — предметы с количеством в предпросмотрах импорта.
- `AcquisitionMethodPicker` — авто/покупка/крафт;
  `GameVersionPicker` — версия игры.

Props и особенности: [общие контролы](ui-features.md#общие-контролы-srccomponentsui),
[кнопки](ui-features.md#кнопки-и-варианты-общих-элементов),
[иконка и название](ui-features.md#иконка-и-название-предмета).

## Дерево и навигация

Путь дерева: `src/components/item-tree/<Name>/<Name>.tsx`.

- `ItemTree` — рекурсия, раскрытие по пути, анимации и защита от циклов.
- `ItemTreeRow` — общая оболочка строки с клавиатурным управлением.
- `RootItemRow` — корневая строка: цены, прибыль, действия и план.
- `RootItemRow/ItemPriceCell.tsx` — ячейка покупки/продажи и ручной ввод.
- `ReagentItemRow` — вложенный реагент и способ получения.
- `src/components/navigation/Sidebar/Sidebar.tsx` — меню, версия и объём хранилища.

Подробности: [дерево и навигация](ui-features.md#дерево-и-навигация-srccomponents).

## Сценарии

Путь: `src/features/<feature>`.

- `item-editor`: `ItemDescriptionFields`, `ItemPriceField`, `ItemForm`,
  `useItemDescriptionDraft` — описание и цены; `useBulkPriceDraft` — черновики
  массовых цен и защита несохранённых изменений; `ItemSourceForm` — источник;
  `ItemAddModal`, `ItemEditModal` — добавление и объединённое редактирование.
- `recipe-editor/RecipeEditor.tsx` — ручной состав рецепта и анимации реагентов.
- `reference-database`: `ReferenceDatabaseForm` — загрузка базы;
  `ReferenceBrowser` — поиск и выбор предмета/рецепта;
  `ReferenceReview` — предпросмотр и подтверждение.
- `wowhead-import`: `WowheadImportForm` — импорт рецепта;
  `ItemNamesLoader` — недостающие переводы.
- `planner`: `PlanQuantityControl` — тележка и количество;
  `ShoppingList`, `ShoppingListPanel` — покупки;
  `usePlanner` — единое подключение расчёта в App.
- `tsm`: `PriceModeSelector` — используемые цены;
  `TsmSettingsSection` — рынок, показатель и обновление снимка.
- `disenchanting`: `DisenchantEstimateDetails` — материалы и оценка;
  `disenchanting-presentation.ts` — подписи статусов.
- `user-settings/UserSettingsModal.tsx` — настройки;
  `data-transfer/DataTransferControls.tsx` — резервная копия и восстановление.

Подробности: [блоки сценариев](ui-features.md#блоки-сценариев-srcfeatures).

## Страницы и сборка

- `src/pages/ItemsPage.tsx` — общий каталог крафтов, реагентов, распыления
  и избранного, поиск, массовые цены и диалоги.
- `src/pages/useRootItemDrag.ts` — Pointer Events и автопрокрутка корневых деревьев.
- `src/pages/PlannerPage.tsx` — цели, производство, покупки и итоги.
- `src/pages/PlaceholderPage.tsx` — заглушка.
- `src/app/App.tsx` — сборка, разделы, настройки и переключение версии;
  `src/app/draft-guard.ts` — защита черновиков.
- `src/features/EditorForm.css`, `src/pages/PageLayout.css` — общие раскладки;
  `src/styles/global.css` — тема и токены.

Подробности: [страницы](ui-features.md#страницы-и-общие-стили),
[поведение, анимации, drag-and-drop и проверки](ui-features.md#поведение-стили-и-проверки).
