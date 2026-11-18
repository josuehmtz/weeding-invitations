import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import {
  createInvitation,
  deleteInvitation,
  getInvitations,
  invitationUrl,
  rsvpLabels,
  updateInvitation,
  type Invitation,
  type SaveInvitation,
} from '../api/invitations'

interface Props {
  eventId: string
  remainingPasses: number
  readOnly: boolean
}

export default function InvitationsPanel({ eventId, remainingPasses, readOnly }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
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

  const create = useMutation({
    mutationFn: (data: SaveInvitation) => createInvitation(eventId, data),
    onSuccess: refresh,
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SaveInvitation }) => updateInvitation(eventId, id, data),
    onSuccess: () => {
      setEditingId(null)
      refresh()
    },
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

  const term = search.trim().toLowerCase()
  const visible = invitations.data?.filter((i) => !term || i.displayName.toLowerCase().includes(term))

  return (
    <section className="card">
      <div className="page-header">
        <h2>Invitaciones</h2>
        <input
          type="search"
          placeholder="Buscar…"
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
      {create.error && <p className="error">{create.error.message}</p>}
      {update.error && <p className="error">{update.error.message}</p>}
      {remove.error && <p className="error">{remove.error.message}</p>}

      {invitations.isPending && <p>Cargando…</p>}
      {invitations.isError && <p className="error">{invitations.error.message}</p>}
      {invitations.data?.length === 0 && (
        <p className="muted">
          Agrega una invitación por familia o grupo, por ejemplo "Familia Pérez" con 4 pases.
        </p>
      )}

      {visible && visible.length > 0 && (
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
              {visible.map((inv) =>
                editingId === inv.id ? (
                  <tr key={inv.id}>
                    <td colSpan={5}>
                      <InvitationRowForm
                        initial={inv}
                        submitLabel="Guardar"
                        pending={update.isPending}
                        maxPasses={Math.min(50, inv.passes + remainingPasses)}
                        onSubmit={(data) => update.mutate({ id: inv.id, data })}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={inv.id}>
                    <td>{inv.displayName}</td>
                    <td className="num">
                      {inv.passes}
                      <span className="show-sm muted"> {inv.passes === 1 ? 'pase' : 'pases'}</span>
                    </td>
                    <td className="hide-sm">{inv.phone ?? <span className="muted">—</span>}</td>
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
                      {!readOnly && (
                        <>
                          <button className="secondary small" onClick={() => setEditingId(inv.id)}>
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
                ),
              )}
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
        placeholder="Teléfono (opcional)"
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
