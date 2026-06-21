import { useEffect, useMemo, useRef, useState } from 'react'
import type { SlideObject, Vec } from '@/model/types'
import { CIRCLE_DEFAULT_SIZE_MM } from '@/model/constants'
import { getCatalogue, getMap, maps } from '@/data/registry'
import { resolveMapPieces } from '@/scoring/generate'
import { makeNormContext } from '@/scoring/weighted'
import { makeScoringContext, scoreChain } from '@/scoring/score'
import { chainViolations } from '@/rules/validity'
import { pxToInches } from '@/geometry/transform'
import { Board, mapTransform } from '@/ui/Board'
import { clientToSvg } from '@/ui/svgPointer'
import { DropZoneLayer, ObjectiveLayer, TerrainLayer, TunnelTremorscytheAuraLayer, TunnelLayer, TunnelUnburrowReachLayer } from '@/ui/layers'
import { ObjectsLayer } from '@/ui/objectsLayer'
import { isPlanEmpty, usePlan } from './usePlan'
import { useTunnelGenerator } from './useTunnelGenerator'
import { makeArrow, makeCircle, makeRect, makeText, snapCircleSizeMm } from './objects'
import { PlanTab } from './PlanTab'
import { TunnelTab } from './TunnelTab'
import { clamp, constrainMarker0 } from '@/rules/tunnel'
import { Button, Field, Hint, Input, Section, Select, Sidebar } from '@/ui/components'
import { twJoin } from 'tailwind-merge'

/** One in-progress board gesture (placement or drag). Kept in a ref — only the
 *  draft preview needs to re-render. */
type Gesture =
  | { kind: 'circle'; center: Vec }
  | { kind: 'rect'; center: Vec }
  | { kind: 'arrow'; start: Vec }
  | { kind: 'moveObject'; id: string; last: Vec }
  | { kind: 'arrowHandle'; id: string; end: 'start' | 'end' }
  | { kind: 'marker'; index: number }

export function PlanningMode() {
  const plan = usePlan()
  const { locked, tool, lastRectPreset, lastColor, currentSlide, selectedObjectId } = plan

  const map = getMap(plan.plan.mapId) ?? maps[0]
  const catalogue = getCatalogue(map.killzone)!
  const dropZone = map.dropZones.find((d) => d.id === plan.plan.dropZoneId) ?? map.dropZones[0]

  const pieces = useMemo(() => resolveMapPieces(map, catalogue), [map, catalogue])
  const ctx = useMemo(() => makeScoringContext(map, pieces, dropZone), [map, pieces, dropZone])
  const norm = useMemo(() => makeNormContext(map, dropZone), [map, dropZone])

  const gen = useTunnelGenerator({
    map,
    catalogue,
    dropZoneId: dropZone.id,
    onPickMarkers: plan.setCurrentMarkers,
  })

  const [tab, setTab] = useState<'plan' | 'tunnel'>('plan')
  const [showTremorscytheAura, setShowTremorscytheAura] = useState(false)
  const [showUnburrowReach, setShowUnburrowReach] = useState(false)
  const [draft, setDraft] = useState<SlideObject | null>(null)
  const [wiggle, setWiggle] = useState(false)
  const gesture = useRef<Gesture | null>(null)

  // Switching map or drop zone replaces the whole plan, so confirm first when the
  // user has work that would be discarded. The Select stays controlled, so a cancel
  // leaves the dropdown on its current value.
  function confirmDiscard(what: string): boolean {
    if (isPlanEmpty(plan.plan)) return true
    return window.confirm(`Changing the ${what} will clear all the slides. Continue?`)
  }

  /** Nudge the lock button so a click on the locked canvas points the user at it. */
  function nudgeLock() {
    setWiggle(false)
    requestAnimationFrame(() => setWiggle(true))
  }

  // A candidate highlight belongs to the slide it was loaded into; clear it when
  // navigating to another slide.
  useEffect(() => {
    gen.clearSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.currentSlideId])

  // Keyboard shortcuts for tools and deleting the selected object. Ignored while
  // typing in a field, and modifier combos (e.g. ⌘R) are left to the browser.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      switch (e.key.toLowerCase()) {
        case 'c':
          if (!locked) plan.setTool('circle')
          break
        case 'r':
          if (!locked) plan.setTool('rect')
          break
        case 'l':
          if (!locked) plan.setTool('arrow')
          break
        case 't':
          if (!locked) plan.setTool('text')
          break
        case 'v':
          if (!locked) plan.setTool('select')
          break
        case 'escape':
          plan.setTool('select')
          plan.selectObject(null)
          break
        case 'delete':
        case 'backspace':
          if (!locked && selectedObjectId) {
            plan.deleteObject(selectedObjectId)
            e.preventDefault()
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, selectedObjectId, plan.setTool, plan.selectObject, plan.deleteObject])

  const markers = currentSlide.markers
  const violations = useMemo(
    () => (markers ? chainViolations(markers, pieces, map, dropZone) : []),
    [markers, pieces, map, dropZone],
  )
  const isValid = violations.length === 0
  const currentScores = useMemo(
    () => (markers && isValid ? scoreChain(markers, ctx) : null),
    [markers, isValid, ctx],
  )
  const invalidMarkers = useMemo(() => new Set(violations.map((v) => v.marker)), [violations])

  const interactive = tool === 'select' && !locked

  /** Convert a pointer event fired on a board child into killzone inches. */
  function evToInches(e: React.PointerEvent): Vec {
    const svg = (e.currentTarget as Element).closest('svg') as SVGSVGElement
    return pxToInches(mapTransform(map), clientToSvg(svg, e.clientX, e.clientY))
  }

  function onBoardPointerDown(inches: Vec, e: React.PointerEvent<SVGSVGElement>) {
    if (locked) {
      nudgeLock()
      return
    }
    switch (tool) {
      case 'select':
        plan.selectObject(null)
        break
      case 'circle': {
        gesture.current = { kind: 'circle', center: inches }
        const c = makeCircle(inches, CIRCLE_DEFAULT_SIZE_MM, lastColor)
        setDraft({ ...c, label: `${CIRCLE_DEFAULT_SIZE_MM}mm` })
        e.currentTarget.setPointerCapture(e.pointerId)
        break
      }
      case 'rect':
        gesture.current = { kind: 'rect', center: inches }
        setDraft(makeRect(inches, 0, lastRectPreset, lastColor))
        e.currentTarget.setPointerCapture(e.pointerId)
        break
      case 'arrow':
        gesture.current = { kind: 'arrow', start: inches }
        setDraft(makeArrow(inches, inches, lastColor))
        e.currentTarget.setPointerCapture(e.pointerId)
        break
      case 'text':
        plan.addObject(makeText(inches))
        plan.setTool('select')
        break
    }
  }

  function onBoardPointerMove(inches: Vec) {
    const g = gesture.current
    if (!g) return
    switch (g.kind) {
      case 'circle': {
        const radius = Math.hypot(inches.x - g.center.x, inches.y - g.center.y)
        const sizeMm = radius < 0.1 ? CIRCLE_DEFAULT_SIZE_MM : snapCircleSizeMm(radius)
        setDraft((d) => (d && d.kind === 'circle' ? { ...d, sizeMm, label: `${sizeMm}mm` } : d))
        break
      }
      case 'rect': {
        const deg = (Math.atan2(inches.y - g.center.y, inches.x - g.center.x) * 180) / Math.PI
        setDraft((d) => (d && d.kind === 'rect' ? { ...d, rotationDeg: deg } : d))
        break
      }
      case 'arrow':
        setDraft((d) => (d && d.kind === 'arrow' ? { ...d, x2: inches.x, y2: inches.y } : d))
        break
      case 'moveObject': {
        plan.translateObjectBy(g.id, inches.x - g.last.x, inches.y - g.last.y)
        g.last = inches
        break
      }
      case 'arrowHandle':
        plan.updateObject(g.id, g.end === 'start' ? { x1: inches.x, y1: inches.y } : { x2: inches.x, y2: inches.y })
        break
      case 'marker': {
        if (!markers) break
        const next =
          g.index === 0
            ? constrainMarker0(inches, dropZone.anchorEdge, map.widthIn, map.heightIn)
            : { x: clamp(inches.x, 0, map.widthIn), y: clamp(inches.y, 0, map.heightIn) }
        plan.setCurrentMarkers(markers.map((m, k) => (k === g.index ? next : m)))
        break
      }
    }
  }

  function onBoardPointerUp(inches: Vec) {
    const g = gesture.current
    gesture.current = null
    if (g?.kind === 'circle') {
      const radius = Math.hypot(inches.x - g.center.x, inches.y - g.center.y)
      const sizeMm = radius < 0.1 ? CIRCLE_DEFAULT_SIZE_MM : snapCircleSizeMm(radius)
      plan.addObject(makeCircle(g.center, sizeMm, lastColor))
      plan.setTool('select')
    } else if (g?.kind === 'rect') {
      const dx = inches.x - g.center.x
      const dy = inches.y - g.center.y
      const deg = Math.hypot(dx, dy) < 0.1 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI
      plan.addObject(makeRect(g.center, deg, lastRectPreset, lastColor))
      plan.setTool('select')
    } else if (g?.kind === 'arrow') {
      // Ignore an accidental zero-length drag.
      if (Math.hypot(inches.x - g.start.x, inches.y - g.start.y) >= 0.2) {
        plan.addObject(makeArrow(g.start, inches, lastColor))
      }
      plan.setTool('select')
    }
    setDraft(null)
  }

  function onObjectPointerDown(id: string, e: React.PointerEvent) {
    plan.selectObject(id)
    gesture.current = { kind: 'moveObject', id, last: evToInches(e) }
    ;(e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  function onArrowHandlePointerDown(id: string, end: 'start' | 'end', e: React.PointerEvent) {
    plan.selectObject(id)
    gesture.current = { kind: 'arrowHandle', id, end }
    ;(e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  function onMarkerPointerDown(index: number, e: React.PointerEvent) {
    if (locked) return
    gesture.current = { kind: 'marker', index }
    plan.selectObject(null)
    gen.clearSelection()
    ;(e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <div className="flex flex-col flex-1 md:flex-row md:min-h-0">
      <Sidebar className="
        order-last md:order-first
        basis-0 grow md:max-w-fit">
        <Section className="border-b border-bg pb-3">
          <Field label="Plan name">
            <Input value={plan.plan.name} disabled={locked} onChange={(e) => plan.setPlanName(e.target.value)} />
          </Field>
          <Field label="Map">
            <Select
              value={map.id}
              disabled={locked}
              onChange={(e) => confirmDiscard('map') && plan.setMap(e.target.value)}
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.draft ? ' (draft annotation)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Drop zone">
            <Select
              value={dropZone.id}
              disabled={locked}
              onChange={(e) => confirmDiscard('drop zone') && plan.setDropZone(e.target.value)}
            >
              {map.dropZones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            className={twJoin(locked && 'border-danger bg-danger', wiggle && 'animate-wiggle')}
            onClick={plan.toggleLock}
            onAnimationEnd={() => setWiggle(false)}
          >
            {locked ? '🔒 Locked — click to edit' : '🔓 Unlocked'}
          </Button>
          {!locked && <Hint className="mx-auto">All changes are saved automatically, share the url!</Hint>}
        </Section>

        <div className="flex flex-wrap gap-1">
          <Button className="px-2 py-1 text-xs" selected={tab === 'plan'} onClick={() => setTab('plan')}>
            Plan
          </Button>
          <Button className="px-2 py-1 text-xs" selected={tab === 'tunnel'} onClick={() => setTab('tunnel')}>
            Tunnel
          </Button>
        </div>

        {tab === 'plan' ? (
          <PlanTab
            tool={tool}
            setTool={plan.setTool}
            selectedObject={plan.selectedObject}
            updateObject={plan.updateObject}
            deleteObject={plan.deleteObject}
            setLastRectPreset={plan.setLastRectPreset}
            setLastColor={plan.setLastColor}
            addObject={plan.addObject}
            slides={plan.plan.slides}
            currentSlideId={plan.currentSlideId}
            selectSlide={plan.selectSlide}
            addSlide={plan.addSlide}
            duplicateSlide={plan.duplicateSlide}
            deleteSlide={plan.deleteSlide}
            moveSlide={plan.moveSlide}
            renameSlide={plan.renameSlide}
            disabled={locked}
          />
        ) : (
          <TunnelTab
            gen={gen}
            markers={markers}
            violations={violations}
            currentScores={currentScores}
            norm={norm}
            disabled={locked}
            onRemoveTunnel={() => plan.setCurrentMarkers(null)}
            draftMap={!!map.draft}
            showTremorscytheAura={showTremorscytheAura}
            setShowTremorscytheAura={setShowTremorscytheAura}
            showUnburrowReach={showUnburrowReach}
            setShowUnburrowReach={setShowUnburrowReach}
          />
        )}
      </Sidebar>

      <main className="
          h-9/12 p-3 md:h-full md:min-h-0
          grow-3
          flex items-center justify-center">
        <Board
          map={map}
          className={locked ? 'cursor-not-allowed' : undefined}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
        >
          <DropZoneLayer dropZones={map.dropZones} activeId={dropZone.id} />
          <TerrainLayer pieces={pieces} />
          <ObjectiveLayer objectives={map.objectives} homeId={ctx.homeObjective?.id} />
          {markers && showTremorscytheAura && <TunnelTremorscytheAuraLayer chain={markers} />}
          {markers && showUnburrowReach && <TunnelUnburrowReachLayer chain={markers} />}
          {markers && (
            <TunnelLayer
              chain={markers}
              invalidMarkers={invalidMarkers}
              onMarkerPointerDown={interactive ? onMarkerPointerDown : undefined}
            />
          )}
          <ObjectsLayer
            objects={currentSlide.objects}
            selectedId={selectedObjectId ?? undefined}
            interactive={interactive}
            draft={draft}
            onObjectPointerDown={onObjectPointerDown}
            onArrowHandlePointerDown={onArrowHandlePointerDown}
          />
        </Board>
      </main>
    </div>
  )
}
