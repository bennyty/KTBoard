import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Chain, ObjectColor, Plan, Slide, SlideObject } from '@/model/types'
import { DEFAULT_MAP, getMap } from '@/data/registry'
import { CIRCLE_DEFAULT_SIZE_MM } from '@/model/constants'
import { DEFAULT_OBJECT_COLOR, genId, translateObject } from './objects'
import { readPlanFromUrl, writePlanToUrl } from './urlState'

export type Tool = 'select' | 'circle' | 'ellipse' | 'rect' | 'arrow' | 'text'

function emptySlide(name: string, mapId: string, dropZoneId: string): Slide {
  return { id: genId(), name, mapId, dropZoneId, markers: null, objects: [] }
}

function defaultPlan(): Plan {
  return { name: 'New Plan', slides: [emptySlide('Slide 1', DEFAULT_MAP.id, DEFAULT_MAP.dropZones[0].id)] }
}

/** Two objects are "the same" for clone-dedupe purposes when every field but the
 *  id matches. Same kind guarantees the same set of keys. */
function objectsEqualIgnoringId(a: SlideObject, b: SlideObject): boolean {
  if (a.kind !== b.kind) return false
  const { id: _aId, ...aRest } = a
  const { id: _bId, ...bRest } = b
  return (Object.keys(aRest) as (keyof typeof aRest)[]).every(
    (k) => aRest[k] === (bRest as typeof aRest)[k],
  )
}

/** Deep-copy a slide, assigning fresh ids to the slide and every object. */
function cloneSlide(slide: Slide, name: string): Slide {
  return {
    id: genId(),
    name,
    mapId: slide.mapId,
    dropZoneId: slide.dropZoneId,
    markers: slide.markers ? slide.markers.map((m) => ({ ...m })) : null,
    objects: slide.objects.map((o) => ({ ...o, id: genId() })),
  }
}

export interface PlanController {
  plan: Plan
  currentSlide: Slide
  currentSlideId: string
  selectedObject: SlideObject | null
  selectedObjectId: string | null
  tool: Tool
  lastRectPreset: number
  /** Colour of the most recently chosen object, used as the default for new objects. */
  lastColor: ObjectColor
  /** Size (mm) of the most recently placed circle, reused as the default for new circles. */
  lastCircleSizeMm: number
  locked: boolean

  setPlanName(name: string): void
  setMap(mapId: string): void
  setDropZone(dropZoneId: string): void

  selectSlide(id: string): void
  addSlide(): void
  duplicateSlide(id: string): void
  deleteSlide(id: string): void
  moveSlide(id: string, dir: -1 | 1): void
  renameSlide(id: string, name: string): void
  setCurrentMarkers(markers: Chain | null): void

  selectObject(id: string | null): void
  addObject(object: SlideObject): void
  /** Copy the object onto every other slide, skipping slides that already have an
   *  identical copy. */
  cloneObjectToAllSlides(id: string): void
  updateObject(id: string, patch: Partial<SlideObject>): void
  translateObjectBy(id: string, dx: number, dy: number): void
  deleteObject(id: string): void

  setTool(tool: Tool): void
  setLastRectPreset(index: number): void
  setLastColor(color: ObjectColor): void
  setLastCircleSizeMm(sizeMm: number): void
  toggleLock(): void
  /** Discard the entire plan and start over from the default empty plan. */
  resetPlan(): void
}

export function isSlideEmpty(slide: Slide): boolean {
  return !slide.markers && slide.objects.length === 0
}

export function isPlanEmpty(plan: Plan): boolean {
  return plan.slides.length === 1 && isSlideEmpty(plan.slides[0])
}

export function usePlan(): PlanController {
  const [plan, setPlan] = useState<Plan>(() => readPlanFromUrl() ?? defaultPlan())
  // Plans arriving via a shared URL start locked to prevent accidental edits.
  const [locked, setLocked] = useState(() => !isPlanEmpty(plan))
  const [currentSlideId, setCurrentSlideId] = useState(() => plan.slides[0].id)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [lastRectPreset, setLastRectPreset] = useState(0)
  const [lastColor, setLastColor] = useState<ObjectColor>(DEFAULT_OBJECT_COLOR)
  const [lastCircleSizeMm, setLastCircleSizeMm] = useState(CIRCLE_DEFAULT_SIZE_MM)

  // Debounced URL write so rapid drags don't thrash history.replaceState.
  useEffect(() => {
    const t = setTimeout(() => writePlanToUrl(plan), 300)
    return () => clearTimeout(t)
  }, [plan])

  useEffect(() => {
    document.title = `KTBoard - ${plan.name}`
  }, [plan.name])

  const currentSlide = useMemo(
    () => plan.slides.find((s) => s.id === currentSlideId) ?? plan.slides[0],
    [plan.slides, currentSlideId],
  )
  const selectedObject = useMemo(
    () => currentSlide.objects.find((o) => o.id === selectedObjectId) ?? null,
    [currentSlide.objects, selectedObjectId],
  )

  /** Replace the current slide via an updater, leaving the rest of the plan intact. */
  const updateCurrentSlide = useCallback(
    (fn: (s: Slide) => Slide) => {
      setPlan((p) => ({ ...p, slides: p.slides.map((s) => (s.id === currentSlideId ? fn(s) : s)) }))
    },
    [currentSlideId],
  )

  const setPlanName = useCallback((name: string) => setPlan((p) => ({ ...p, name })), [])

  // Changing a slide's map or drop zone invalidates its terrain-anchored content,
  // so the slide is cleared back to empty (its name is kept).
  const resetCurrentSlide = useCallback(
    (mapId: string, dropZoneId: string) => {
      setSelectedObjectId(null)
      setTool('select')
      updateCurrentSlide((s) => ({ id: s.id, name: s.name, mapId, dropZoneId, markers: null, objects: [] }))
    },
    [updateCurrentSlide],
  )

  const setMap = useCallback(
    (mapId: string) => {
      const map = getMap(mapId)
      if (!map) return
      resetCurrentSlide(mapId, map.dropZones[0].id)
    },
    [resetCurrentSlide],
  )

  const setDropZone = useCallback(
    (dropZoneId: string) => resetCurrentSlide(currentSlide.mapId, dropZoneId),
    [resetCurrentSlide, currentSlide.mapId],
  )

  const selectSlide = useCallback((id: string) => {
    setCurrentSlideId(id)
    setSelectedObjectId(null)
  }, [])

  // Slide ids are minted outside the setPlan updater so the updater stays pure
  // (it re-runs under StrictMode, which would otherwise mint divergent ids).
  const addSlide = useCallback(() => {
    // A new slide inherits the current slide's map and drop zone — a plan most
    // often steps through turns on one board, and the user can switch per slide.
    const slide = emptySlide(`Slide ${plan.slides.length + 1}`, currentSlide.mapId, currentSlide.dropZoneId)
    setPlan((p) => {
      const idx = p.slides.findIndex((s) => s.id === currentSlideId)
      const slides = [...p.slides]
      slides.splice(idx + 1, 0, slide)
      return { ...p, slides }
    })
    setCurrentSlideId(slide.id)
    setSelectedObjectId(null)
  }, [plan.slides.length, currentSlideId, currentSlide.mapId, currentSlide.dropZoneId])

  const duplicateSlide = useCallback(
    (id: string) => {
      const src = plan.slides.find((s) => s.id === id)
      if (!src) return
      const copy = cloneSlide(src, `${src.name} copy`)
      setPlan((p) => {
        const idx = p.slides.findIndex((s) => s.id === id)
        if (idx < 0) return p
        const slides = [...p.slides]
        slides.splice(idx + 1, 0, copy)
        return { ...p, slides }
      })
      setCurrentSlideId(copy.id)
      setSelectedObjectId(null)
    },
    [plan.slides],
  )

  const deleteSlide = useCallback(
    (id: string) => {
      if (plan.slides.length === 1) {
        // Never leave a plan with zero slides; reset the lone slide instead,
        // keeping its map/drop zone.
        const prev = plan.slides[0]
        const only = emptySlide('Slide 1', prev.mapId, prev.dropZoneId)
        setPlan((p) => ({ ...p, slides: [only] }))
        setCurrentSlideId(only.id)
        setSelectedObjectId(null)
        return
      }
      const idx = plan.slides.findIndex((s) => s.id === id)
      if (idx < 0) return
      const remaining = plan.slides.filter((s) => s.id !== id)
      setPlan((p) => ({ ...p, slides: p.slides.filter((s) => s.id !== id) }))
      if (id === currentSlideId) {
        setCurrentSlideId(remaining[Math.min(idx, remaining.length - 1)].id)
      }
      setSelectedObjectId(null)
    },
    [plan.slides, currentSlideId],
  )

  const moveSlide = useCallback((id: string, dir: -1 | 1) => {
    setPlan((p) => {
      const idx = p.slides.findIndex((s) => s.id === id)
      const swap = idx + dir
      if (idx < 0 || swap < 0 || swap >= p.slides.length) return p
      const slides = [...p.slides]
      ;[slides[idx], slides[swap]] = [slides[swap], slides[idx]]
      return { ...p, slides }
    })
  }, [])

  const renameSlide = useCallback((id: string, name: string) => {
    setPlan((p) => ({ ...p, slides: p.slides.map((s) => (s.id === id ? { ...s, name } : s)) }))
  }, [])

  const setCurrentMarkers = useCallback(
    (markers: Chain | null) => updateCurrentSlide((s) => ({ ...s, markers })),
    [updateCurrentSlide],
  )

  const selectObject = useCallback((id: string | null) => setSelectedObjectId(id), [])

  const addObject = useCallback(
    (object: SlideObject) => {
      updateCurrentSlide((s) => ({ ...s, objects: [...s.objects, object] }))
      setSelectedObjectId(object.id)
    },
    [updateCurrentSlide],
  )

  const cloneObjectToAllSlides = useCallback(
    (id: string) => {
      const source = currentSlide.objects.find((o) => o.id === id)
      if (!source) return
      setPlan((p) => ({
        ...p,
        slides: p.slides.map((s) => {
          if (s.id === currentSlideId) return s
          if (s.objects.some((o) => objectsEqualIgnoringId(o, source))) return s
          return { ...s, objects: [...s.objects, { ...source, id: genId() }] }
        }),
      }))
    },
    [currentSlide, currentSlideId],
  )

  const updateObject = useCallback(
    (id: string, patch: Partial<SlideObject>) => {
      updateCurrentSlide((s) => ({
        ...s,
        objects: s.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as SlideObject) : o)),
      }))
    },
    [updateCurrentSlide],
  )

  const translateObjectBy = useCallback(
    (id: string, dx: number, dy: number) => {
      updateCurrentSlide((s) => ({
        ...s,
        objects: s.objects.map((o) => (o.id === id ? translateObject(o, dx, dy) : o)),
      }))
    },
    [updateCurrentSlide],
  )

  const deleteObject = useCallback(
    (id: string) => {
      updateCurrentSlide((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== id) }))
      setSelectedObjectId((sel) => (sel === id ? null : sel))
    },
    [updateCurrentSlide],
  )

  const toggleLock = useCallback(() => {
    setLocked((l) => !l)
    setSelectedObjectId(null)
    setTool('select')
  }, [])

  const resetPlan = useCallback(() => {
    const fresh = defaultPlan()
    setPlan(fresh)
    setCurrentSlideId(fresh.slides[0].id)
    setSelectedObjectId(null)
    setTool('select')
    setLocked(false)
  }, [])

  return {
    plan,
    currentSlide,
    currentSlideId,
    selectedObject,
    selectedObjectId,
    tool,
    lastRectPreset,
    lastColor,
    lastCircleSizeMm,
    locked,
    setPlanName,
    setMap,
    setDropZone,
    selectSlide,
    addSlide,
    duplicateSlide,
    deleteSlide,
    moveSlide,
    renameSlide,
    setCurrentMarkers,
    selectObject,
    addObject,
    cloneObjectToAllSlides,
    updateObject,
    translateObjectBy,
    deleteObject,
    setTool,
    setLastRectPreset,
    setLastColor,
    setLastCircleSizeMm,
    toggleLock,
    resetPlan,
  }
}
