import { useEffect, useRef } from 'react'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const changeBy = (direction: -1 | 1) => {
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
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.valueAsNumber
          onChange(clamp(Number.isFinite(nextValue) ? nextValue : (min ?? 0), min, max))
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
