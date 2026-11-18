import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getEvent } from '../api/events'
import { getSeating, type Seating } from '../api/seating'
import FloorPlanEditor from '../components/seating/FloorPlanEditor'
import GuestAssignment from '../components/seating/GuestAssignment'

export default function SeatingPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'plan' | 'assign'>('plan')
  const [planDirty, setPlanDirty] = useState(false)

  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) })
  const seating = useQuery({ queryKey: ['seating', id], queryFn: () => getSeating(id) })

  // Avisa antes de salir con cambios del plano sin guardar.
  useEffect(() => {
    if (!planDirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [planDirty])

  const onSaved = useCallback(
    (s: Seating) => queryClient.setQueryData(['seating', id], s),
    [queryClient, id],
  )

  if (event.isPending || seating.isPending) return <main className="page">Cargando…</main>
  if (event.isError || seating.isError)
    return (
      <main className="page">
        <p className="error">{(event.error ?? seating.error)?.message}</p>
        <Link to="/app">Volver a mis eventos</Link>
      </main>
    )

  const s = seating.data
  const seatedCount = s.guests.filter((g) => g.tableId).length

  return (
    <main className="page wide">
      <div className="page-header">
        <div>
          <Link to={`/app/events/${id}`} className="back">
            ← {event.data.title}
          </Link>
          <h1>Mesas</h1>
          <p className="muted small">
            {seatedCount} de {s.guests.length} personas confirmadas tienen mesa.
          </p>
        </div>
      </div>

      <div className="tabs tabs-inline" role="tablist">
        <button role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? '' : 'secondary'} onClick={() => setTab('plan')}>
          Plano del salón
        </button>
        <button
          role="tab"
          aria-selected={tab === 'assign'}
          className={tab === 'assign' ? '' : 'secondary'}
          onClick={() => {
            if (planDirty && !confirm('Tienes cambios del plano sin guardar. Si cambias de pestaña se perderán. ¿Continuar?')) return
            setPlanDirty(false)
            setTab('assign')
          }}
        >
          Asignar invitados
        </button>
      </div>

      {tab === 'plan' ? (
        // key: al volver de "Asignar", el editor toma las ocupaciones actualizadas.
        <FloorPlanEditor key={JSON.stringify(s.tables.map((t) => [t.id, t.seated]))} eventId={id} seating={s} onSaved={onSaved} onDirtyChange={setPlanDirty} />
      ) : (
        <GuestAssignment eventId={id} seating={s} />
      )}
    </main>
  )
}
