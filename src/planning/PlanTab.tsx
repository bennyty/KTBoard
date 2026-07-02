import { useEffect, useRef, useState, type ReactElement } from 'react'
import { twJoin, twMerge } from 'tailwind-merge'
import type { AnnotatedMap, DropZone, ObjectColor, SlideObject, Slide } from '@/model/types'
import { OBJECT_COLORS } from '@/model/types'
import { ELLIPSE_PRESETS, RECT_PRESETS } from '@/model/constants'
import { maps } from '@/data/registry'
import { arrowLengthIn, COLOR_HEX, ellipsePresetLabel, formatInches, makeText, OBJECT_KIND_LABELS } from './objects'
import type { Tool } from './usePlan'
import { Button, Field, Hint, Input, List, Row, Section, Select, Textarea } from '@/ui/components'

const ICON: Record<Tool, ReactElement> = {
  select: (
    // Icon from Material Symbols by Google (Apache-2.0)
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="m13.775 22l-3.625-7.8L6 20V2l14 11h-7.1l3.6 7.725z" />
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
    </svg>
  ),
  ellipse: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <ellipse cx="8" cy="8" rx="6.5" ry="4" />
    </svg>
  ),
  rect: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="2.5" y="4" width="11" height="8" rx="0.5" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 13L13 2.5M6.5 2.5H13V9" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M3 2h10v2.2h-.9l-.4-1H8.9v9.5l1.4.3V14H5.7v-1l1.4-.3V3.2H4.3l-.4 1H3z" />
    </svg>
  ),
}

type ToolMeta = { tool: Tool; label: string; key: string }

/** Circle and Ellipse share one toolbar slot: Ellipse is the rarely-used variant
 *  reached through the slot's caret flyout, keeping the toolbar to five buttons. */
const SHAPE_TOOLS = [
  { tool: 'circle', label: 'Circle', key: 'C' },
  { tool: 'ellipse', label: 'Ellipse', key: 'E' },
] as const satisfies readonly ToolMeta[]

/** The plain, single-tool toolbar buttons, in order; the shape slot is inserted
 *  between Select and Rectangle. */
const TOOLS: ToolMeta[] = [
  { tool: 'select', label: 'Select', key: 'V' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'arrow', label: 'Arrow', key: 'L' },
  { tool: 'text', label: 'Text', key: 'T' },
]

const TOOL_BUTTON_CLASS = 'flex min-w-0 flex-1 items-center justify-center px-0 py-2 [&_svg]:block'

function ToolButton({ meta, tool, setTool, disabled }: { meta: ToolMeta; tool: Tool; setTool: (t: Tool) => void; disabled: boolean }) {
  return (
    <Button
      className={TOOL_BUTTON_CLASS}
      selected={tool === meta.tool}
      disabled={disabled && meta.tool !== 'select'}
      onClick={() => setTool(meta.tool)}
      title={`${meta.label} (${meta.key})`}
      aria-label={`${meta.label} (${meta.key})`}
    >
      {ICON[meta.tool]}
    </Button>
  )
}

/** The Circle/Ellipse slot: the main button places the last-used shape; a corner
 *  caret opens a flyout to switch between Circle and Ellipse. */
function ShapeToolButton({ tool, setTool, disabled }: { tool: Tool; setTool: (t: Tool) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [lastShape, setLastShape] = useState<'circle' | 'ellipse'>('circle')
  const ref = useRef<HTMLDivElement>(null)

  // Remember the active shape (also when picked via keyboard) so the slot shows it.
  useEffect(() => {
    if (tool === 'circle' || tool === 'ellipse') setLastShape(tool)
  }, [tool])

  // Dismiss the flyout on an outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const active = tool === 'circle' || tool === 'ellipse'
  const shown = active ? (tool as 'circle' | 'ellipse') : lastShape
  const shownMeta = SHAPE_TOOLS.find((s) => s.tool === shown)!

  function choose(t: 'circle' | 'ellipse') {
    setLastShape(t)
    setTool(t)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative flex min-w-0 flex-1">
      <Button
        className={TOOL_BUTTON_CLASS}
        selected={active}
        disabled={disabled}
        onClick={() => setTool(shown)}
        title={`${shownMeta.label} (${shownMeta.key})`}
        aria-label={`${shownMeta.label} (${shownMeta.key})`}
      >
        {ICON[shown]}
      </Button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="More shapes"
        aria-label="More shapes"
        aria-haspopup="menu"
        aria-expanded={open}
        className="absolute bottom-0.5 right-0.5 leading-none text-[9px] text-muted hover:text-text disabled:opacity-50"
      >
        ▾
      </button>
      {open && !disabled && (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-1 flex w-max flex-col gap-1 rounded-md border border-edge bg-panel-2 p-1 shadow-lg"
        >
          {SHAPE_TOOLS.map((s) => (
            <Button
              key={s.tool}
              role="menuitem"
              selected={shown === s.tool}
              className="flex items-center justify-start gap-2 px-2 py-1 [&_svg]:block"
              onClick={() => choose(s.tool)}
              title={`${s.label} (${s.key})`}
            >
              {ICON[s.tool]}
              <span>{s.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: ObjectColor; onChange: (c: ObjectColor) => void }) {
  return (
    <div className="flex gap-1.5">
      {OBJECT_COLORS.map((c) => (
        <Button
          key={c}
          className={twJoin(
            'h-6 w-6 rounded-full border-2 p-0',
            c === value && 'border-white shadow-sm',
          )}
          style={{ background: COLOR_HEX[c] }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

function ObjectProps({
  object,
  updateObject,
  deleteObject,
  setLastRectPreset,
  setLastColor,
  addObject,
  cloneObjectToAllSlides,
  canCloneToSlides,
}: {
  object: SlideObject
  updateObject: (id: string, patch: Partial<SlideObject>) => void
  deleteObject: (id: string) => void
  setLastRectPreset: (i: number) => void
  setLastColor: (c: ObjectColor) => void
  addObject: (object: SlideObject) => void
  cloneObjectToAllSlides: (id: string) => void
  canCloneToSlides: boolean
}) {
  const patch = (p: Partial<SlideObject>) => updateObject(object.id, p)
  const presetIndex =
    object.kind === 'rect'
      ? RECT_PRESETS.findIndex((p) => p.lengthMm === object.lengthMm && p.widthMm === object.widthMm)
      : -1
  const ellipsePresetIndex =
    object.kind === 'ellipse'
      ? ELLIPSE_PRESETS.findIndex((p) => p.widthMm === object.widthMm && p.heightMm === object.heightMm)
      : -1

  return (
    <Section title={OBJECT_KIND_LABELS[object.kind]} className="rounded-md bg-panel-2 p-2.5">
      <Field label="Label">
        {object.kind === 'text' ? (
          <Textarea
            rows={3}
            value={object.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
        ) : (
          <Input value={object.label} onChange={(e) => patch({ label: e.target.value })} />
        )}
      </Field>

      {object.kind !== 'text' && (
        <Field label="Color">
          <ColorPicker
            value={object.color}
            onChange={(c) => {
              setLastColor(c)
              patch({ color: c })
            }}
          />
        </Field>
      )}

      {object.kind === 'circle' && (
        <Field label="Size (mm)">
          <Input
            type="number"
            min={1}
            step={1}
            value={object.sizeMm}
            onChange={(e) => patch({ sizeMm: Number(e.target.value) })}
          />
        </Field>
      )}

      {object.kind === 'ellipse' && (
        <>
          <Field label="Base preset">
            <Select
              value={ellipsePresetIndex}
              onChange={(e) => {
                const i = Number(e.target.value)
                if (i < 0) return
                patch({ widthMm: ELLIPSE_PRESETS[i].widthMm, heightMm: ELLIPSE_PRESETS[i].heightMm, label: ELLIPSE_PRESETS[i].name })
              }}
            >
              {ellipsePresetIndex < 0 && <option value={-1}>Custom</option>}
              {ELLIPSE_PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {ellipsePresetLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Row className="gap-2">
            <Field label="Width (mm)" className="flex-1">
              <Input type="number" min={1} value={object.widthMm} onChange={(e) => patch({ widthMm: Number(e.target.value) })} />
            </Field>
            <Field label="Height (mm)" className="flex-1">
              <Input type="number" min={1} value={object.heightMm} onChange={(e) => patch({ heightMm: Number(e.target.value) })} />
            </Field>
          </Row>
          <Field label="Rotation (°)">
            <Input
              type="number"
              step={5}
              value={Math.round(object.rotationDeg)}
              onChange={(e) => patch({ rotationDeg: Number(e.target.value) })}
            />
          </Field>
        </>
      )}

      {object.kind === 'arrow' && (
          <Button
            onClick={() => {
              const dx = object.x2 - object.x1
              const dy = object.y2 - object.y1
              const len = Math.hypot(dx, dy) || 1
              // Drop the label just past the head, offset perpendicular to clear the line.
              const at = { x: object.x2 - (dy / len) * 0.6, y: object.y2 + (dx / len) * 0.6 }
              addObject({ ...makeText(at), label: formatInches(arrowLengthIn(object)) })
            }}
          >
            Add ' {formatInches(arrowLengthIn(object))} ' text
          </Button>
      )}

      {object.kind === 'rect' && (
        <>
          <Field label="Terrain preset">
            <Select
              value={presetIndex}
              onChange={(e) => {
                const i = Number(e.target.value)
                if (i < 0) return
                setLastRectPreset(i)
                patch({ lengthMm: RECT_PRESETS[i].lengthMm, widthMm: RECT_PRESETS[i].widthMm, label: RECT_PRESETS[i].name })
              }}
            >
              {presetIndex < 0 && <option value={-1}>Custom</option>}
              {RECT_PRESETS.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Row className="gap-2">
            <Field label="Length (mm)" className="flex-1">
              <Input type="number" min={1} value={object.lengthMm} onChange={(e) => patch({ lengthMm: Number(e.target.value) })} />
            </Field>
            <Field label="Width (mm)" className="flex-1">
              <Input type="number" min={1} value={object.widthMm} onChange={(e) => patch({ widthMm: Number(e.target.value) })} />
            </Field>
          </Row>
          <Field label="Rotation (°)">
            <Input
              type="number"
              step={5}
              value={Math.round(object.rotationDeg)}
              onChange={(e) => patch({ rotationDeg: Number(e.target.value) })}
            />
          </Field>
        </>
      )}

      {(object.kind === 'circle' || object.kind === 'ellipse' || object.kind === 'rect') && (
        <Field
          row
          label={
            <input
              type="checkbox"
              className="accent-accent"
              checked={!!object.showControlRange}
              onChange={(e) => patch({ showControlRange: e.target.checked })}
            />
          }
        >
          Show 1″ control range
        </Field>
      )}

      {canCloneToSlides && (
        <Button
          onClick={() => cloneObjectToAllSlides(object.id)}
          title="Copy this object onto every other slide that doesn't already have it"
        >
          Clone to all slides
        </Button>
      )}

      <Button variant="danger" onClick={() => deleteObject(object.id)} title="Delete (Del)">
        Delete object
      </Button>
    </Section>
  )
}

export function PlanTab({
  map,
  dropZone,
  setMap,
  setDropZone,
  tool,
  setTool,
  selectedObject,
  updateObject,
  deleteObject,
  setLastRectPreset,
  setLastColor,
  addObject,
  cloneObjectToAllSlides,
  slides,
  currentSlideId,
  selectSlide,
  addSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  renameSlide,
  disabled,
}: {
  map: AnnotatedMap
  dropZone: DropZone
  setMap: (id: string) => void
  setDropZone: (id: string) => void
  tool: Tool
  setTool: (t: Tool) => void
  selectedObject: SlideObject | null
  updateObject: (id: string, patch: Partial<SlideObject>) => void
  deleteObject: (id: string) => void
  setLastRectPreset: (i: number) => void
  setLastColor: (c: ObjectColor) => void
  addObject: (object: SlideObject) => void
  cloneObjectToAllSlides: (id: string) => void
  slides: Slide[]
  currentSlideId: string
  selectSlide: (id: string) => void
  addSlide: () => void
  duplicateSlide: (id: string) => void
  deleteSlide: (id: string) => void
  moveSlide: (id: string, dir: -1 | 1) => void
  renameSlide: (id: string, name: string) => void
  disabled: boolean
}) {
  return (
    <>
      <Section title="Map &amp; drop zone">
        <Field label="Map">
          <Select value={map.id} disabled={disabled} onChange={(e) => setMap(e.target.value)}>
            {maps.map((group) => (
              <optgroup key={group.name} label={group.name}>
                {group.maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.draft ? ' (draft annotation)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Drop zone">
          <Select value={dropZone.id} disabled={disabled} onChange={(e) => setDropZone(e.target.value)}>
            {map.dropZones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Hint>Set per slide — each slide can use a different map and drop zone.</Hint>
      </Section>

      <Section title="Tools">
        <div className="flex flex-nowrap gap-1">
          <ToolButton meta={TOOLS[0]} tool={tool} setTool={setTool} disabled={disabled} />
          <ShapeToolButton tool={tool} setTool={setTool} disabled={disabled} />
          {TOOLS.slice(1).map((meta) => (
            <ToolButton key={meta.tool} meta={meta} tool={tool} setTool={setTool} disabled={disabled} />
          ))}
        </div>
        {!disabled && tool === 'ellipse' && <Hint>Drag to size (snaps to a base); rotate with the handle once selected</Hint>}
        {!disabled && tool !== 'select' && tool !== 'ellipse' && <Hint>Click or click and drag to place object</Hint>}
      </Section>

      {selectedObject && !disabled && (
        <ObjectProps
          object={selectedObject}
          updateObject={updateObject}
          deleteObject={deleteObject}
          setLastRectPreset={setLastRectPreset}
          setLastColor={setLastColor}
          addObject={addObject}
          cloneObjectToAllSlides={cloneObjectToAllSlides}
          canCloneToSlides={slides.length > 1}
        />
      )}

      <Section title="Slides">
        <List className="gap-1.5">
          {slides.map((s, i) => (
            <li
              key={s.id}
              className={twMerge(
                'flex cursor-pointer items-stretch gap-1.5 rounded-md border border-edge bg-panel-2 p-1.5',
                s.id === currentSlideId && 'border-accent bg-blue-950',
              )}
              onClick={() => selectSlide(s.id)}
            >
              <Button title="Select" onClick={() => selectSlide(s.id)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                  {/* Icon from Iconoir by Luca Burgio - https://github.com/iconoir-icons/iconoir/blob/main/LICENSE */}
                  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                    <path d="m7.5 12l-2.004 2.672a2 2 0 0 0 .126 2.552l3.784 4.128c.378.413.912.648 1.473.648H15.5c2.4 0 4-2 4-4q0 0 0 0V9.429m-3 .571v-.571c0-2.286 3-2.286 3 0" />
                    <path d="M13.5 10V8.286c0-2.286 3-2.286 3 0V10m-6 0V7.5c0-2.286 3-2.286 3 0q0 0 0 0V10m-3 0V3.499A1.5 1.5 0 0 0 9 2v0a1.5 1.5 0 0 0-1.5 1.5V15" />
                  </g>
                </svg>
              </Button>
              <Input
                className="min-w-0 flex-1"
                value={s.name}
                disabled={disabled}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => renameSlide(s.id, e.target.value)}
              />
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-rows-2 grid-flow-col gap-0.5">
                  <Button className="leading-none text-xs" title="Move up" disabled={disabled || i === 0} onClick={() => moveSlide(s.id, -1)}>
                    ↑
                  </Button>
                  <Button className="leading-none text-xs" title="Move down" disabled={disabled || i === slides.length - 1} onClick={() => moveSlide(s.id, 1)}>
                    ↓
                  </Button>
                  <Button className="leading-none text-xs" title="Duplicate" disabled={disabled} onClick={() => duplicateSlide(s.id)}>
                    ⧉
                  </Button>
                  <Button
                    variant="danger"
                    className="leading-none text-xs"
                    title="Delete"
                    disabled={disabled}
                    onClick={() => {
                      if (window.confirm(`Delete "${s.name}"? This can't be undone.`)) deleteSlide(s.id)
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </List>
        <Button disabled={disabled} onClick={addSlide}>
          + Add slide
        </Button>
      </Section>
    </>
  )
}
