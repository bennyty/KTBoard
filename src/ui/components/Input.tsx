import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { controlClass } from './control'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={twMerge(controlClass, className)} {...props} />
  },
)
