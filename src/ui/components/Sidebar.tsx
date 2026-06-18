import { twMerge } from 'tailwind-merge'

/** The scrolling left-hand control panel shared by planning and annotation. */
export function Sidebar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={twMerge(
        'flex w-80 min-w-80 flex-col gap-4 overflow-y-auto border-r border-black bg-panel p-3',
        className,
      )}
      {...props}
    />
  )
}
