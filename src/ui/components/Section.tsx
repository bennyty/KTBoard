import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

/** Uppercase, muted heading used at the top of sidebar sections. */
export function SectionHeading({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={twMerge(
        'm-0 text-sm font-bold uppercase tracking-tighter text-muted',
        className,
      )}
      {...props}
    />
  )
}

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
}

/** A vertical stack of controls with an optional heading — one sidebar block. */
export function Section({ title, className, children, ...props }: SectionProps) {
  return (
    <section className={twMerge('flex flex-col gap-2', className)} {...props}>
      {title != null && <SectionHeading>{title}</SectionHeading>}
      {children}
    </section>
  )
}
