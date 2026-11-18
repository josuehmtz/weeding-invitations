import { useMutation } from '@tanstack/react-query'
import type Konva from 'konva'
import { useEffect, useRef, useState } from 'react'
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import {
  elementKinds,
  savePlan,
  shapeLabels,
  type ElementKind,
  type LayoutElement,
  type Seating,
  type SeatingLayout,
  type TableShape,
} from '../../api/seating'
import { clamp, seatPositions, tableSize } from './geometry'
import { useThemeColors, type ThemeColors } from './useThemeColors'

interface DraftTable {
  key: string
  id?: string
  number: number
  label: string | null
  shape: TableShape
  capacity: number
  x: number
  y: number
  rotation: number
  seated: number
}

type Selection = { type: 'table' | 'element'; key: string } | null

interface Props {
  eventId: string
  seating: Seating
  onSaved: (s: Seating) => void
  onDirtyChange: (dirty: boolean) => void
}

const toDrafts = (s: Seating): DraftTable[] => s.tables.map((t) => ({ ...t, key: t.id }))
let newKey = 0

export default function FloorPlanEditor({ eventId, seating, onSaved, onDirtyChange }: Props) {
  const colors = useThemeColors()
  const [layout, setLayout] = useState<SeatingLayout>(seating.layout)
  const [tables, setTables] = useState<DraftTable[]>(() => toDrafts(seating))
  const [selected, setSelected] = useState<Selection>(null)
  const [snapshot, setSnapshot] = useState(() => JSON.stringify({ layout: seating.layout, tables: toDrafts(seating) }))
  const dirty = JSON.stringify({ layout, tables }) !== snapshot

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  // Ancho disponible → escala del plano.
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = width / layout.width

  const save = useMutation({
    mutationFn: () =>
      savePlan(
        eventId,
        layout,
        tables.map(({ id, number, label, shape, capacity, x, y, rotation }) => ({ id, number, label, shape, capacity, x, y, rotation })),
      ),
    onSuccess: (s) => {
      const drafts = toDrafts(s)
      setLayout(s.layout)
      setTables(drafts)
      setSnapshot(JSON.stringify({ layout: s.layout, tables: drafts }))
      setSelected(null)
      onSaved(s)
    },
  })

  const updateTable = (key: string, patch: Partial<DraftTable>) =>
    setTables((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)))
  const updateElement = (id: string, patch: Partial<LayoutElement>) =>
    setLayout((l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))

  const spawnPoint = (count: number) => ({
    x: clamp(layout.width / 2 + ((count % 5) - 2) * 40, 60, layout.width - 60),
    y: clamp(layout.height / 2 + (Math.floor(count / 5) % 4) * 40 - 60, 60, layout.height - 60),
  })

  const addTable = (shape: TableShape) => {
    const key = `new-${++newKey}`
    const number = tables.reduce((m, t) => Math.max(m, t.number), 0) + 1
    const capacity = shape === 'Rectangle' ? 8 : 10
    setTables((ts) => [...ts, { key, number, label: null, shape, capacity, rotation: 0, seated: 0, ...spawnPoint(ts.length) }])
    setSelected({ type: 'table', key })
  }

  const addElement = (kind: ElementKind) => {
    const id = `el-${Date.now().toString(36)}`
    const k = elementKinds[kind]
    setLayout((l) => ({
      ...l,
      elements: [...l.elements, { id, kind, label: k.label, width: k.width, height: k.height, rotation: 0, ...spawnPoint(l.elements.length) }],
    }))
    setSelected({ type: 'element', key: id })
  }

  const removeSelected = () => {
    if (!selected) return
    if (selected.type === 'table') {
      const t = tables.find((x) => x.key === selected.key)
      if (t && t.seated > 0 && !confirm(`La mesa ${t.number} tiene ${t.seated} invitados sentados. Al guardar quedarán sin mesa. ¿Eliminarla?`))
        return
      setTables((ts) => ts.filter((x) => x.key !== selected.key))
    } else {
      setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== selected.key) }))
    }
    setSelected(null)
  }

  // Suprimir/Backspace elimina lo seleccionado (si no se está escribiendo en un campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Transformer: rotar mesas; mover, rotar y redimensionar elementos.
  const trRef = useRef<Konva.Transformer>(null)
  const stageRef = useRef<Konva.Stage>(null)
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node = selected ? stage.findOne(`#${selected.key}`) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selected, tables, layout])

  const selectedTable = selected?.type === 'table' ? tables.find((t) => t.key === selected.key) : undefined
  const selectedElement = selected?.type === 'element' ? layout.elements.find((e) => e.id === selected.key) : undefined
  const usedNumbers = new Set(tables.filter((t) => t.key !== selectedTable?.key).map((t) => t.number))
  const totalSeats = tables.reduce((s, t) => s + t.capacity, 0)

  return (
    <div className="plan-editor">
      <div className="plan-toolbar">
        <div className="plan-tools">
          <span className="muted small">Mesas:</span>
          {(Object.keys(shapeLabels) as TableShape[]).map((s) => (
            <button key={s} className="secondary small" onClick={() => addTable(s)}>
              + {shapeLabels[s]}
            </button>
          ))}
        </div>
        <div className="plan-tools">
          <span className="muted small">Salón:</span>
          {(Object.keys(elementKinds) as ElementKind[]).map((k) => (
            <button key={k} className="secondary small" onClick={() => addElement(k)}>
              + {elementKinds[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="plan-body">
        <div className="plan-canvas" ref={containerRef}>
          <Stage
            ref={stageRef}
            width={width}
            height={layout.height * scale}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={(e) => e.target === e.target.getStage() && setSelected(null)}
            onTouchStart={(e) => e.target === e.target.getStage() && setSelected(null)}
          >
            <Layer>
              <Room layout={layout} colors={colors} onClick={() => setSelected(null)} />
              {layout.elements.map((el) => (
                <ElementShape
                  key={el.id}
                  element={el}
                  layout={layout}
                  colors={colors}
                  selected={selected?.key === el.id}
                  onSelect={() => setSelected({ type: 'element', key: el.id })}
                  onChange={(patch) => updateElement(el.id, patch)}
                />
              ))}
              {tables.map((t) => (
                <TableShapeNode
                  key={t.key}
                  table={t}
                  layout={layout}
                  colors={colors}
                  selected={selected?.key === t.key}
                  onSelect={() => setSelected({ type: 'table', key: t.key })}
                  onChange={(patch) => updateTable(t.key, patch)}
                />
              ))}
              <Transformer
                ref={trRef}
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                rotateEnabled
                enabledAnchors={selected?.type === 'element' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center'] : []}
                borderStroke={colors.accent}
                anchorStroke={colors.accent}
                anchorFill={colors.surface}
                ignoreStroke
                boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
              />
            </Layer>
          </Stage>
          <p className="muted small">
            {tables.length} {tables.length === 1 ? 'mesa' : 'mesas'} · {totalSeats} lugares · {seating.guests.length} personas confirmadas.
            Arrastra para mover; selecciona para girar, editar o eliminar (tecla Supr).
          </p>
        </div>

        <aside className="plan-side card">
          {selectedTable ? (
            <TablePanel
              table={selectedTable}
              usedNumbers={usedNumbers}
              onChange={(patch) => updateTable(selectedTable.key, patch)}
              onRemove={removeSelected}
            />
          ) : selectedElement ? (
            <div className="form">
              <h3>{elementKinds[selectedElement.kind].label}</h3>
              <label>
                Nombre
                <input value={selectedElement.label} maxLength={40} onChange={(e) => updateElement(selectedElement.id, { label: e.target.value })} />
              </label>
              <button className="danger" onClick={removeSelected}>
                Eliminar
              </button>
            </div>
          ) : (
            <div className="form">
              <h3>Salón</h3>
              <p className="muted small">Selecciona una mesa o elemento para editarlo. Ajusta la proporción del salón:</p>
              <div className="grid-2">
                <label>
                  Ancho
                  <input type="number" min={200} max={5000} step={50} value={layout.width}
                    onChange={(e) => setLayout((l) => ({ ...l, width: clamp(Number(e.target.value) || 200, 200, 5000) }))} />
                </label>
                <label>
                  Largo
                  <input type="number" min={200} max={5000} step={50} value={layout.height}
                    onChange={(e) => setLayout((l) => ({ ...l, height: clamp(Number(e.target.value) || 200, 200, 5000) }))} />
                </label>
              </div>
            </div>
          )}

          <div className="plan-save">
            {save.error && <p className="error small">{save.error.message}</p>}
            <span className="muted small">{save.isPending ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Todo guardado'}</span>
            <button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              Guardar plano
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Room({ layout, colors, onClick }: { layout: SeatingLayout; colors: ThemeColors; onClick: () => void }) {
  const step = 50
  const lines = []
  for (let x = step; x < layout.width; x += step) lines.push(<Line key={`v${x}`} points={[x, 0, x, layout.height]} stroke={colors.border} strokeWidth={0.5} opacity={0.6} listening={false} />)
  for (let y = step; y < layout.height; y += step) lines.push(<Line key={`h${y}`} points={[0, y, layout.width, y]} stroke={colors.border} strokeWidth={0.5} opacity={0.6} listening={false} />)
  return (
    <>
      <Rect width={layout.width} height={layout.height} fill={colors.bg} stroke={colors.border} strokeWidth={2} onClick={onClick} onTap={onClick} />
      {lines}
    </>
  )
}

function TableShapeNode({ table, layout, colors, selected, onSelect, onChange }: {
  table: DraftTable
  layout: SeatingLayout
  colors: ThemeColors
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<DraftTable>) => void
}) {
  const { width, height } = tableSize(table.shape, table.capacity)
  const full = table.seated >= table.capacity
  const fill = table.seated === 0 ? colors.surface : colors.accentSoft
  const stroke = selected ? colors.accent : full ? colors.ok : colors.muted

  return (
    <Group
      id={table.key}
      x={table.x}
      y={table.y}
      rotation={table.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onSelect}
      onDragMove={(e) => {
        const n = e.target
        n.x(clamp(n.x(), 20, layout.width - 20))
        n.y(clamp(n.y(), 20, layout.height - 20))
      }}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => onChange({ rotation: Math.round(e.target.rotation()) })}
    >
      {seatPositions(table.shape, table.capacity).map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={7} fill={i < table.seated ? colors.accent : colors.surface} stroke={colors.muted} strokeWidth={1} />
      ))}
      {table.shape === 'Round' ? (
        <Circle radius={width / 2} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 2} />
      ) : (
        <Rect x={-width / 2} y={-height / 2} width={width} height={height} cornerRadius={6} fill={fill} stroke={stroke} strokeWidth={selected ? 3 : 2} />
      )}
      {/* El texto no gira con la mesa para que siempre se lea derecho. */}
      <Group rotation={-table.rotation}>
        <Text text={String(table.number)} fontSize={20} fontStyle="bold" fill={colors.text} width={80} x={-40} y={table.label ? -16 : -10} align="center" listening={false} />
        {table.label && <Text text={table.label} fontSize={11} fill={colors.muted} width={100} x={-50} y={6} align="center" listening={false} />}
        <Text text={`${table.seated}/${table.capacity}`} fontSize={10} fill={colors.muted} width={60} x={-30} y={table.label ? 20 : 12} align="center" listening={false} />
      </Group>
    </Group>
  )
}

function ElementShape({ element, layout, colors, selected, onSelect, onChange }: {
  element: LayoutElement
  layout: SeatingLayout
  colors: ThemeColors
  selected: boolean
  onSelect: () => void
  onChange: (patch: Partial<LayoutElement>) => void
}) {
  return (
    <Group
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onSelect}
      onDragMove={(e) => {
        const n = e.target
        n.x(clamp(n.x(), 0, layout.width))
        n.y(clamp(n.y(), 0, layout.height))
      }}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        // El Transformer escala el nodo: convertimos la escala en ancho/alto y la regresamos a 1.
        const n = e.target
        const patch = {
          x: n.x(),
          y: n.y(),
          rotation: Math.round(n.rotation()),
          width: Math.max(20, Math.round(element.width * n.scaleX())),
          height: Math.max(20, Math.round(element.height * n.scaleY())),
        }
        n.scaleX(1)
        n.scaleY(1)
        onChange(patch)
      }}
    >
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill={element.kind === 'dancefloor' ? colors.accentSoft : colors.surface}
        stroke={selected ? colors.accent : colors.muted}
        strokeWidth={selected ? 2 : 1}
        dash={element.kind === 'entrance' ? [6, 4] : undefined}
        cornerRadius={4}
      />
      <Text
        text={element.label}
        fontSize={14}
        fill={colors.muted}
        width={element.width}
        height={element.height}
        x={-element.width / 2}
        y={-element.height / 2}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  )
}

function TablePanel({ table, usedNumbers, onChange, onRemove }: {
  table: DraftTable
  usedNumbers: Set<number>
  onChange: (patch: Partial<DraftTable>) => void
  onRemove: () => void
}) {
  const numberTaken = usedNumbers.has(table.number)
  return (
    <div className="form">
      <h3>Mesa {table.number}</h3>
      <div className="grid-2">
        <label>
          Número
          <input type="number" min={1} max={999} value={table.number} onChange={(e) => onChange({ number: Number(e.target.value) || 1 })} />
        </label>
        <label>
          Lugares
          <input
            type="number"
            min={Math.max(1, table.seated)}
            max={30}
            value={table.capacity}
            onChange={(e) => onChange({ capacity: clamp(Number(e.target.value) || 1, Math.max(1, table.seated), 30) })}
          />
        </label>
      </div>
      {numberTaken && <p className="error small">Ya hay otra mesa con el número {table.number}.</p>}
      <label>
        Nombre (opcional)
        <input value={table.label ?? ''} placeholder="Honor, Novios, Niños…" maxLength={40} onChange={(e) => onChange({ label: e.target.value || null })} />
      </label>
      <label>
        Forma
        <select value={table.shape} onChange={(e) => onChange({ shape: e.target.value as TableShape })}>
          {(Object.keys(shapeLabels) as TableShape[]).map((s) => (
            <option key={s} value={s}>
              {shapeLabels[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button className="secondary small" onClick={() => onChange({ rotation: (table.rotation + 315) % 360 })} aria-label="Girar a la izquierda">
          ↺ 45°
        </button>
        <button className="secondary small" onClick={() => onChange({ rotation: (table.rotation + 45) % 360 })} aria-label="Girar a la derecha">
          ↻ 45°
        </button>
      </div>
      {table.seated > 0 && (
        <p className="muted small">
          {table.seated} {table.seated === 1 ? 'invitado sentado' : 'invitados sentados'} en esta mesa.
        </p>
      )}
      <button className="danger" onClick={onRemove}>
        Eliminar mesa
      </button>
    </div>
  )
}
