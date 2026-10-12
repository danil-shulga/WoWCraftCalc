import './FormError.css'

interface FormErrorProps {
  message: string | null
  announce?: boolean
}

export function FormError({ message, announce = true }: FormErrorProps) {
  return message === null ? null : (
    <p className="form-error" role={announce ? 'alert' : undefined}>
      {message}
    </p>
  )
}
