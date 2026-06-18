import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

export interface FieldProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Caption rendered above the control. Omit for inline rows (e.g. a checkbox). */
  label?: ReactNode
  /** Lay the caption and control out in a row instead of a column. */
  row?: boolean
  children: ReactNode
}

const column = 'flex flex-col gap-1 text-sm text-muted'
const inline = 'flex flex-row items-center gap-2 text-sm text-text'

export function Field({ label, row, className, children, ...props }: FieldProps) {
  return (
    <label className={twMerge(row ? inline : column, className)} {...props}>
      {label}
      {children}
    </label>
  )
}
