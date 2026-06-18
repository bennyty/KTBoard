import { twMerge } from 'tailwind-merge'

/** A reset <ul> that stacks its items with a small gap. */
export function List({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={twMerge('m-0 flex list-none flex-col gap-1 p-0', className)} {...props} />
}

export interface ListItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  selected?: boolean
}

/** A panelled row inside a {@link List}. Name fields (direct <input> children) grow to fill. */
export function ListItem({ selected, className, ...props }: ListItemProps) {
  return (
    <li
      className={twMerge(
        'flex flex-wrap items-center justify-between gap-1.5 rounded-md bg-panel-2 px-1.5 py-1 text-sm',
        '[&>input]:min-w-0 [&>input]:flex-1',
        selected && 'outline outline-accent',
        className,
      )}
      {...props}
    />
  )
}
