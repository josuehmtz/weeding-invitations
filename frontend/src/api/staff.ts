import { api, send } from './client'
import type { RsvpStatus } from './invitations'

// --- El cliente administra los accesos de hostess de su evento ---

export interface StaffAccess {
  id: string
  label: string
  expiresAt: string
  createdAt: string
  checkIns: number
}

/** El PIN solo viene al crear el acceso; después no se puede volver a consultar. */
export interface CreatedStaffAccess {
  id: string
  label: string
  expiresAt: string
  pin: string
}

const base = (eventId: string) => `/events/${eventId}/staff`

export const getStaffAccesses = (eventId: string) => api<StaffAccess[]>(base(eventId))
export const createStaffAccess = (eventId: string, label: string) =>
  send<CreatedStaffAccess>('POST', base(eventId), { label })
export const deleteStaffAccess = (eventId: string, id: string) => send<void>('DELETE', `${base(eventId)}/${id}`)

export const staffUrl = (accessId: string) => `${window.location.origin}/staff/${accessId}`

// --- Lo que usa la hostess el día del evento ---

export interface StaffSession {
  accessId: string
  label: string
  eventTitle: string
  startsAt: string
  venueName: string | null
  confirmedPasses: number
  checkedIn: number
  expiresAt: string
}

export interface ScanResult {
  token: string
  displayName: string
  passes: number
  rsvpStatus: RsvpStatus
  confirmedPasses: number
  checkedIn: number
  remaining: number
  tables: number[]
  guests: { name: string; tableNumber: number | null }[]
  warnings: string[]
  checkIns: { id: string; count: number; at: string; staffLabel: string | null }[]
}

export interface SearchResult {
  token: string
  displayName: string
  passes: number
  rsvpStatus: RsvpStatus
  checkedIn: number
}

export const staffLogin = (accessId: string, pin: string) => send<void>('POST', '/staff/login', { accessId, pin })
export const staffLogout = () => send<void>('POST', '/staff/logout')
export const getStaffSession = () => api<StaffSession>('/staff/me')
export const scanCode = (content: string) => send<ScanResult>('POST', '/staff/scan', { content })
export const checkIn = (token: string, count: number) => send<ScanResult>('POST', '/staff/checkins', { token, count })
export const undoCheckIn = (id: string) => send<ScanResult>('DELETE', `/staff/checkins/${id}`)
export const searchInvitations = (q: string) => api<SearchResult[]>(`/staff/search?q=${encodeURIComponent(q)}`)
