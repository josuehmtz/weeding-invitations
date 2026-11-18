import type { StoredConfig, TemplateEvent, TemplateKey } from '../templates/types'
import { api, send } from './client'
import type { RsvpStatus } from './invitations'

export interface PublicInvitation {
  displayName: string
  passes: number
  rsvpStatus: RsvpStatus
  confirmedPasses: number
  guestNames: string[]
  message: string | null
  /** Motivo por el que ya no se puede responder, o null. */
  rsvpClosedReason: string | null
  isPreview: boolean
  event: TemplateEvent & { templateKey: TemplateKey; templateConfig: StoredConfig }
}

export interface RsvpAnswer {
  attending: boolean
  confirmedPasses: number
  guestNames?: string[]
  message?: string | null
}

const base = (token: string) => `/public/invitations/${encodeURIComponent(token)}`

export const getPublicInvitation = (token: string) => api<PublicInvitation>(base(token))

export const submitRsvp = (token: string, answer: RsvpAnswer) =>
  send<PublicInvitation>('POST', `${base(token)}/rsvp`, answer)
