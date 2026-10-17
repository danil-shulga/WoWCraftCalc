import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button/Button'
import { Checkbox } from '../../components/ui/Checkbox/Checkbox'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import { FormError } from '../../components/ui/FormError/FormError'
import { TSM_METRIC_LABELS, TSM_REALMS } from '../../domain/tsm'
import type { TsmMarket, TsmSettings } from '../../domain/tsm'
import { useTsmStore } from './tsm-client'
import './TsmSettingsSection.css'
import '../EditorForm.css'

export interface TsmSettingsSectionProps {
  settings: TsmSettings
  onChange: (settings: TsmSettings) => void
  onCheck: () => void
}
export function TsmSettingsSection({
  settings,
  onChange,
  onCheck,
}: TsmSettingsSectionProps) {
  const state = useTsmStore()
  const [region, setRegion] = useState<TsmMarket['region']>(
    settings.market?.region ?? 'eu',
  )
  const [faction, setFaction] = useState<TsmMarket['faction']>(
    settings.market?.faction ?? 'alliance',
  )
  const selectedRegion = settings.market?.region ?? region
  const selectedFaction = settings.market?.faction ?? faction
  const snapshot = state.snapshot
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 60000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  const stale = snapshot && now - Date.parse(snapshot.scannedAt) > 6 * 60 * 60 * 1000
  return (
    <fieldset className="user-settings__section tsm-settings">
      <legend>Цены аукциона · TSM</legend>
      <p>
        Выберите рынок TBC Anniversary. Один показатель используется для покупки и
        продажи.
      </p>
      <div className="tsm-settings__market editor-fields">
        <SearchableSelect
          label="Регион TSM"
          searchable={false}
          options={[
            { value: 'eu', label: 'Европа' },
            { value: 'us', label: 'Северная Америка' },
          ]}
          value={selectedRegion}
          onChange={(value) => {
            const next = value === 'us' ? 'us' : 'eu'
            setRegion(next)
            onChange({ ...settings, market: null })
          }}
        />
        <SearchableSelect
          key={selectedRegion}
          label="Игровой мир TSM"
          options={TSM_REALMS.filter((realm) => realm.region === selectedRegion).map(
            (realm) => ({
              value: realm.realm,
              label: realm.name,
            }),
          )}
          value={settings.market?.realm ?? ''}
          placeholder="Выберите игровой мир…"
          onChange={(realm) => {
            onChange({
              ...settings,
              market: realm
                ? { region: selectedRegion, realm, faction: selectedFaction }
                : null,
            })
          }}
        />
        <SearchableSelect
          label="Фракция TSM"
          searchable={false}
          options={[
            { value: 'alliance', label: 'Альянс' },
            { value: 'horde', label: 'Орда' },
          ]}
          value={selectedFaction}
          onChange={(value) => {
            const next = value === 'horde' ? 'horde' : 'alliance'
            setFaction(next)
            onChange({
              ...settings,
              market: settings.market ? { ...settings.market, faction: next } : null,
            })
          }}
        />
      </div>
      <fieldset className="tsm-settings__metric">
        <legend>Цена TSM для расчётов</legend>
        {(['recent', 'marketValue'] as const).map((metric) => (
          <Checkbox
            key={metric}
            controlType="radio"
            name="tsm-metric"
            label={TSM_METRIC_LABELS[metric]}
            checked={settings.metric === metric}
            onChange={(checked) => {
              if (checked) onChange({ ...settings, metric })
            }}
          />
        ))}
      </fieldset>
      <div className="tsm-settings__status" role="status">
        {!settings.market
          ? 'Выберите игровой мир для загрузки цен.'
          : state.status === 'loading'
            ? 'Проверяем обновление…'
            : state.status === 'unavailable'
              ? 'Для этого рынка нет опубликованного снимка.'
              : state.status === 'idle'
                ? 'Снимок ещё не загружен.'
                : state.status === 'ready'
                  ? 'Последний опубликованный снимок загружен.'
                  : 'Не удалось проверить обновление.'}
        {snapshot ? (
          <span>
            Снимок TSM:{' '}
            <time dateTime={snapshot.scannedAt}>
              {new Date(snapshot.scannedAt).toLocaleString('ru-RU')}
            </time>
            {stale ? ' · устарел (старше 6 часов)' : ''}
          </span>
        ) : null}
        {snapshot && state.status !== 'ready' ? (
          <span>Используется последний успешный снимок этого рынка.</span>
        ) : null}
      </div>
      <FormError message={state.error ?? state.cacheError} />
      <Button
        variant="secondary"
        disabled={!settings.market || state.status === 'loading'}
        onClick={onCheck}
      >
        Проверить обновление
      </Button>
    </fieldset>
  )
}
