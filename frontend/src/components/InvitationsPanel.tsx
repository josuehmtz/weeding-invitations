import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import {
  createInvitation,
  deleteInvitation,
  getInvitations,
  invitationUrl,
  rsvpLabels,
  setRsvp,
  updateInvitation,
  type Invitation,
  type ManualRsvp,
  type RsvpStatus,
  type SaveInvitation,
} from '../api/invitations'
import { whatsAppLink } from '../lib/whatsapp'

interface Props {
  eventId: string
  eventTitle: string
  rsvpDeadline: string | null
  remainingPasses: number
  readOnly: boolean
}

type Filter = 'all' | RsvpStatus
type RowMode = { id: string; mode: 'edit' | 'rsvp' } | null

const filterLabels: Record<Filter, string> = {
  all: 'Todas',
  Pending: 'Pendientes',
  Confirmed: 'Confirmadas',
  Declined: 'No asistirán',
}

const shortDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' })

export default function InvitationsPanel({ eventId, eventTitle, rsvpDeadline, remainingPasses, readOnly }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [row, setRow] = useState<RowMode>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const invitations = useQuery({
    queryKey: ['invitations', eventId],
    queryFn: () => getInvitations(eventId),
  })

  // Cualquier cambio en invitaciones también cambia los totales del evento.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['invitations', eventId] })
    queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    queryClient.invalidateQueries({ queryKey: ['events'] })
  }
  const closeRowAndRefresh = () => {
    setRow(null)
    refresh()
  }

  const create = useMutation({
    mutationFn: (data: SaveInvitation) => createInvitation(eventId, data),
    onSuccess: refresh,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SaveInvitation }) => updateInvitation(eventId, id, data),
    onSuccess: closeRowAndRefresh,
  })
  const answer = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ManualRsvp }) => setRsvp(eventId, id, data),
    onSuccess: closeRowAndRefresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteInvitation(eventId, id),
    onSuccess: refresh,
  })

  const copyLink = async (inv: Invitation) => {
    await navigator.clipboard.writeText(invitationUrl(inv.token))
    setCopiedId(inv.id)
    setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 2000)
  }

  const whatsAppText = (inv: Invitation) => {
    const url = invitationUrl(inv.token)
    if (inv.rsvpStatus === 'Pending' && rsvpDeadline)
      return `¡Hola ${inv.displayName}! Te recordamos confirmar tu asistencia a "${eventTitle}" antes del ${shortDate.format(new Date(rsvpDeadline))}. Aquí está tu invitación: ${url}`
    return `¡Hola ${inv.displayName}! Te compartimos tu invitación a "${eventTitle}": ${url}`
  }

  const all = invitations.data ?? []
  const counts: Record<Filter, number> = {
    all: all.length,
    Pending: all.filter((i) => i.rsvpStatus === 'Pending').length,
    Confirmed: all.filter((i) => i.rsvpStatus === 'Confirmed').length,
    Declined: all.filter((i) => i.rsvpStatus === 'Declined').length,
  }
  const term = search.trim().toLowerCase()
  const visible = all.filter(
    (i) =>
      (filter === 'all' || i.rsvpStatus === filter) &&
      (!term || i.displayName.toLowerCase().includes(term) || i.guestNames.some((n) => n.toLowerCase().includes(term))),
  )

  return (
    <section className="card">
      <div className="page-header">
        <h2>Invitaciones</h2>
        <input
          type="search"
          placeholder="Buscar invitación o persona…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar invitación"
        />
      </div>

      {!readOnly && (
        <InvitationRowForm
          key={create.submittedAt}
          submitLabel="Agregar"
          pending={create.isPending}
          maxPasses={Math.max(1, Math.min(50, remainingPasses))}
          onSubmit={(data) => create.mutate(data)}
        />
      )}
      {[create, update, answer, remove].map(
        (m, i) => m.error && <p key={i} className="error">{m.error.message}</p>,
      )}

      {all.length > 0 && (
        <div className="chips" role="tablist" aria-label="Filtrar por confirmación">
          {(Object.keys(filterLabels) as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`chip${filter === f ? ' selected' : ''}`}
              onClick={() => setFilter(f)}
            >
              {filterLabels[f]} <span className="chip-count">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {invitations.isPending && <p>Cargando…</p>}
      {invitations.isError && <p className="error">{invitations.error.message}</p>}
      {all.length === 0 && invitations.isSuccess && (
        <p className="muted">
          Agrega una invitación por familia o grupo, por ejemplo "Familia Pérez" con 4 pases.
        </p>
      )}
      {all.length > 0 && visible.length === 0 && <p className="muted">No hay invitaciones con ese filtro.</p>}

      {visible.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invitación</th>
                <th className="num">Pases</th>
                <th className="hide-sm">Teléfono</th>
                <th>Confirmación</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => {
                if (row?.id === inv.id)
                  return (
                    <tr key={inv.id}>
                      <td colSpan={5}>
                        {row.mode === 'edit' ? (
                          <InvitationRowForm
                            initial={inv}
                            submitLabel="Guardar"
                            pending={update.isPending}
                            maxPasses={Math.min(50, inv.passes + remainingPasses)}
                            onSubmit={(data) => update.mutate({ id: inv.id, data })}
                            onCancel={() => setRow(null)}
                          />
                        ) : (
                          <ManualRsvpForm
                            invitation={inv}
                            pending={answer.isPending}
                            onSubmit={(data) => answer.mutate({ id: inv.id, data })}
                            onCancel={() => setRow(null)}
                          />
                        )}
                      </td>
                    </tr>
                  )

                const wa = whatsAppLink(inv.phone, whatsAppText(inv))
                return (
                  <tr key={inv.id}>
                    <td>
                      <div>{inv.displayName}</div>
                      {inv.rsvpStatus === 'Confirmed' && inv.guestNames.length > 0 && (
                        <div className="muted small">{inv.guestNames.join(', ')}</div>
                      )}
                      {inv.message && <div className="guest-message small">“{inv.message}”</div>}
                    </td>
                    <td className="num">
                      {inv.rsvpStatus === 'Confirmed' ? `${inv.confirmedPasses}/${inv.passes}` : inv.passes}
                      <span className="show-sm muted"> {inv.passes === 1 ? 'pase' : 'pases'}</span>
                    </td>
                    <td className="hide-sm phone">{inv.phone ?? <span className="muted">—</span>}</td>
                    <td>
                      <span className={`badge rsvp-${inv.rsvpStatus.toLowerCase()}`}>{rsvpLabels[inv.rsvpStatus]}</span>
                    </td>
                    <td className="row-actions">
                      <a className="button secondary small" href={`/i/${inv.token}`} target="_blank" rel="noreferrer">
                        Ver
                      </a>
                      <button className="secondary small" onClick={() => copyLink(inv)}>
                        {copiedId === inv.id ? '¡Copiado!' : 'Copiar link'}
                      </button>
                      {wa && (
                        <a className="button secondary small" href={wa} target="_blank" rel="noreferrer">
                          {inv.rsvpStatus === 'Pending' && rsvpDeadline ? 'Recordar' : 'WhatsApp'}
                        </a>
                      )}
                      {!readOnly && (
                        <>
                          <button className="secondary small" onClick={() => setRow({ id: inv.id, mode: 'rsvp' })}>
                            Respuesta
                          </button>
                          <button className="secondary small" onClick={() => setRow({ id: inv.id, mode: 'edit' })}>
                            Editar
                          </button>
                          <button
                            className="danger small"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (confirm(`¿Eliminar la invitación "${inv.displayName}"?`)) remove.mutate(inv.id)
                            }}
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

interface RowFormProps {
  initial?: Invitation
  submitLabel: string
  pending: boolean
  maxPasses: number
  onSubmit: (data: SaveInvitation) => void
  onCancel?: () => void
}

function InvitationRowForm({ initial, submitLabel, pending, maxPasses, onSubmit, onCancel }: RowFormProps) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [passes, setPasses] = useState(initial?.passes ?? 1)
  const [phone, setPhone] = useState(initial?.phone ?? '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({ displayName, passes, phone: phone || null })
  }

  return (
    <form onSubmit={submit} className="row-form">
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Familia Pérez"
        aria-label="Nombre de la invitación"
        required
        maxLength={200}
      />
      <input
        type="number"
        value={passes}
        onChange={(e) => setPasses(Number(e.target.value))}
        min={Math.max(1, initial?.confirmedPasses ?? 1)}
        max={maxPasses}
        aria-label="Pases"
        required
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="WhatsApp (opcional)"
        aria-label="Teléfono"
        maxLength={20}
      />
      <button type="submit" disabled={pending}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      )}
    </form>
  )
}

/** El cliente registra la respuesta que recibió por otro medio (llamada, mensaje). */
function ManualRsvpForm({ invitation, pending, onSubmit, onCancel }: {
  invitation: Invitation
  pending: boolean
  onSubmit: (data: ManualRsvp) => void
  onCancel: () => void
}) {
  const [attending, setAttending] = useState(invitation.rsvpStatus !== 'Declined')
  const [count, setCount] = useState(invitation.confirmedPasses || invitation.passes)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({ attending, confirmedPasses: attending ? count : 0 })
  }

  return (
    <form onSubmit={submit} className="row-form rsvp-form">
      <strong>{invitation.displayName}</strong>
      <select value={attending ? 'yes' : 'no'} onChange={(e) => setAttending(e.target.value === 'yes')} aria-label="Respuesta">
        <option value="yes">Asistirá</option>
        <option value="no">No asistirá</option>
      </select>
      {attending ? (
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Personas que asistirán">
          {Array.from({ length: invitation.passes }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} de {invitation.passes}
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}
      <button type="submit" disabled={pending}>
        Guardar
      </button>
      <button type="button" className="secondary" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  )
}
