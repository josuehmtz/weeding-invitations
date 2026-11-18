import type { StoredConfig, TemplateEvent, TemplateKey } from '../templates/types'
import { api } from './client'
import type { RsvpStatus } from './invitations'

export interface PublicInvitation {
  displayName: string
  passes: number
  rsvpStatus: RsvpStatus
  confirmedPasses: number
  isPreview: boolean
  event: TemplateEvent & { templateKey: TemplateKey; templateConfig: StoredConfig }
}

export const getPublicInvitation = (token: string) =>
  api<PublicInvitation>(`/public/invitations/${encodeURIComponent(token)}`)
