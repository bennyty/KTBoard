import { useState } from 'react'
import { PlanningMode } from '@/planning/PlanningMode'
import { AnnotationMode } from '@/annotation/AnnotationMode'
import { Button } from '@/ui/components'
import ktboardLogo from '../favicon.png'

export function App() {
  const [mode, setMode] = useState<'planning' | 'annotation'>('planning')
  const isDev = import.meta.env.DEV

  return (
    <div className="flex flex-col md:h-screen md:overflow-hidden font-vintage">
      <header className="flex items-center gap-4 border-b border-bg bg-panel px-4 py-2">
        <img src={ktboardLogo} alt="KTBoard icon" className="inline-block w-10 -mt-1" />
        <h1 className="m-0 text-2xl">
          KTBoard
        </h1>
        <nav className="flex gap-1.5">
          <Button selected={mode === 'planning'} onClick={() => setMode('planning')}>
            Planning
          </Button>
          {isDev && (
            <Button selected={mode === 'annotation'} onClick={() => setMode('annotation')}>
              Annotation (dev)
            </Button>
          )}
        </nav>
        <aside className="ml-auto">
          <a href="https://bennyty.github.io/KTdle/" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline">
            Try our daily game - KTdle
          </a>
        </aside>
      </header>
      {mode === 'planning' ? <PlanningMode /> : <AnnotationMode />}
    </div>
  )
}
