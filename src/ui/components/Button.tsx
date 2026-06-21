import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'

type Variant = 'default' | 'primary' | 'danger'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** Active/toggled state — fills the button with the accent colour. */
  selected?: boolean
}

const base =
  'cursor-pointer rounded-md border border-edge bg-panel-2 px-1.5 py-1 text-text hover:border-accent disabled:cursor-default disabled:opacity-50'

const primaryClass = 'w-full border-accent bg-accent p-2 font-semibold text-white'
const dangerClass = 'border-danger hover:border-danger/80 px-2 py-0.5 text-danger'
const selectedClass = 'border-accent bg-accent text-white'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', selected, className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={twMerge(
        base,
        variant === 'primary' && primaryClass,
        variant === 'danger' && dangerClass,
        selected && selectedClass,
        className,
      )}
      {...props}
    />
  )
})
