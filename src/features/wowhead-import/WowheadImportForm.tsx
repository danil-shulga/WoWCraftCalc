import { findImportedItem } from '../../domain/imported-item-matching'
import type { RecipeImportData } from '../../domain/recipe-import.types'
import { ItemQuantityList } from '../../components/ui/ItemQuantityList/ItemQuantityList'
import { FormError } from '../../components/ui/FormError/FormError'
import { Button } from '../../components/ui/Button/Button'
import { useDraftGuard } from '../../app/draft-guard'
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react'

import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { ItemIdentity } from '../../components/ui/ItemIdentity/ItemIdentity'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import type { Item, ItemCatalog } from '../../domain/item.types'
import type { ItemLanguage } from '../../domain/user-settings'
import { GAME_VERSION_REGISTRY, professionOptionsFor } from '../../domain/game-version'
import type { GameVersion } from '../../domain/game-version'
import type { RecipeImportResult } from '../../store/useCraftStore'
import '../EditorForm.css'
import { fetchWowheadRecipe, type WowheadRecipeImport } from './wowhead-import'
import './WowheadImportForm.css'

interface WowheadImportFormProps {
  gameVersion?: GameVersion
  catalog: ItemCatalog
  itemLanguage?: ItemLanguage
  onImport: (data: RecipeImportData) => RecipeImportResult
  onSuccess: (message: string) => void
  onClose: () => void
  isActive?: boolean
  targetItem?: Item
}

function getSuccessMessage(
  result: Extract<RecipeImportResult, { success: true }>,
): string {
  const action = result.productCreated ? 'создан' : 'обновлён'
  const reagentMessage =
    result.reagentsCreated === 0
      ? 'Новые реагенты не потребовались.'
      : `Добавлено реагентов: ${result.reagentsCreated.toString()}.`
  return `Крафт ${action}. ${reagentMessage}`
}

interface RecipeReviewProps extends WowheadImportFormProps {
  recipe: WowheadRecipeImport
}

function RecipeReview({
  recipe,
  gameVersion = 'forever',
  catalog,
  itemLanguage = 'ru',
  onImport,
  onClose,
  onSuccess,
  isActive = true,
  targetItem,
}: RecipeReviewProps) {
  const PROFESSION_OPTIONS = professionOptionsFor(gameVersion)
  const outputId = useId()
  const [savedRecipe] = useState(() =>
    targetItem === undefined
      ? (findImportedItem(catalog, recipe.product)?.recipe ?? null)
      : targetItem.recipe,
  )
  const [outputQuantity, setOutputQuantity] = useState(
    () => savedRecipe?.outputQuantity ?? recipe.outputQuantity ?? 1,
  )
  const [profession, setProfession] = useState(() =>
    savedRecipe === null ? '' : (savedRecipe.profession ?? 'none'),
  )
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    setError(null)
    const selectedProfession = PROFESSION_OPTIONS.find(
      (option) => option.value === profession,
    )
    if (!Number.isSafeInteger(outputQuantity) || outputQuantity < 1) {
      setError('Укажите положительное целое количество предметов за один крафт')
      return
    }
    if (profession !== 'none' && selectedProfession === undefined) {
      setError('Выберите профессию или явно укажите «Без профессии»')
      return
    }
    const result = onImport({
      product: recipe.product,
      reagents: recipe.reagents,
      outputQuantity,
      profession: selectedProfession?.value ?? null,
    })
    if (!result.success) {
      setError(result.error)
      return
    }
    onSuccess(getSuccessMessage(result))
  }

  return (
    <form className="editor-form wowhead-import" noValidate onSubmit={handleConfirm}>
      <section className="wowhead-import__review" aria-label="Проверка рецепта">
        <ItemIdentity
          className="wowhead-import__product"
          item={{
            ...recipe.product,
            iconUrl:
              recipe.product.iconUrl ||
              (findImportedItem(catalog, recipe.product)?.iconUrl ?? ''),
          }}
          language={itemLanguage}
          iconSize="medium"
          nameAs="h3"
        />
        <ItemQuantityList
          label="Реагенты"
          language={itemLanguage}
          items={recipe.reagents.map((reagent, index) => ({
            key: `${reagent.wowheadItemId.toString()}-${index.toString()}`,
            quantity: reagent.quantity,
            item: {
              ...reagent,
              iconUrl:
                reagent.iconUrl || (findImportedItem(catalog, reagent)?.iconUrl ?? ''),
            },
          }))}
        />
      </section>
      <div className="wowhead-import__parameters">
        <div className="wowhead-import__output">
          <label htmlFor={outputId}>
            <span>Предметов за один крафт</span>
          </label>
          <NumberInput
            id={outputId}
            autoFocus={isActive}
            min={1}
            step={1}
            value={outputQuantity}
            onChange={setOutputQuantity}
          />
        </div>
        <div className="wowhead-import__profession">
          <SearchableSelect
            label="Профессия"
            value={profession}
            options={[{ value: 'none', label: 'Без профессии' }, ...PROFESSION_OPTIONS]}
            placeholder="Выберите профессию…"
            onChange={(value) => {
              setProfession(value)
            }}
          />
        </div>
      </div>
      <small>Цены, вложенные рецепты и ручной выбор покупки/крафта сохранятся.</small>
      <FormError message={error} />
      <footer className="editor-form__actions">
        <Button variant="secondary" type="button" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="primary" type="submit">
          Подтвердить импорт
        </Button>
      </footer>
    </form>
  )
}

function WowheadImportFormForVersion({
  gameVersion = 'forever',
  catalog,
  itemLanguage = 'ru',
  onImport,
  onSuccess,
  onClose,
  isActive = true,
  targetItem,
}: WowheadImportFormProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<WowheadRecipeImport | null>(null)
  const active = useRef(true)
  useDraftGuard(url.trim() !== '' || recipe !== null)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const close = () => {
    active.current = false
    onClose()
  }

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const fetchedRecipe = await fetchWowheadRecipe(
        url,
        GAME_VERSION_REGISTRY[gameVersion].wowheadVersion,
      )
      if (active.current) setRecipe(fetchedRecipe)
    } catch (caughtError) {
      if (active.current)
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Не удалось загрузить рецепт',
        )
    } finally {
      if (active.current) setIsLoading(false)
    }
  }

  return (
    <>
      {recipe !== null ? (
        <RecipeReview
          gameVersion={gameVersion}
          recipe={recipe}
          catalog={catalog}
          itemLanguage={itemLanguage}
          onImport={onImport}
          onClose={close}
          onSuccess={(message) => {
            onSuccess(message)
            close()
          }}
          isActive={isActive}
          {...(targetItem === undefined ? {} : { targetItem })}
        />
      ) : (
        <form
          className="editor-form wowhead-import"
          onSubmit={(event) => {
            void handleSubmit(event)
          }}
        >
          <label>
            <span>Ссылка на рецепт Wowhead Classic, TBC или Forever</span>
            <input
              autoFocus={isActive}
              required
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://www.wowhead.com/classic/ru/spell=…"
              value={url}
              disabled={isLoading}
              onChange={(event) => {
                setUrl(event.target.value)
              }}
            />
          </label>
          <small>
            Загрузим названия RU и EN и рецепт для проверки состава, выхода и профессии.
            Каталог изменится после подтверждения.
          </small>
          <FormError message={error} />
          <footer className="editor-form__actions">
            <Button variant="secondary" type="button" onClick={close}>
              Отмена
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Загрузка…' : 'Загрузить рецепт'}
            </Button>
          </footer>
        </form>
      )}
    </>
  )
}

export function WowheadImportForm(props: WowheadImportFormProps) {
  return <WowheadImportFormForVersion key={props.gameVersion ?? 'forever'} {...props} />
}
