import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { assignSeats, type Move, type SeatGuest, type Seating, type SeatTable } from '../../api/seating'

interface Props {
  eventId: string
  seating: Seating
}

const UNASSIGNED = 'unassigned'

/** Qué se arrastra: una persona, o todas las personas sin mesa de una invitación. */
type DragData = { kind: 'guest'; guestIds: string[]; label: string } | { kind: 'group'; guestIds: string[]; label: string }

/**
 * Reparto de personas confirmadas en mesas. Se puede arrastrar (escritorio y celular)
 * o tocar una persona y luego la mesa.
 */
export default function GuestAssignment({ eventId, seating }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState<DragData | null>(null)
  const [picked, setPicked] = useState<DragData | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  const assign = useMutation({
    mutationFn: (moves: Move[]) => assignSeats(eventId, moves),
    // Actualización optimista: la persona aparece en la mesa al instante.
    onMutate: async (moves) => {
      await queryClient.cancelQueries({ queryKey: ['seating', eventId] })
      const previous = queryClient.getQueryData<Seating>(['seating', eventId])
      if (previous) queryClient.setQueryData(['seating', eventId], applyMoves(previous, moves))
      return { previous }
    },
    onError: (_err, _moves, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['seating', eventId], ctx.previous)
    },
    onSuccess: (s) => queryClient.setQueryData(['seating', eventId], s),
  })

  const moveTo = (data: DragData, tableId: string | null) => {
    const moves = data.guestIds
      .filter((id) => seating.guests.find((g) => g.id === id)?.tableId !== tableId)
      .map((guestId) => ({ guestId, tableId }))
    if (moves.length > 0) assign.mutate(moves)
    setPicked(null)
  }

  const onDragStart = (e: DragStartEvent) => setDragging(e.active.data.current as DragData)
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (!e.over) return
    const target = String(e.over.id)
    moveTo(e.active.data.current as DragData, target === UNASSIGNED ? null : target)
  }

  const labelOf = (data: unknown) => (data as DragData | undefined)?.label ?? 'la persona'
  const targetName = (id: string | number) => {
    if (id === UNASSIGNED) return 'Sin mesa'
    const t = seating.tables.find((x) => x.id === id)
    return t ? `la mesa ${t.number}` : 'una mesa'
  }

  const term = search.trim().toLowerCase()
  const matches = (g: SeatGuest) => !term || g.name.toLowerCase().includes(term) || g.invitationName.toLowerCase().includes(term)
  const unassigned = seating.guests.filter((g) => g.tableId === null && matches(g))
  const groups = groupBy(unassigned, (g) => g.invitationId)
  const totalUnassigned = seating.guests.filter((g) => g.tableId === null).length

  if (seating.tables.length === 0)
    return <p className="muted">Primero agrega mesas en la pestaña "Plano del salón" y guarda el plano.</p>

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'Para mover, presiona espacio o enter; usa las flechas y vuelve a presionar espacio para soltar. Escape cancela.',
        },
        announcements: {
          onDragStart: ({ active }) => `Tomaste a ${labelOf(active.data.current)}.`,
          onDragOver: ({ active, over }) => (over ? `${labelOf(active.data.current)} sobre ${targetName(over.id)}.` : undefined),
          onDragEnd: ({ active, over }) =>
            over ? `${labelOf(active.data.current)} se movió a ${targetName(over.id)}.` : `${labelOf(active.data.current)} se soltó fuera de una mesa.`,
          onDragCancel: ({ active }) => `Se canceló el movimiento de ${labelOf(active.data.current)}.`,
        },
      }}
    >
      {assign.error && <p className="error">{assign.error.message}</p>}
      {picked && (
        <p className="pick-hint" role="status">
          Toca la mesa para <strong>{picked.label}</strong> ·{' '}
          <button className="link" onClick={() => setPicked(null)}>
            cancelar
          </button>
        </p>
      )}

      <div className="assign-layout">
        <UnassignedColumn
          active={picked !== null}
          onPick={() => picked && moveTo(picked, null)}
        >
          <div className="assign-column-header">
            <h3>Sin mesa ({totalUnassigned})</h3>
            <input type="search" placeholder="Buscar persona…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar persona" />
          </div>
          {seating.pendingInvitations > 0 && (
            <p className="muted small">
              {seating.pendingInvitations} {seating.pendingInvitations === 1 ? 'invitación' : 'invitaciones'} sin confirmar (
              {seating.pendingPasses} lugares). Sus personas aparecerán aquí al confirmar.
            </p>
          )}
          {seating.guests.length === 0 && <p className="muted">Aún no hay personas confirmadas.</p>}
          {totalUnassigned === 0 && seating.guests.length > 0 && <p className="muted">¡Todas las personas confirmadas tienen mesa!</p>}
          {groups.map(([invitationId, guests]) => (
            <div key={invitationId} className="assign-group">
              <Draggable
                id={`group-${invitationId}`}
                data={{ kind: 'group', guestIds: guests.map((g) => g.id), label: `${guests[0].invitationName} (${guests.length})` }}
                picked={picked}
                onPick={setPicked}
                className="assign-group-title"
              >
                {guests[0].invitationName} <span className="muted">· {guests.length}</span>
              </Draggable>
              <div className="assign-chips">
                {guests.map((g) => (
                  <GuestChip key={g.id} guest={g} picked={picked} onPick={setPicked} />
                ))}
              </div>
            </div>
          ))}
        </UnassignedColumn>

        <div className="assign-tables">
          {seating.tables.map((t) => (
            <TableCard
              key={t.id}
              table={t}
              guests={seating.guests.filter((g) => g.tableId === t.id)}
              picked={picked}
              onPick={setPicked}
              onDropPicked={() => picked && moveTo(picked, t.id)}
              highlight={term.length > 0 && seating.guests.some((g) => g.tableId === t.id && matches(g))}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>{dragging && <div className="chip-overlay">{dragging.label}</div>}</DragOverlay>
    </DndContext>
  )
}

function UnassignedColumn({ children, active, onPick }: { children: React.ReactNode; active: boolean; onPick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED })
  return (
    <section
      ref={setNodeRef}
      className={`card assign-unassigned${isOver ? ' over' : ''}${active ? ' pick-target' : ''}`}
      onClick={(e) => active && e.target === e.currentTarget && onPick()}
    >
      {children}
    </section>
  )
}

function TableCard({ table, guests, picked, onPick, onDropPicked, highlight }: {
  table: SeatTable
  guests: SeatGuest[]
  picked: DragData | null
  onPick: (d: DragData | null) => void
  onDropPicked: () => void
  highlight: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: table.id })
  const free = table.capacity - guests.length
  const fits = picked ? picked.guestIds.filter((id) => !guests.some((g) => g.id === id)).length <= free : true

  return (
    <section
      ref={setNodeRef}
      className={`card table-card${isOver ? ' over' : ''}${picked ? (fits ? ' pick-target' : ' pick-full') : ''}${highlight ? ' highlight' : ''}`}
      onClick={() => picked && onDropPicked()}
    >
      <header className="table-card-header">
        <strong>
          Mesa {table.number}
          {table.label && <span className="muted"> · {table.label}</span>}
        </strong>
        <span className={free === 0 ? 'full' : 'muted'}>
          {guests.length}/{table.capacity}
        </span>
      </header>
      <div className="table-card-bar" aria-hidden>
        <div style={{ width: `${Math.min(100, (guests.length / table.capacity) * 100)}%` }} className={free === 0 ? 'full' : ''} />
      </div>
      <div className="assign-chips">
        {guests.map((g) => (
          <GuestChip key={g.id} guest={g} picked={picked} onPick={onPick} />
        ))}
        {guests.length === 0 && <span className="muted small">Arrastra personas aquí</span>}
      </div>
    </section>
  )
}

function GuestChip({ guest, picked, onPick }: { guest: SeatGuest; picked: DragData | null; onPick: (d: DragData | null) => void }) {
  return (
    <Draggable
      id={`guest-${guest.id}`}
      data={{ kind: 'guest', guestIds: [guest.id], label: guest.name }}
      picked={picked}
      onPick={onPick}
      className="chip-guest"
      title={guest.invitationName}
    >
      {guest.name}
    </Draggable>
  )
}

function Draggable({ id, data, picked, onPick, className, title, children }: {
  id: string
  data: DragData
  picked: DragData | null
  onPick: (d: DragData | null) => void
  className: string
  title?: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data })
  const isPicked = picked !== null && picked.guestIds.join() === data.guestIds.join()
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${className}${isDragging ? ' dragging' : ''}${isPicked ? ' picked' : ''}`}
      title={title}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onPick(isPicked ? null : data)
      }}
    >
      {children}
    </button>
  )
}

function applyMoves(s: Seating, moves: Move[]): Seating {
  const byGuest = new Map(moves.map((m) => [m.guestId, m.tableId]))
  const guests = s.guests.map((g) => (byGuest.has(g.id) ? { ...g, tableId: byGuest.get(g.id)! } : g))
  const seated = new Map<string, number>()
  for (const g of guests) if (g.tableId) seated.set(g.tableId, (seated.get(g.tableId) ?? 0) + 1)
  return { ...s, guests, tables: s.tables.map((t) => ({ ...t, seated: seated.get(t.id) ?? 0 })) }
}

function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item])
  return [...map.entries()]
}
