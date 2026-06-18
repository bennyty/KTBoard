import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { controlClass } from './control'

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={twMerge(controlClass, className)} {...props} />
  },
)
