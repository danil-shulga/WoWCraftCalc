import type { ComponentPropsWithRef } from 'react'
import './Button.css'

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger-text' | 'plain'
}

export function Button({
  variant = 'secondary',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  const classes = [variant === 'plain' ? '' : `button button--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return <button {...props} type={type} className={classes || undefined} />
}
