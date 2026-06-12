import { useState } from 'react'
import { PlanningMode } from '@/planning/PlanningMode'
import { AnnotationMode } from '@/annotation/AnnotationMode'

export function App() {
  const [mode, setMode] = useState<'planning' | 'annotation'>('planning')
  return (
    <div className="app">
      <header>
        <h1>Raveners Tunnel Planner</h1>
        <nav>
          <button className={mode === 'planning' ? 'selected' : ''} onClick={() => setMode('planning')}>
            Planning
          </button>
          <button className={mode === 'annotation' ? 'selected' : ''} onClick={() => setMode('annotation')}>
            Annotation (dev)
          </button>
        </nav>
      </header>
      {mode === 'planning' ? <PlanningMode /> : <AnnotationMode />}
    </div>
  )
}
