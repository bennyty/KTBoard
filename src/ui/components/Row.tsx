import { twMerge } from 'tailwind-merge'

/** A horizontal, wrapping flex row — the app's default "put these side by side". */
export function Row({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge('flex flex-wrap gap-1.5', className)} {...props} />
}
