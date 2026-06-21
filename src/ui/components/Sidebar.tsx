import { twMerge } from 'tailwind-merge'

/** The scrolling left-hand control panel shared by planning and annotation. */
export function Sidebar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={twMerge(
        'flex flex-col gap-4',
        'border-t border-bg bg-panel p-3 md:w-80 md:min-h-0 md:min-w-50 md:overflow-y-auto md:border-t-0 md:border-r',
        className,
      )}
      {...props}
    />
  )
}
