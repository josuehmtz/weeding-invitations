import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { createEvent, eventStatusLabels, eventTypeLabels, getEvents } from '../api/events'
import EventForm from '../components/EventForm'
import { formatDateTime } from '../lib/dates'
import { plural } from '../lib/text'

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const events = useQuery({ queryKey: ['events'], queryFn: getEvents })

  const create = useMutation({
    mutationFn: createEvent,
    onSuccess: (ev) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      navigate(`/app/events/${ev.id}`)
    },
  })

  return (
    <main className="page">
      <div className="page-header">
        <h1>Mis eventos</h1>
        {!creating && <button onClick={() => setCreating(true)}>Nuevo evento</button>}
      </div>

      {creating && (
        <section className="card">
          <h2>Nuevo evento</h2>
          <EventForm
            submitLabel="Crear evento"
            pending={create.isPending}
            error={create.error?.message}
            onSubmit={(data) => create.mutate(data)}
            onCancel={() => setCreating(false)}
          />
        </section>
      )}

      {events.isPending && <p>Cargando…</p>}
      {events.isError && <p className="error">{events.error.message}</p>}
      {events.data?.length === 0 && !creating && (
        <p className="muted">Aún no tienes eventos. Crea el primero para empezar a cargar a tus invitados.</p>
      )}

      <ul className="event-list">
        {events.data?.map((ev) => (
          <li key={ev.id}>
            <Link to={`/app/events/${ev.id}`} className="card event-card">
              <div>
                <strong>{ev.title}</strong>
                <span className="muted">
                  {eventTypeLabels[ev.type]} · {formatDateTime(ev.startsAt)}
                  {ev.venueName && ` · ${ev.venueName}`}
                </span>
              </div>
              <div className="event-card-stats">
                <span className="badge">{eventStatusLabels[ev.status]}</span>
                <span>
                  {plural(ev.invitationCount, 'invitación', 'invitaciones')} ·{' '}
                  {plural(ev.totalPasses, 'invitado', 'invitados')}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
