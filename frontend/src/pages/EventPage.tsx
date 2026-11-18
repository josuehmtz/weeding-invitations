import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { deleteEvent, eventStatusLabels, eventTypeLabels, getEvent, updateEvent, type SaveEvent } from '../api/events'
import EventForm from '../components/EventForm'
import InvitationsPanel from '../components/InvitationsPanel'
import { formatDateTime } from '../lib/dates'
import { plural } from '../lib/text'

export default function EventPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) })

  const save = useMutation({
    mutationFn: (data: SaveEvent) => updateEvent(id, data),
    onSuccess: (ev) => {
      queryClient.setQueryData(['event', id], ev)
      queryClient.invalidateQueries({ queryKey: ['events'] })
      setEditing(false)
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      navigate('/app')
    },
  })

  if (event.isPending) return <main className="page">Cargando…</main>
  if (event.isError)
    return (
      <main className="page">
        <p className="error">{event.error.message}</p>
        <Link to="/app">Volver a mis eventos</Link>
      </main>
    )

  const ev = event.data
  const readOnly = ev.status === 'Archived'
  const remaining = Math.max(0, ev.passLimit - ev.totalPasses)
  const usage = ev.passLimit > 0 ? Math.min(100, (ev.totalPasses / ev.passLimit) * 100) : 0

  return (
    <main className="page">
      <Link to="/app" className="back">
        ← Mis eventos
      </Link>

      {editing ? (
        <section className="card">
          <h2>Editar evento</h2>
          <EventForm
            initial={ev}
            submitLabel="Guardar cambios"
            pending={save.isPending}
            error={save.error?.message}
            onSubmit={(data) => save.mutate(data)}
            onCancel={() => setEditing(false)}
          />
        </section>
      ) : (
        <section className="card">
          <div className="page-header">
            <div>
              <h1>{ev.title}</h1>
              <p className="muted">
                {eventTypeLabels[ev.type]} · {formatDateTime(ev.startsAt)}
                {ev.venueName && ` · ${ev.venueName}`}
              </p>
              {ev.rsvpDeadline && (
                <p className="muted">Confirmar asistencia antes del {formatDateTime(ev.rsvpDeadline)}</p>
              )}
            </div>
            <span className="badge">{eventStatusLabels[ev.status]}</span>
          </div>

          <div className="meter" aria-label="Invitados registrados">
            <div className="meter-label">
              <span>
                <strong>{ev.totalPasses}</strong> de {ev.passLimit} invitados
              </span>
              <span className="muted">{plural(ev.invitationCount, 'invitación', 'invitaciones')}</span>
            </div>
            <div className="meter-track">
              <div className={`meter-fill${usage >= 100 ? ' full' : ''}`} style={{ width: `${usage}%` }} />
            </div>
            {ev.status === 'Draft' && (
              <p className="muted small">
                Mientras el evento está en borrador puedes registrar hasta {ev.passLimit} invitados. Al pagar eliges
                el paquete según tu total.
              </p>
            )}
          </div>

          {!readOnly && (
            <div className="actions">
              <Link to={`/app/events/${ev.id}/design`} className="button">
                Diseñar invitación
              </Link>
              <button className="secondary" onClick={() => setEditing(true)}>
                Editar datos
              </button>
              {ev.status === 'Draft' && (
                <button
                  className="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`¿Eliminar "${ev.title}" y todas sus invitaciones? No se puede deshacer.`)) remove.mutate()
                  }}
                >
                  Eliminar evento
                </button>
              )}
            </div>
          )}
          {remove.error && <p className="error">{remove.error.message}</p>}
        </section>
      )}

      <InvitationsPanel eventId={ev.id} remainingPasses={remaining} readOnly={readOnly} />
    </main>
  )
}
