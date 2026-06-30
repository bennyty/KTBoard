import { useEffect } from 'react'
import { Button } from './Button'

export function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Help and about"
    >
      <div
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto
          border border-edge bg-panel p-6 shadow-xl rounded-lg
          flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          className="absolute right-3 top-3 leading-none"
          title="Close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </Button>

        <h2 className="text-2xl">Help</h2>

        <section>
          <h3 className="m-0 mb-2 text-lg text-accent-2">Getting started</h3>
          <p className="m-0 mb-2 text-sm">
            KTBoard is a planning board for Kill Team.
          </p>
          <ul className="m-0 list-disc pl-5 text-sm">
            <li>Select a tool, then click or click-and-drag on the board to place an object.</li>
            <li>Build a sequence with multiple slides to walk through a plan step-by-step.</li>
            <li>Alternatively, use slides for different Crit Ops or to show alternative ideas.</li>
          </ul>
          <p className="m-0 my-2 text-sm">
            The app also includes a tunnel planner for the Raveners Kill Team (my favorite).
          </p>
          <ul className="m-0 list-disc pl-5 text-sm">
            <li>Generate tunnel suggestions based on a set of configurable weighted metrics.</li>
            <li>Suggestions also include some "variety" options, these are slightly lower "scoring" but have more variety.</li>
          </ul>
        </section>

        <section>
          <h3 className="m-0 mb-2 text-lg text-accent-2">Contact</h3>
          <p className="m-0 text-sm">
            Submit{' '}
            <a
              href="https://github.com/bennyty/KTBoard/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-2 hover:underline"
            >
              feedback or bug report
            </a>
          </p>
        </section>

        <section>
          <p className="m-0 text-sm text-muted">
            KTBoard is a hobby project built for the Kill Team community. If you enjoy it, also try our
            daily game,{' '}
            <a
              href="https://bennyty.github.io/KTdle/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-2 hover:underline"
            >
              KTdle
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
