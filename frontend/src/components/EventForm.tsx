import { useState, type FormEvent } from 'react'
import { eventTypeLabels, type EventDetail, type EventType, type SaveEvent } from '../api/events'
import { fromLocalInput, toLocalInput } from '../lib/dates'

interface Props {
  initial?: EventDetail
  submitLabel: string
  pending: boolean
  error?: string
  onSubmit: (data: SaveEvent) => void
  onCancel?: () => void
}

export default function EventForm({ initial, submitLabel, pending, error, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<EventType>(initial?.type ?? 'Wedding')
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt))
  const [venueName, setVenueName] = useState(initial?.venueName ?? '')
  const [venueAddress, setVenueAddress] = useState(initial?.venueAddress ?? '')
  const [mapsUrl, setMapsUrl] = useState(initial?.mapsUrl ?? '')
  const [rsvpDeadline, setRsvpDeadline] = useState(toLocalInput(initial?.rsvpDeadline))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({
      title,
      type,
      startsAt: fromLocalInput(startsAt)!,
      venueName: venueName || null,
      venueAddress: venueAddress || null,
      mapsUrl: mapsUrl || null,
      rsvpDeadline: fromLocalInput(rsvpDeadline),
    })
  }

  return (
    <form onSubmit={submit} className="form grid-2">
      <label className="span-2">
        Nombre del evento
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Boda de Ana y Luis" required maxLength={200} />
      </label>
      <label>
        Tipo
        <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
          {Object.entries(eventTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fecha y hora
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      </label>
      <label>
        Lugar
        <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Hacienda Los Arcos" maxLength={200} />
      </label>
      <label>
        Confirmar asistencia antes de
        <input type="datetime-local" value={rsvpDeadline} onChange={(e) => setRsvpDeadline(e.target.value)} />
      </label>
      <label className="span-2">
        Dirección
        <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} maxLength={300} />
      </label>
      <label className="span-2">
        Link de Google Maps
        <input type="url" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." maxLength={500} />
      </label>
      {error && <p className="error span-2">{error}</p>}
      <div className="actions span-2">
        <button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
