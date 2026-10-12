import { Button, type ButtonProps } from '../Button/Button'
import './IconButton.css'

type IconButtonProps = Omit<ButtonProps, 'variant'> & {
  variant?: 'default' | 'danger'
  'aria-label': string
}

export function IconButton({
  variant = 'default',
  className,
  ...props
}: IconButtonProps) {
  const classes = [
    'icon-button',
    variant === 'danger' ? 'icon-button--danger' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <Button {...props} variant="plain" className={classes} />
}
