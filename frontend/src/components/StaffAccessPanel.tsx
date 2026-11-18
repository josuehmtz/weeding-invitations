import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import {
  createStaffAccess,
  deleteStaffAccess,
  getStaffAccesses,
  staffUrl,
  type CreatedStaffAccess,
} from '../api/staff'
import { formatDateTime } from '../lib/dates'

interface Props {
  eventId: string
  eventTitle: string
  readOnly: boolean
}

/** El cliente crea accesos (link + PIN) para que sus hostess escaneen los QR el día del evento. */
export default function StaffAccessPanel({ eventId, eventTitle, readOnly }: Props) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [created, setCreated] = useState<CreatedStaffAccess | null>(null)
  const [copied, setCopied] = useState(false)

  const accesses = useQuery({ queryKey: ['staff', eventId], queryFn: () => getStaffAccesses(eventId) })

  const create = useMutation({
    mutationFn: () => createStaffAccess(eventId, label.trim()),
    onSuccess: (acc) => {
      setCreated(acc)
      setLabel('')
      setCopied(false)
      queryClient.invalidateQueries({ queryKey: ['staff', eventId] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteStaffAccess(eventId, id),
    onSuccess: (_, id) => {
      if (created?.id === id) setCreated(null)
      queryClient.invalidateQueries({ queryKey: ['staff', eventId] })
    },
  })

  const shareText = (acc: CreatedStaffAccess) =>
    `Acceso de hostess para "${eventTitle}"\nAbre este link el día del evento: ${staffUrl(acc.id)}\nPIN: ${acc.pin}`

  const copy = async (acc: CreatedStaffAccess) => {
    await navigator.clipboard.writeText(shareText(acc))
    setCopied(true)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }

  return (
    <section className="card">
      <div>
        <h2>Acceso para hostess</h2>
        <p className="muted small">
          Crea un acceso por persona que recibirá a los invitados. Con el link y el PIN pueden escanear los QR desde su
          celular, sin crear cuenta.
        </p>
      </div>

      {!readOnly && (
        <form className="row-form staff-form" onSubmit={submit}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre de la hostess, p. ej. Mariana"
            aria-label="Nombre de la hostess"
            maxLength={60}
            required
          />
          <button type="submit" disabled={create.isPending}>
            Crear acceso
          </button>
        </form>
      )}
      {create.error && <p className="error">{create.error.message}</p>}
      {remove.error && <p className="error">{remove.error.message}</p>}

      {created && (
        <div className="pin-box" role="status">
          <p>
            <strong>Acceso para {created.label}</strong>
          </p>
          <p className="pin">{created.pin}</p>
          <p className="muted small">
            Guarda o comparte este PIN ahora: por seguridad no se vuelve a mostrar. Si se pierde, elimina el acceso y
            crea otro.
          </p>
          <code className="staff-link">{staffUrl(created.id)}</code>
          <div className="actions">
            <button type="button" onClick={() => copy(created)}>
              {copied ? '¡Copiado!' : 'Copiar link y PIN'}
            </button>
            <a
              className="button secondary"
              href={`https://wa.me/?text=${encodeURIComponent(shareText(created))}`}
              target="_blank"
              rel="noreferrer"
            >
              Enviar por WhatsApp
            </a>
            <button type="button" className="secondary" onClick={() => setCreated(null)}>
              Listo
            </button>
          </div>
        </div>
      )}

      {accesses.data && accesses.data.length > 0 && (
        <ul className="staff-list">
          {accesses.data.map((acc) => (
            <li key={acc.id}>
              <div>
                <strong>{acc.label}</strong>
                <span className="muted small">
                  Vigente hasta {formatDateTime(acc.expiresAt)} · {acc.checkIns}{' '}
                  {acc.checkIns === 1 ? 'entrada registrada' : 'entradas registradas'}
                </span>
              </div>
              {!readOnly && (
                <button
                  className="danger small"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`¿Eliminar el acceso de ${acc.label}? Su sesión se cerrará de inmediato.`))
                      remove.mutate(acc.id)
                  }}
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
