import { api, send } from './client'

export type RsvpStatus = 'Pending' | 'Confirmed' | 'Declined'

export const rsvpLabels: Record<RsvpStatus, string> = {
  Pending: 'Pendiente',
  Confirmed: 'Confirmado',
  Declined: 'No asistirá',
}

export interface Invitation {
  id: string
  displayName: string
  passes: number
  phone: string | null
  token: string
  rsvpStatus: RsvpStatus
  confirmedPasses: number
  respondedAt: string | null
  message: string | null
  guestNames: string[]
}

export interface ManualRsvp {
  attending: boolean
  confirmedPasses: number
  guestNames?: string[]
}

export interface SaveInvitation {
  displayName: string
  passes: number
  phone?: string | null
}

const base = (eventId: string) => `/events/${eventId}/invitations`

export const getInvitations = (eventId: string) => api<Invitation[]>(base(eventId))
export const createInvitation = (eventId: string, i: SaveInvitation) =>
  send<Invitation>('POST', base(eventId), i)
export const updateInvitation = (eventId: string, id: string, i: SaveInvitation) =>
  send<Invitation>('PUT', `${base(eventId)}/${id}`, i)
export const setRsvp = (eventId: string, id: string, rsvp: ManualRsvp) =>
  send<Invitation>('PUT', `${base(eventId)}/${id}/rsvp`, rsvp)
export const deleteInvitation =(eventId: string, id: string) =>
  send<void>('DELETE', `${base(eventId)}/${id}`)

/** Link público de la invitación (el mismo que irá en el QR). */
export const invitationUrl = (token: string) => `${window.location.origin}/i/${token}`
