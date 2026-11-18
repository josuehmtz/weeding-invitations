import { api, send } from './client'

export type EventType = 'Wedding' | 'Quinceanera' | 'Other'
export type EventStatus = 'Draft' | 'Published' | 'Archived'

export const eventTypeLabels: Record<EventType, string> = {
  Wedding: 'Boda',
  Quinceanera: 'XV años',
  Other: 'Otro',
}

export const eventStatusLabels: Record<EventStatus, string> = {
  Draft: 'Borrador',
  Published: 'Publicado',
  Archived: 'Archivado',
}

export interface EventSummary {
  id: string
  title: string
  type: EventType
  status: EventStatus
  startsAt: string
  venueName: string | null
  invitationCount: number
  totalPasses: number
}

export interface EventDetail extends EventSummary {
  venueAddress: string | null
  mapsUrl: string | null
  rsvpDeadline: string | null
  passLimit: number
  rsvp: RsvpSummary
}

export interface RsvpSummary {
  confirmed: number
  declined: number
  pending: number
  confirmedPasses: number
  pendingPasses: number
}

export interface SaveEvent {
  title: string
  type: EventType
  startsAt: string
  venueName?: string | null
  venueAddress?: string | null
  mapsUrl?: string | null
  rsvpDeadline?: string | null
}

export const getEvents = () => api<EventSummary[]>('/events')
export const getEvent = (id: string) => api<EventDetail>(`/events/${id}`)
export const createEvent = (e: SaveEvent) => send<EventDetail>('POST', '/events', e)
export const updateEvent = (id: string, e: SaveEvent) => send<EventDetail>('PUT', `/events/${id}`, e)
export const deleteEvent = (id: string) => send<void>('DELETE', `/events/${id}`)
