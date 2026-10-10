import type { ReactNode } from 'react'

import './Checkbox.css'

interface CheckboxProps {
  label: ReactNode
  checked: boolean
  controlType?: 'checkbox' | 'radio'
  name?: string
  compact?: boolean
  disabled?: boolean
  hideLabel?: boolean
  className?: string
  title?: string
  onChange: (checked: boolean) => void
}

export function Checkbox({
  label,
  checked,
  controlType = 'checkbox',
  name,
  compact = false,
  disabled = false,
  hideLabel = false,
  className,
  title,
  onChange,
}: CheckboxProps) {
  const classes = ['checkbox', compact ? 'checkbox--compact' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes} title={title}>
      <input
        className="checkbox__input"
        type={controlType}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked)
        }}
      />
      <span className="checkbox__control" aria-hidden="true" />
      <span className={hideLabel ? 'visually-hidden' : undefined}>{label}</span>
    </label>
  )
}
