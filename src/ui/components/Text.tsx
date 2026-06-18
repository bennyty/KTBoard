import type { ElementType } from 'react'
import { twMerge } from 'tailwind-merge'

/** Muted helper copy. Defaults to a <p>; pass `as="span"` for inline use. */
export function Hint({
  as: Tag = 'p',
  className,
  ...props
}: { as?: ElementType } & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={twMerge('m-0 text-xs text-muted', className)} {...props} />
}

/** Inline error message. */
export function ErrorText({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge('text-sm text-danger', className)} {...props} />
}
