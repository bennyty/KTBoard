import type { ReactElement } from 'react'
import type { ObjectColor, SlideObject, Slide } from '@/model/types'
import { OBJECT_COLORS } from '@/model/types'
import { RECT_PRESETS } from '@/model/constants'
import { COLOR_HEX, OBJECT_KIND_LABELS } from './objects'
import type { Tool } from './usePlan'

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

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: 'Select', key: 'V' },
  { tool: 'circle', label: 'Circle', key: 'C' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'arrow', label: 'Arrow', key: 'L' },
  { tool: 'text', label: 'Text', key: 'T' },
]

function ColorPicker({ value, onChange }: { value: ObjectColor; onChange: (c: ObjectColor) => void }) {
  return (
    <div className="swatches">
      {OBJECT_COLORS.map((c) => (
        <button
          key={c}
          className={`swatch${c === value ? ' selected' : ''}`}
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
}: {
  object: SlideObject
  updateObject: (id: string, patch: Partial<SlideObject>) => void
  deleteObject: (id: string) => void
  setLastRectPreset: (i: number) => void
}) {
  const patch = (p: Partial<SlideObject>) => updateObject(object.id, p)
  const presetIndex =
    object.kind === 'rect'
      ? RECT_PRESETS.findIndex((p) => p.lengthMm === object.lengthMm && p.widthMm === object.widthMm)
      : -1

  return (
    <section className="object-props">
      <h2>{OBJECT_KIND_LABELS[object.kind]}</h2>

      <label>
        Label
        <input value={object.label} onChange={(e) => patch({ label: e.target.value })} />
      </label>

      {object.kind !== 'text' && (
        <label>
          Color
          <ColorPicker value={object.color} onChange={(c) => patch({ color: c })} />
        </label>
      )}

      {object.kind === 'circle' && (
        <label>
          Size (mm)
          <input
            type="number"
            min={1}
            step={1}
            value={object.sizeMm}
            onChange={(e) => patch({ sizeMm: Number(e.target.value) })}
          />
        </label>
      )}

      {object.kind === 'rect' && (
        <>
          <label>
            Type
            <select
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
            </select>
          </label>
          <div className="row">
            <label>
              Length (mm)
              <input type="number" min={1} value={object.lengthMm} onChange={(e) => patch({ lengthMm: Number(e.target.value) })} />
            </label>
            <label>
              Width (mm)
              <input type="number" min={1} value={object.widthMm} onChange={(e) => patch({ widthMm: Number(e.target.value) })} />
            </label>
          </div>
          <label>
            Rotation (°)
            <input
              type="number"
              step={5}
              value={Math.round(object.rotationDeg)}
              onChange={(e) => patch({ rotationDeg: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      <button className="danger" onClick={() => deleteObject(object.id)} title="Delete (Del)">
        Delete object
      </button>
    </section>
  )
}

export function PlanTab({
  tool,
  setTool,
  selectedObject,
  updateObject,
  deleteObject,
  setLastRectPreset,
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
  tool: Tool
  setTool: (t: Tool) => void
  selectedObject: SlideObject | null
  updateObject: (id: string, patch: Partial<SlideObject>) => void
  deleteObject: (id: string) => void
  setLastRectPreset: (i: number) => void
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
      <section>
        <h2>Tools</h2>
        <div className="tool-palette">
          {TOOLS.map(({ tool: t, label, key }) => (
            <button
              key={t}
              className={`tool-button${tool === t ? ' selected' : ''}`}
              disabled={disabled && t !== 'select'}
              onClick={() => setTool(t)}
              title={`${label} (${key})`}
              aria-label={`${label} (${key})`}
            >
              {ICON[t]}
            </button>
          ))}
        </div>
        {!disabled && tool !== 'select' && <p className="hint">Click or click and drag to place object</p>}
      </section>

      {selectedObject && !disabled && (
        <ObjectProps
          object={selectedObject}
          updateObject={updateObject}
          deleteObject={deleteObject}
          setLastRectPreset={setLastRectPreset}
        />
      )}

      <section>
        <h2>Slides</h2>
        <ul className="slide-list">
          {slides.map((s, i) => (
            <li
              key={s.id}
              className={`slide-card${s.id === currentSlideId ? ' selected' : ''}`}
              onClick={() => selectSlide(s.id)}
            >
              <button title="Select" onClick={() => selectSlide(s.id)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                  {/* Icon from Iconoir by Luca Burgio - https://github.com/iconoir-icons/iconoir/blob/main/LICENSE */}
                  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                    <path d="m7.5 12l-2.004 2.672a2 2 0 0 0 .126 2.552l3.784 4.128c.378.413.912.648 1.473.648H15.5c2.4 0 4-2 4-4q0 0 0 0V9.429m-3 .571v-.571c0-2.286 3-2.286 3 0" />
                    <path d="M13.5 10V8.286c0-2.286 3-2.286 3 0V10m-6 0V7.5c0-2.286 3-2.286 3 0q0 0 0 0V10m-3 0V3.499A1.5 1.5 0 0 0 9 2v0a1.5 1.5 0 0 0-1.5 1.5V15" />
                  </g>
                </svg>
              </button>
              <input
                value={s.name}
                disabled={disabled}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => renameSlide(s.id, e.target.value)}
              />
              <div className="slide-actions" onClick={(e) => e.stopPropagation()}>
                <button title="Move up" disabled={disabled || i === 0} onClick={() => moveSlide(s.id, -1)}>
                  ↑
                </button>
                <button title="Move down" disabled={disabled || i === slides.length - 1} onClick={() => moveSlide(s.id, 1)}>
                  ↓
                </button>
                <button title="Duplicate" disabled={disabled} onClick={() => duplicateSlide(s.id)}>
                  ⧉
                </button>
                <button
                  className="danger"
                  title="Delete"
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm(`Delete "${s.name}"? This can't be undone.`)) deleteSlide(s.id)
                  }}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button disabled={disabled} onClick={addSlide}>
          + Add slide
        </button>
      </section>
    </>
  )
}
