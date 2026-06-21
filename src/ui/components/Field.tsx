import type { ReactNode, HTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'

export interface FieldProps extends HTMLAttributes<HTMLElement> {
  /** Caption rendered above the control. Omit for inline rows (e.g. a checkbox). */
  label?: ReactNode
  /** Lay the caption and control out in a row instead of a column. */
  row?: boolean
  children: ReactNode
}

const column = 'flex flex-col gap-1'
const inline = 'flex flex-row items-center gap-2'

export function Field({ label, row, className, children, ...props }: FieldProps) {
  return (
    <div className={twMerge(row ? inline : column, className)} {...props}>
      <label>{label}</label>
      {children}
    </div>
  )
}
