import { useMemo, useState } from 'react'
import { Tabs } from '../components/ui/Tabs/Tabs'
import { SearchField } from '../components/ui/SearchField/SearchField'
import { useCraftStore } from '../store/useCraftStore'
import { selectActiveItems, selectActiveProfessions } from '../store/craft.selectors'
import {
  createProfitabilitySnapshot,
  calculateProfitability,
  PROFITABILITY_FEE_PERCENT,
  type ProfitabilityMode,
} from '../domain/profitability'
import { getItemName, getItemSearchNames, normalizeItemName } from '../domain/item-names'
import { TSM_REALMS } from '../domain/tsm'
import { PriceModeSelector } from '../features/tsm/PriceModeSelector'
import { usePriceContext } from '../features/tsm/tsm-client'
import { ProfitableList } from '../features/profitable/ProfitableList'
import {
  PROFITABILITY_TABS,
  type ProfitabilitySort,
} from '../features/profitable/profitability-presentation'
import './PageLayout.css'
import './ProfitablePage.css'

export function ProfitablePage() {
  const items = useCraftStore(selectActiveItems)
  const professions = useCraftStore(selectActiveProfessions)
  const language = useCraftStore((state) => state.itemLanguage)
  const setPricing = useCraftStore((state) => state.setPricing)
  const prices = usePriceContext()
  const [mode, setMode] = useState<ProfitabilityMode>('craft')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProfitabilitySort>({
    key: 'gain',
    direction: 'descending',
  })
  const [openedAt] = useState(() => Date.now())
  const owned = useMemo(() => new Set(professions), [professions])
  const snapshot = useMemo(
    () => createProfitabilitySnapshot(items, mode, owned, prices),
    [items, mode, owned, prices],
  )
  const results = useMemo(() => snapshot.map(calculateProfitability), [snapshot])
  const searchNames = useMemo(
    () =>
      new Map(
        Object.values(items).map((item) => [
          item.id,
          getItemSearchNames(item).map(normalizeItemName),
        ]),
      ),
    [items],
  )
  const normalizedQuery = useMemo(() => normalizeItemName(query), [query])
  const rows = useMemo(
    () =>
      results
        .filter((row) =>
          searchNames.get(row.itemId)?.some((name) => name.includes(normalizedQuery)),
        )
        .flatMap((result) => {
          const item = items[result.itemId]
          return item ? [{ item, result }] : []
        })
        .sort((a, b) => {
          const nameOrder = getItemName(a.item, language).localeCompare(
            getItemName(b.item, language),
            language,
          )
          const direction = sort.direction === 'ascending' ? 1 : -1
          let diff: number
          if (sort.key === 'name') diff = nameOrder * direction
          else {
            const left = a.result[sort.key]
            const right = b.result[sort.key]
            // Неизвестная доходность остаётся в конце при обоих направлениях.
            if (left === null && right !== null) return 1
            if (right === null && left !== null) return -1
            diff = left === null || right === null ? 0 : (left - right) * direction
          }
          return diff || nameOrder || a.item.id.localeCompare(b.item.id)
        }),
    [results, searchNames, normalizedQuery, items, sort, language],
  )
  const issues = results.filter((row) => row.issue)
  const unavailable = prices.version === 'forever' && mode !== 'craft'
  const market = prices.settings.market
  const realm = TSM_REALMS.find(
    (entry) =>
      entry.version === prices.version &&
      entry.region === market?.region &&
      entry.realm === market.realm,
  )
  return (
    <section className="page profitable-page">
      <header className="page__header">
        <div>
          <h1>Выгодные</h1>
          <p>Возможности среди добавленных предметов</p>
        </div>
      </header>
      <Tabs tabs={PROFITABILITY_TABS} value={mode} onChange={setMode} />
      <div className="profitable-page__search">
        <SearchField value={query} onChange={setQuery} />
      </div>
      {unavailable ? (
        <p className="profitable-page__notice">
          {mode === 'disenchant'
            ? 'Для Forever нет подтверждённой таблицы распыления.'
            : 'Для Forever сравнение рынка TSM недоступно.'}
        </p>
      ) : null}
      <div className="profitable-page__meta">
        <span role="status">
          Показано: {rows.length} из {snapshot.length} предметов
        </span>
        <span>За 1 предмет · комиссия {PROFITABILITY_FEE_PERCENT}%</span>
      </div>
      {!Object.keys(items).length ? (
        <div className="empty-state">
          <strong>Каталог пока пуст</strong>
          <p>Добавьте предметы в разделе «Крафты» или «Реагенты».</p>
        </div>
      ) : !snapshot.length ? (
        <div className="empty-state">
          <strong>Нет предметов для этого режима</strong>
          <p>
            {mode === 'craft'
              ? 'Добавьте рецепт к существующему предмету.'
              : 'Отметьте существующую экипировку для распыления.'}
          </p>
        </div>
      ) : !rows.length ? (
        <p className="profitable-page__notice">Нет предметов по поиску.</p>
      ) : null}
      <ProfitableList
        rows={rows}
        mode={mode}
        language={language}
        sort={sort}
        onSort={(key) => {
          setSort((current) => ({
            key,
            direction:
              current.key === key
                ? current.direction === 'ascending'
                  ? 'descending'
                  : 'ascending'
                : key === 'name'
                  ? 'ascending'
                  : 'descending',
          }))
        }}
      />
      {issues.length ? (
        <details className="profitable-page__issues">
          <summary>Не удалось оценить: {issues.length}</summary>
          <ul>
            {issues.map((row) => (
              <li key={row.itemId}>
                {getItemName(items[row.itemId] ?? { name: row.itemId }, language)}:{' '}
                {row.issue}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {mode === 'craft' || mode === 'disenchant' ? (
        <PriceModeSelector
          gameVersion={prices.version}
          settings={prices.settings}
          onChange={setPricing}
        />
      ) : null}
      <footer className="profitable-page__footer">
        {market ? (
          <span>
            {realm?.name ?? market.realm} ·{' '}
            {market.faction === 'alliance' ? 'Альянс' : 'Орда'} · TSM
          </span>
        ) : (
          <span>Рынок TSM не выбран</span>
        )}
        {prices.snapshot ? (
          <span>
            {prices.snapshot.scannedAt === null ? (
              'Время снимка неизвестно; свежесть цен не подтверждена'
            ) : (
              <>
                Снимок:{' '}
                <time dateTime={prices.snapshot.scannedAt}>
                  {new Date(prices.snapshot.scannedAt).toLocaleString('ru-RU')}
                </time>
                {openedAt - Date.parse(prices.snapshot.scannedAt) > 6 * 60 * 60 * 1000
                  ? ' · устарел (старше 6 часов)'
                  : ''}
              </>
            )}
          </span>
        ) : null}
        <span>
          {mode === 'buy' || mode === 'sell'
            ? 'Текущая оценка TSM не подтверждает наличие лота по этой цене.'
            : 'Оценка по используемым ценам. Комиссия применяется только в этом разделе.'}
        </span>
      </footer>
    </section>
  )
}
