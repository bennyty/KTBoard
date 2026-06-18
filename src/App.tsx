import { useState } from 'react'
import { PlanningMode } from '@/planning/PlanningMode'
import { AnnotationMode } from '@/annotation/AnnotationMode'
import { Button } from '@/ui/components'

export function App() {
  const [mode, setMode] = useState<'planning' | 'annotation'>('planning')
  const isDev = import.meta.env.DEV

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-black bg-panel px-4 py-2">
        <h1 className="m-0 text-base">KTBoard</h1>
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
      </header>
      {mode === 'planning' ? <PlanningMode /> : <AnnotationMode />}
    </div>
  )
}
