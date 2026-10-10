import { useId } from 'react'

import './SearchField.css'

interface SearchFieldProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function SearchField({
  value,
  placeholder = 'Поиск по названию',
  onChange,
}: SearchFieldProps) {
  const inputId = useId()

  return (
    <div className="search-field">
      <label className="visually-hidden" htmlFor={inputId}>
        Поиск по названию предмета
      </label>
      <span className="search-field__icon" aria-hidden="true">
        ⌕
      </span>
      <input
        id={inputId}
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )
}
