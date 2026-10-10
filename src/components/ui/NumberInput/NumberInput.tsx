import { useEffect, useRef, useState } from 'react'

import './NumberInput.css'

interface NumberInputProps {
  value: number
  min?: number
  max?: number
  step?: number
  id?: string
  ariaLabel?: string
  disabled?: boolean
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
  disabled = false,
  onChange,
}: NumberInputProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const changeBy = (direction: -1 | 1) => {
    setDraftValue(null)
    onChange(clamp(value + step * direction, min, max))
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
      onChange(clamp(value + step * (event.deltaY < 0 ? 1 : -1), min, max))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [disabled, max, min, onChange, step, value])

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
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode="numeric"
        disabled={disabled}
        value={draftValue ?? value}
        onFocus={() => {
          if (value === 0) {
            setDraftValue('')
          }
        }}
        onChange={(event) => {
          setDraftValue(event.currentTarget.value)

          const nextValue = event.currentTarget.valueAsNumber

          if (Number.isFinite(nextValue)) {
            onChange(clamp(nextValue, min, max))
          }
        }}
        onBlur={() => {
          if (draftValue === '') {
            const fallbackValue = clamp(0, min, max)
            onChange(fallbackValue)
          }

          setDraftValue(null)
        }}
      />
      <span className="number-input__controls">
        <button
          type="button"
          aria-label="Увеличить значение"
          disabled={disabled || (max !== undefined && value >= max)}
          onClick={() => {
            changeBy(1)
          }}
        >
          ▲
        </button>
        <button
          type="button"
          aria-label="Уменьшить значение"
          disabled={disabled || (min !== undefined && value <= min)}
          onClick={() => {
            changeBy(-1)
          }}
        >
          ▼
        </button>
      </span>
    </div>
  )
}
