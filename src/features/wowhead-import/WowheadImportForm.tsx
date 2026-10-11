import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react'

import { NumberInput } from '../../components/ui/NumberInput/NumberInput'
import { SearchableSelect } from '../../components/ui/SearchableSelect/SearchableSelect'
import type { ItemCatalog } from '../../domain/item.types'
import { PROFESSION_OPTIONS } from '../../domain/professions'
import {
  findImportedItem,
  type RecipeImportData,
  type RecipeImportResult,
} from '../../store/useCraftStore'
import '../../components/ui/Button.css'
import '../EditorForm.css'
import { fetchWowheadRecipe, type WowheadRecipeImport } from './wowhead-import'
import './WowheadImportForm.css'

interface WowheadImportFormProps {
  catalog: ItemCatalog
  onImport: (data: RecipeImportData) => RecipeImportResult
  onSuccess: (message: string) => void
  onClose: () => void
  isActive?: boolean
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
  catalog,
  onImport,
  onClose,
  onSuccess,
  isActive = true,
}: RecipeReviewProps) {
  const outputId = useId()
  const [savedRecipe] = useState(
    () => findImportedItem(catalog, recipe.product)?.recipe ?? null,
  )
  const [outputQuantity, setOutputQuantity] = useState(
    () => savedRecipe?.outputQuantity ?? recipe.outputQuantity ?? 1,
  )
  const [profession, setProfession] = useState(() =>
    savedRecipe === null ? '' : (savedRecipe.profession ?? 'none'),
  )
  const [error, setError] = useState<string | null>(null)
  const savedProfession =
    PROFESSION_OPTIONS.find((option) => option.value === savedRecipe?.profession)
      ?.label ?? 'Без профессии'

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
        <h3>{recipe.product.name}</h3>
        <h4>Состав из Wowhead</h4>
        <ul>
          {recipe.reagents.map((reagent, index) => (
            <li key={`${reagent.wowheadItemId.toString()}-${index.toString()}`}>
              <span>{reagent.name}</span>
              <strong>× {reagent.quantity}</strong>
            </li>
          ))}
        </ul>
      </section>
      <div className="wowhead-import__output">
        <label htmlFor={outputId}>
          <span>Предметов за один крафт</span>
        </label>
        <NumberInput
          id={outputId}
          ariaDescribedBy={`${outputId}-hint`}
          autoFocus={isActive}
          min={1}
          step={1}
          value={outputQuantity}
          onChange={setOutputQuantity}
        />
        <small id={`${outputId}-hint`}>
          {recipe.outputQuantity === null
            ? 'Выход не распознан в Wowhead.'
            : `Выход из Wowhead: ${recipe.outputQuantity.toString()}.`}
          {savedRecipe === null
            ? recipe.outputQuantity === null
              ? ' По умолчанию: 1. При необходимости измените количество.'
              : ''
            : ` Сохранённое значение: ${savedRecipe.outputQuantity.toString()}.`}
        </small>
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
        <small>
          Профессия крафта не распознана в Wowhead.
          {savedRecipe === null
            ? ' Выберите её вручную или укажите «Без профессии».'
            : ` Сохранённое значение: ${savedProfession}.`}
        </small>
      </div>
      <small>Цены, вложенные рецепты и ручной выбор покупки/крафта сохранятся.</small>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="editor-form__actions">
        <button className="button button--secondary" type="button" onClick={onClose}>
          Отмена
        </button>
        <button className="button button--primary" type="submit">
          Подтвердить импорт
        </button>
      </footer>
    </form>
  )
}

export function WowheadImportForm({
  catalog,
  onImport,
  onSuccess,
  onClose,
  isActive = true,
}: WowheadImportFormProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<WowheadRecipeImport | null>(null)
  const active = useRef(true)

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
      const fetchedRecipe = await fetchWowheadRecipe(url)
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
          recipe={recipe}
          catalog={catalog}
          onImport={onImport}
          onClose={close}
          onSuccess={(message) => {
            onSuccess(message)
            close()
          }}
          isActive={isActive}
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
            Сначала загрузим рецепт для проверки состава, выхода и профессии. Каталог
            изменится после подтверждения.
          </small>
          {error === null ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="editor-form__actions">
            <button className="button button--secondary" type="button" onClick={close}>
              Отмена
            </button>
            <button className="button button--primary" type="submit" disabled={isLoading}>
              {isLoading ? 'Загрузка…' : 'Загрузить рецепт'}
            </button>
          </footer>
        </form>
      )}
    </>
  )
}
