import type { StoredConfig, TemplateConfig, TemplateKey } from '../templates/types'
import { api, send } from './client'

export interface SavedTemplate {
  templateKey: TemplateKey
  config: StoredConfig
}

export const getTemplateConfig = (eventId: string) => api<SavedTemplate>(`/events/${eventId}/template`)

export const saveTemplateConfig = (eventId: string, templateKey: TemplateKey, config: TemplateConfig) =>
  send<SavedTemplate>('PUT', `/events/${eventId}/template`, { templateKey, config })
