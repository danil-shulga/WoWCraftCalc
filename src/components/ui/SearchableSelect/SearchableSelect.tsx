import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { normalizeItemName } from '../../../domain/item-names'

import './SearchableSelect.css'

export interface SearchableSelectOption {
  value: string
  label: string
  secondaryLabel?: string | null
  searchNames?: readonly string[]
}

interface SearchableSelectProps {
  label: string
  options: readonly SearchableSelectOption[]
  value: string
  placeholder?: string
  emptyMessage?: string
  hideLabel?: boolean
  disabled?: boolean
  onChange: (value: string) => void
}

interface ListPosition extends CSSProperties {
  left: number
  width: number
  maxHeight: number
}

export function SearchableSelect({
  label,
  options,
  value,
  placeholder = 'Начните вводить название…',
  emptyMessage = 'Ничего не найдено',
  hideLabel = false,
  disabled = false,
  onChange,
}: SearchableSelectProps) {
  const listboxId = useId()
  const selectedOption = options.find((option) => option.value === value)
  const [inputValue, setInputValue] = useState(selectedOption?.label ?? '')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [listPosition, setListPosition] = useState<ListPosition | null>(null)
  const controlRef = useRef<HTMLDivElement>(null)
  const isClearingSelectionByTyping = useRef(false)

  useEffect(() => {
    if (isClearingSelectionByTyping.current) {
      isClearingSelectionByTyping.current = false
      return
    }

    setInputValue(selectedOption?.label ?? '')
  }, [selectedOption?.label])

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    const updateListPosition = () => {
      const control = controlRef.current

      if (control === null) {
        return
      }

      const viewportPadding = 8
      const gap = 2
      const maximumHeight = 280
      const minimumUsefulHeight = 160
      const controlRect = control.getBoundingClientRect()
      const availableBelow =
        window.innerHeight - controlRect.bottom - gap - viewportPadding
      const availableAbove = controlRect.top - gap - viewportPadding
      const shouldOpenAbove =
        availableBelow < minimumUsefulHeight && availableAbove > availableBelow
      const availableHeight = shouldOpenAbove ? availableAbove : availableBelow
      const width = Math.min(controlRect.width, window.innerWidth - viewportPadding * 2)
      const left = Math.min(
        Math.max(controlRect.left, viewportPadding),
        window.innerWidth - width - viewportPadding,
      )

      setListPosition({
        left,
        width,
        maxHeight: Math.max(40, Math.min(maximumHeight, availableHeight)),
        ...(shouldOpenAbove
          ? { bottom: window.innerHeight - controlRect.top + gap }
          : { top: controlRect.bottom + gap }),
      })
    }

    updateListPosition()
    window.addEventListener('resize', updateListPosition)
    window.addEventListener('scroll', updateListPosition, true)

    return () => {
      window.removeEventListener('resize', updateListPosition)
      window.removeEventListener('scroll', updateListPosition, true)
    }
  }, [isOpen])

  const filteredOptions = useMemo(() => {
    const isSelectedLabel = inputValue === selectedOption?.label
    const normalizedQuery = isSelectedLabel ? '' : normalizeItemName(inputValue)

    if (normalizedQuery.length === 0) {
      return options
    }

    return options.filter((option) =>
      [option.label, ...(option.searchNames ?? [])].some((name) =>
        normalizeItemName(name).includes(normalizedQuery),
      ),
    )
  }, [inputValue, options, selectedOption])

  const selectOption = (option: SearchableSelectOption) => {
    setInputValue(option.label)
    setIsOpen(false)
    onChange(option.value)
  }

  const moveHighlight = (direction: 1 | -1) => {
    if (filteredOptions.length === 0) {
      return
    }

    setHighlightedIndex((currentIndex) => {
      const nextIndex = currentIndex + direction

      if (nextIndex < 0) {
        return filteredOptions.length - 1
      }

      return nextIndex % filteredOptions.length
    })
  }

  return (
    <div
      className="searchable-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false)
        }
      }}
    >
      <label
        className={hideLabel ? 'searchable-select__label--hidden' : undefined}
        htmlFor={`${listboxId}-input`}
      >
        {label}
      </label>
      <div ref={controlRef} className="searchable-select__control">
        <input
          id={`${listboxId}-input`}
          role="combobox"
          type="text"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          disabled={disabled}
          aria-expanded={isOpen && !disabled}
          aria-activedescendant={
            isOpen && !disabled && filteredOptions[highlightedIndex] !== undefined
              ? `${listboxId}-option-${String(highlightedIndex)}`
              : undefined
          }
          placeholder={placeholder}
          value={inputValue}
          onFocus={(event) => {
            event.currentTarget.select()
            setHighlightedIndex(0)
            setIsOpen(true)
          }}
          onChange={(event) => {
            setInputValue(event.target.value)
            setHighlightedIndex(0)
            setIsOpen(true)

            if (value.length > 0) {
              isClearingSelectionByTyping.current = true
              onChange('')
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIsOpen(true)
              moveHighlight(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIsOpen(true)
              moveHighlight(-1)
            } else if (event.key === 'Enter' && isOpen) {
              const highlightedOption = filteredOptions[highlightedIndex]

              if (highlightedOption !== undefined) {
                event.preventDefault()
                selectOption(highlightedOption)
              }
            } else if (event.key === 'Escape') {
              if (isOpen) {
                event.preventDefault()
                event.stopPropagation()
              }
              setIsOpen(false)
            }
          }}
        />
        <span className="searchable-select__indicator" aria-hidden="true">
          ▾
        </span>
      </div>

      {selectedOption?.secondaryLabel && inputValue === selectedOption.label ? (
        <small className="searchable-select__secondary">
          {selectedOption.secondaryLabel}
        </small>
      ) : null}

      {isOpen && !disabled && listPosition !== null
        ? createPortal(
            <ul
              id={listboxId}
              className="searchable-select__list"
              role="listbox"
              style={listPosition}
            >
              {filteredOptions.length === 0 ? (
                <li className="searchable-select__empty">{emptyMessage}</li>
              ) : (
                filteredOptions.map((option, index) => (
                  <li
                    id={`${listboxId}-option-${String(index)}`}
                    className="searchable-select__option"
                    key={option.value}
                    role="option"
                    aria-label={option.label}
                    aria-selected={option.value === value}
                    data-highlighted={index === highlightedIndex}
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onMouseEnter={() => {
                      setHighlightedIndex(index)
                    }}
                    onClick={() => {
                      selectOption(option)
                    }}
                  >
                    {option.label}
                    {option.secondaryLabel ? (
                      <small className="searchable-select__secondary">
                        {option.secondaryLabel}
                      </small>
                    ) : null}
                  </li>
                ))
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
