import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'
import { controlClass } from './control'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={twMerge(controlClass, className)} {...props} />
})
