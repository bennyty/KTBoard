import { useEffect, useMemo, useRef, useState } from 'react'
import type { SlideObject, Vec } from '@/model/types'
import { DEFAULT_MAP, getCatalogue, getMap } from '@/data/registry'
import { resolveMapPieces } from '@/scoring/generate'
import { makeNormContext } from '@/scoring/weighted'
import { makeScoringContext, scoreChain } from '@/scoring/score'
import { chainViolations } from '@/rules/validity'
import { equipmentViolations } from '@/rules/equipment'
import { pxToInches } from '@/geometry/transform'
import { Board, mapTransform } from '@/ui/Board'
import { clientToSvg } from '@/ui/svgPointer'
import { DropZoneLayer, ObjectiveLayer, TerrainLayer, TunnelLayer, TunnelAuraLayer } from '@/ui/layers'
import { EquipmentClearanceLayer, ObjectsLayer } from '@/ui/objectsLayer'
import { isEquipment } from '@/rules/equipment'
import { isSlideEmpty, usePlan } from './usePlan'
import { useTunnelGenerator } from './useTunnelGenerator'
import { ellipsePresetLabel, makeArrow, makeCircle, makeEllipse, makeRect, makeText, snapCircleSizeMm, snapEllipsePreset } from './objects'
import { PlanTab } from './PlanTab'
import { TunnelTab } from './TunnelTab'
import { clamp, constrainMarker0 } from '@/rules/tunnel'
import { Button, Field, Hint, Input, Section, Sidebar } from '@/ui/components'
import { twJoin } from 'tailwind-merge'
import {
  BASE_RADIUS_IN,
  ELLIPSE_PRESETS,
  IN_PER_MM,
  MARKER_RADIUS_IN,
  UNBURROW_CONTROL_RANGE_IN,
} from '@/model/constants'

/** One in-progress board gesture (placement or drag). Kept in a ref — only the
 *  draft preview needs to re-render. */
type Gesture =
  | { kind: 'circle'; center: Vec }
  | { kind: 'ellipse'; center: Vec }
  | { kind: 'rect'; center: Vec }
  | { kind: 'arrow'; start: Vec }
  | { kind: 'moveObject'; id: string; last: Vec }
  | { kind: 'arrowHandle'; id: string; end: 'start' | 'end' }
  // Rotating a placed rect/ellipse by dragging its rotation handle.
  | { kind: 'rotateObject'; id: string; center: Vec }
  | { kind: 'marker'; index: number }

export function PlanningMode() {
  const plan = usePlan()
  const { locked, tool, lastRectPreset, lastColor, lastCircleSizeMm, currentSlide, selectedObjectId } = plan

  const slides = plan.plan.slides
  const slideIndex = slides.findIndex((s) => s.id === plan.currentSlideId)
  const map = getMap(currentSlide.mapId) ?? DEFAULT_MAP
  const catalogue = getCatalogue(map.killzone)!
  const dropZone = map.dropZones.find((d) => d.id === currentSlide.dropZoneId) ?? map.dropZones[0]

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
  const [showTunnelRange, setShowTunnelRange] = useState<[boolean, boolean, boolean]>([false, false, false])
  const [draft, setDraft] = useState<SlideObject | null>(null)
  const [wiggle, setWiggle] = useState(false)
  // Id of the object currently being dragged/rotated on the board; drives the
  // equipment clearance overlay. Kept in state (not the gesture ref) so the
  // overlay re-renders as the drag lands.
  const [draggingObjectId, setDraggingObjectId] = useState<string | null>(null)
  const gesture = useRef<Gesture | null>(null)

  // Switching map or drop zone clears the current slide's terrain-anchored
  // content, so confirm first when that slide has work to lose. The Select stays
  // controlled, so a cancel leaves the dropdown on its current value.
  function confirmDiscard(what: string): boolean {
    if (isSlideEmpty(currentSlide)) return true
    return window.confirm(`Changing the ${what} will clear this slide. Continue?`)
  }

  function changeMap(mapId: string) {
    if (confirmDiscard('map')) plan.setMap(mapId)
  }

  function changeDropZone(dropZoneId: string) {
    if (confirmDiscard('drop zone')) plan.setDropZone(dropZoneId)
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
        case 'e':
        case 'o':
          if (!locked) plan.setTool('ellipse')
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

  // Accessible sub-regions carried by the placed terrain pieces, in world inches.
  const accessibleRegions = useMemo(
    () => pieces.flatMap((p) => p.accessible ?? []),
    [pieces],
  )
  // Equipment (preset-shaped rects) placed within 2" of other equipment or of
  // accessible terrain is flagged; the ids feed both the board and props panel.
  const equipmentWarnings = useMemo(
    () => equipmentViolations(currentSlide.objects, accessibleRegions, map.objectives),
    [currentSlide.objects, accessibleRegions, map.objectives],
  )

  const interactive = tool === 'select' && !locked

  // While an Equipment rect is being dragged, the board shows its keep-out zones.
  const draggedEquipment = useMemo(() => {
    if (!draggingObjectId) return null
    const o = currentSlide.objects.find((x) => x.id === draggingObjectId)
    return o && isEquipment(o) ? o : null
  }, [draggingObjectId, currentSlide.objects])

  /** Oval-base preset for an ellipse sizing drag: dx/dy off the centre give the
   *  two axis diameters, snapped to the nearest preset. A bare click (no drag)
   *  lands on the smallest preset. */
  function snapEllipseFromDrag(center: Vec, at: Vec) {
    const widthMm = (Math.abs(at.x - center.x) * 2) / IN_PER_MM
    const heightMm = (Math.abs(at.y - center.y) * 2) / IN_PER_MM
    return snapEllipsePreset(widthMm, heightMm)
  }

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
        const c = makeCircle(inches, lastCircleSizeMm, lastColor)
        setDraft({ ...c, label: `${lastCircleSizeMm}mm` })
        e.currentTarget.setPointerCapture(e.pointerId)
        break
      }
      case 'ellipse': {
        gesture.current = { kind: 'ellipse', center: inches }
        const preset = ELLIPSE_PRESETS[0]
        const el = makeEllipse(inches, preset.widthMm, preset.heightMm, 0, lastColor)
        setDraft({ ...el, label: ellipsePresetLabel(preset) })
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
        const sizeMm = radius < 0.1 ? lastCircleSizeMm : snapCircleSizeMm(radius)
        setDraft((d) => (d && d.kind === 'circle' ? { ...d, sizeMm, label: `${sizeMm}mm` } : d))
        break
      }
      case 'ellipse': {
        const preset = snapEllipseFromDrag(g.center, inches)
        setDraft((d) =>
          d && d.kind === 'ellipse'
            ? { ...d, widthMm: preset.widthMm, heightMm: preset.heightMm, label: ellipsePresetLabel(preset) }
            : d,
        )
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
      case 'rotateObject': {
        const deg = (Math.atan2(inches.y - g.center.y, inches.x - g.center.x) * 180) / Math.PI
        plan.updateObject(g.id, { rotationDeg: deg })
        break
      }
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
    setDraggingObjectId(null)
    if (g?.kind === 'circle') {
      const radius = Math.hypot(inches.x - g.center.x, inches.y - g.center.y)
      const sizeMm = radius < 0.1 ? lastCircleSizeMm : snapCircleSizeMm(radius)
      plan.addObject(makeCircle(g.center, sizeMm, lastColor))
      plan.setLastCircleSizeMm(sizeMm)
      plan.setTool('select')
    } else if (g?.kind === 'ellipse') {
      const preset = snapEllipseFromDrag(g.center, inches)
      plan.addObject({ ...makeEllipse(g.center, preset.widthMm, preset.heightMm, 0, lastColor), label: preset.name })
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
    setDraggingObjectId(id)
    gesture.current = { kind: 'moveObject', id, last: evToInches(e) }
      ; (e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  function onArrowHandlePointerDown(id: string, end: 'start' | 'end', e: React.PointerEvent) {
    plan.selectObject(id)
    gesture.current = { kind: 'arrowHandle', id, end }
      ; (e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  function onRotateHandlePointerDown(id: string, e: React.PointerEvent) {
    const obj = currentSlide.objects.find((o) => o.id === id)
    if (!obj || (obj.kind !== 'rect' && obj.kind !== 'ellipse')) return
    plan.selectObject(id)
    setDraggingObjectId(id)
    gesture.current = { kind: 'rotateObject', id, center: { x: obj.x, y: obj.y } }
      ; (e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  function onMarkerPointerDown(index: number, e: React.PointerEvent) {
    if (locked) return
    gesture.current = { kind: 'marker', index }
    plan.selectObject(null)
    gen.clearSelection()
      ; (e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId)
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <div className="flex flex-col flex-1 md:flex-row md:min-h-0">
      <Sidebar className="
        order-last md:order-first
        basis-0 grow min-w-fit">
        <Section className="border-b border-bg pb-3">
          <Field label="Plan name">
            <Input value={plan.plan.name} disabled={locked} onChange={(e) => plan.setPlanName(e.target.value)} />
          </Field>
          <div className="flex gap-1">
            <Button
              className={twJoin('flex-1', locked && 'border-danger bg-danger', wiggle && 'animate-wiggle')}
              onClick={plan.toggleLock}
              onAnimationEnd={() => setWiggle(false)}
            >
              {locked ? '🔒 Locked — click to edit' : '🔓 Unlocked'}
            </Button>
            <Button
              className="px-2"
              title="Clear plan"
              onClick={() => {
                if (window.confirm('Clear the whole plan and start over? This cannot be undone.')) {
                  plan.resetPlan()
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
                {/* Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE */}
                <path fill="currentColor" d="m9.4 16.5l2.6-2.6l2.6 2.6l1.4-1.4l-2.6-2.6L16 9.9l-1.4-1.4l-2.6 2.6l-2.6-2.6L8 9.9l2.6 2.6L8 15.1zM7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21z" />
              </svg>
            </Button>
          </div>
          {!locked && <Hint className="mx-auto">All changes are saved automatically, share the url!</Hint>}
        </Section>

        <div className="flex gap-1 ">
          <Button className="px-2 py-1 flex-1" selected={tab === 'plan'} onClick={() => setTab('plan')}>
            Plan
          </Button>
          <Button className="px-2 py-1 flex-1" selected={tab === 'tunnel'} onClick={() => setTab('tunnel')}>
            Tunnel
          </Button>
        </div>

        {tab === 'plan' ? (
          <PlanTab
            map={map}
            dropZone={dropZone}
            setMap={changeMap}
            setDropZone={changeDropZone}
            tool={tool}
            setTool={plan.setTool}
            selectedObject={plan.selectedObject}
            selectedObjectWarning={!!selectedObjectId && equipmentWarnings.has(selectedObjectId)}
            updateObject={plan.updateObject}
            deleteObject={plan.deleteObject}
            setLastRectPreset={plan.setLastRectPreset}
            setLastColor={plan.setLastColor}
            addObject={plan.addObject}
            cloneObjectToAllSlides={plan.cloneObjectToAllSlides}
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
            showTunnelRange={showTunnelRange}
            setShowTunnelRange={setShowTunnelRange}
          />
        )}
      </Sidebar>

      <main className="
          h-9/12 p-3 md:h-full md:min-h-0
          grow-3 md:basis-0 min-w-0
          flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 pb-2">
          <Button
            className="px-8"
            title="Previous slide"
            aria-label="Previous slide"
            disabled={slideIndex <= 0}
            onClick={() => slideIndex > 0 && plan.selectSlide(slides[slideIndex - 1].id)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
            {/* Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE */}
            <path fill="currentColor" d="m10 18l-6-6l6-6l1.4 1.45L7.85 11H20v2H7.85l3.55 3.55z" />
            </svg>
          </Button>
          <span className="min-w-0 truncate text-center font-semibold text-text">
            {currentSlide.name}
            <span className="ml-2 text-muted font-normal">
              {slideIndex + 1} / {slides.length}
            </span>
          </span>
          <Button
            className="px-8"
            title="Next slide"
            aria-label="Next slide"
            disabled={slideIndex >= slides.length - 1}
            onClick={() => slideIndex < slides.length - 1 && plan.selectSlide(slides[slideIndex + 1].id)}
          >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
          {/* Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE */}
          <path fill="currentColor" d="m14 18l-1.4-1.45L16.15 13H4v-2h12.15L12.6 7.45L14 6l6 6z"/>
          </svg>
          </Button>
        </div>
        <div className="flex flex-1 min-h-0 items-center justify-center">
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
            {markers && showTunnelRange[0] && <TunnelAuraLayer chain={markers} radius={MARKER_RADIUS_IN + (BASE_RADIUS_IN * 2)} />}
            {markers && showTunnelRange[1] && <TunnelAuraLayer chain={markers} radius={MARKER_RADIUS_IN + 2} fill />}
            {markers && showTunnelRange[2] && <TunnelAuraLayer chain={markers} radius={MARKER_RADIUS_IN + UNBURROW_CONTROL_RANGE_IN} fill />}
            {markers && (
              <TunnelLayer
                chain={markers}
                invalidMarkers={invalidMarkers}
                onMarkerPointerDown={interactive ? onMarkerPointerDown : undefined}
              />
            )}
            {draggedEquipment && (
              <EquipmentClearanceLayer
                dragged={draggedEquipment}
                objects={currentSlide.objects}
                accessibleRegions={accessibleRegions}
              />
            )}
            <ObjectsLayer
              objects={currentSlide.objects}
              selectedId={selectedObjectId ?? undefined}
              interactive={interactive}
              draft={draft}
              warningIds={equipmentWarnings}
              onObjectPointerDown={onObjectPointerDown}
              onArrowHandlePointerDown={onArrowHandlePointerDown}
              onRotateHandlePointerDown={onRotateHandlePointerDown}
            />
          </Board>
        </div>
      </main>
    </div>
  )
}
