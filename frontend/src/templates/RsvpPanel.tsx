import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { invitationUrl } from '../api/invitations'
import { submitRsvp, type PublicInvitation } from '../api/public'
import QrCode from '../components/QrCode'

interface Props {
  token: string
  invitation: PublicInvitation
  qrColor: string
  onUpdated: (inv: PublicInvitation) => void
}

/** Confirmación de asistencia dentro de la invitación. Tras confirmar muestra el QR de acceso. */
export default function RsvpPanel({ token, invitation, qrColor, onUpdated }: Props) {
  const [editing, setEditing] = useState(invitation.rsvpStatus === 'Pending')
  const closed = invitation.rsvpClosedReason

  if (invitation.rsvpStatus === 'Confirmed' && !editing) {
    const count = invitation.confirmedPasses
    return (
      <div className="tpl-rsvp">
        <p className="tpl-strong">
          ¡Gracias! Confirmaste {count} {count === 1 ? 'lugar' : 'lugares'}.
        </p>
        {invitation.guestNames.length > 0 && <p className="tpl-rsvp-names">{invitation.guestNames.join(' · ')}</p>}
        <p>Presenta este código en la entrada del evento:</p>
        <QrCode
          value={invitationUrl(token)}
          fileName={`acceso-${invitation.displayName}`}
          color={qrColor}
          className="tpl-qr"
        />
        {!closed && (
          <button type="button" className="tpl-link" onClick={() => setEditing(true)}>
            Cambiar mi respuesta
          </button>
        )}
      </div>
    )
  }

  if (invitation.rsvpStatus === 'Declined' && !editing) {
    return (
      <div className="tpl-rsvp">
        <p>Registramos que no podrás acompañarnos. ¡Te vamos a extrañar!</p>
        {!closed && (
          <button type="button" className="tpl-link" onClick={() => setEditing(true)}>
            Cambiar mi respuesta
          </button>
        )}
      </div>
    )
  }

  if (closed) return <p className="tpl-rsvp">{closed}</p>

  return (
    <RsvpForm
      token={token}
      invitation={invitation}
      onCancel={invitation.rsvpStatus === 'Pending' ? undefined : () => setEditing(false)}
      onSaved={(inv) => {
        setEditing(false)
        onUpdated(inv)
      }}
    />
  )
}

function RsvpForm({ token, invitation, onCancel, onSaved }: {
  token: string
  invitation: PublicInvitation
  onCancel?: () => void
  onSaved: (inv: PublicInvitation) => void
}) {
  const wasConfirmed = invitation.rsvpStatus === 'Confirmed'
  const [attending, setAttending] = useState<boolean | null>(
    invitation.rsvpStatus === 'Pending' ? null : wasConfirmed,
  )
  const [count, setCount] = useState(wasConfirmed ? invitation.confirmedPasses : invitation.passes)
  const [names, setNames] = useState<string[]>(() =>
    Array.from({ length: invitation.passes }, (_, i) => (wasConfirmed ? invitation.guestNames[i] ?? '' : '')),
  )
  const [message, setMessage] = useState(invitation.message ?? '')

  const send = useMutation({
    mutationFn: () =>
      submitRsvp(token, {
        attending: attending === true,
        confirmedPasses: attending ? count : 0,
        guestNames: attending ? names.slice(0, count) : [],
        message: message.trim() || null,
      }),
    onSuccess: onSaved,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (attending !== null) send.mutate()
  }

  return (
    <form className="tpl-rsvp tpl-form" onSubmit={submit}>
      <p>¿Nos acompañas?</p>
      <div className="tpl-choice" role="radiogroup" aria-label="¿Asistirás?">
        <button type="button" role="radio" aria-checked={attending === true} className={attending === true ? 'selected' : ''} onClick={() => setAttending(true)}>
          Sí, asistiré
        </button>
        <button type="button" role="radio" aria-checked={attending === false} className={attending === false ? 'selected' : ''} onClick={() => setAttending(false)}>
          No podré asistir
        </button>
      </div>

      {attending && (
        <>
          {invitation.passes > 1 && (
            <label>
              ¿Cuántas personas asistirán?
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {Array.from({ length: invitation.passes }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} de {invitation.passes}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend>Nombres (opcional)</legend>
            {names.slice(0, count).map((name, i) => (
              <input
                key={i}
                value={name}
                maxLength={120}
                placeholder={`Persona ${i + 1}`}
                aria-label={`Nombre de la persona ${i + 1}`}
                onChange={(e) => setNames((ns) => ns.map((n, j) => (j === i ? e.target.value : n)))}
              />
            ))}
          </fieldset>
        </>
      )}

      {attending !== null && (
        <label>
          Mensaje para los anfitriones (opcional)
          <textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
      )}

      {send.error && <p className="tpl-error">{send.error.message}</p>}

      <div className="tpl-form-actions">
        <button type="submit" className="tpl-button tpl-button-solid" disabled={attending === null || send.isPending}>
          {send.isPending ? 'Enviando…' : attending === false ? 'Enviar respuesta' : 'Confirmar asistencia'}
        </button>
        {onCancel && (
          <button type="button" className="tpl-link" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
