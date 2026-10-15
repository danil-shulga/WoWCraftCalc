import { Button } from '../Button/Button'
import { useEffect, useRef, useState } from 'react'

import './NumberInput.css'

interface NumberInputProps {
  value: number
  min?: number
  max?: number
  step?: number
  id?: string
  ariaLabel?: string
  ariaDescribedBy?: string
  autoFocus?: boolean
  disabled?: boolean
  isValidValue?: (value: number) => boolean
  onChange: (value: number) => void
}

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, value),
  )
}

export function NumberInput({
  value,
  min,
  max,
  step = 1,
  id,
  ariaLabel,
  ariaDescribedBy,
  autoFocus = false,
  disabled = false,
  isValidValue,
  onChange,
}: NumberInputProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const changeBy = (direction: -1 | 1) => {
    setDraftValue(null)
    const next = clamp(value + step * direction, min, max)
    if (!isValidValue || isValidValue(next)) onChange(next)
  }

  useEffect(() => {
    const container = containerRef.current

    if (container === null) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      if (disabled || event.deltaY === 0) {
        return
      }

      event.preventDefault()
      inputRef.current?.focus()
      setDraftValue(null)
      const next = clamp(value + step * (event.deltaY < 0 ? 1 : -1), min, max)
      if (!isValidValue || isValidValue(next)) onChange(next)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [disabled, max, min, onChange, step, value, isValidValue])

  return (
    <div
      ref={containerRef}
      className="number-input"
      data-disabled={disabled || undefined}
    >
      <input
        ref={inputRef}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        autoFocus={autoFocus}
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode="numeric"
        disabled={disabled}
        value={draftValue ?? value}
        onKeyDown={(event) => {
          if (
            isValidValue &&
            !disabled &&
            (event.key === 'ArrowUp' || event.key === 'ArrowDown')
          ) {
            event.preventDefault()
            changeBy(event.key === 'ArrowUp' ? 1 : -1)
          }
        }}
        onFocus={() => {
          if (value === 0) {
            setDraftValue('')
          }
        }}
        onChange={(event) => {
          setDraftValue(event.currentTarget.value)

          const nextValue = event.currentTarget.valueAsNumber

          if (Number.isFinite(nextValue) && (!isValidValue || isValidValue(nextValue))) {
            onChange(clamp(nextValue, min, max))
          }
        }}
        onBlur={() => {
          if (draftValue === '' && !isValidValue) {
            const fallbackValue = clamp(0, min, max)
            onChange(fallbackValue)
          }

          setDraftValue(null)
        }}
      />
      <span className="number-input__controls">
        <Button
          variant="plain"
          type="button"
          aria-label="Увеличить значение"
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={() => {
            changeBy(1)
          }}
        >
          ▲
        </Button>
        <Button
          variant="plain"
          type="button"
          aria-label="Уменьшить значение"
          disabled={disabled || (min !== undefined && value <= min)}
          onClick={() => {
            changeBy(-1)
          }}
        >
          ▼
        </Button>
      </span>
    </div>
  )
}
