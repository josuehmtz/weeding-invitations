import { api, send } from './client'

export type TableShape = 'Round' | 'Rectangle' | 'Square'
export type ElementKind = 'dancefloor' | 'stage' | 'entrance' | 'bar' | 'other'

export interface LayoutElement {
  id: string
  kind: ElementKind
  label: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface SeatingLayout {
  width: number
  height: number
  elements: LayoutElement[]
}

export interface SeatTable {
  id: string
  number: number
  label: string | null
  shape: TableShape
  capacity: number
  x: number
  y: number
  rotation: number
  seated: number
}

export interface SeatGuest {
  id: string
  name: string
  invitationId: string
  invitationName: string
  tableId: string | null
}

export interface Seating {
  layout: SeatingLayout
  tables: SeatTable[]
  guests: SeatGuest[]
  pendingInvitations: number
  pendingPasses: number
}

/** Mesa como la envía el editor: sin id = nueva. */
export interface TableInput {
  id?: string
  number: number
  label: string | null
  shape: TableShape
  capacity: number
  x: number
  y: number
  rotation: number
}

export interface Move {
  guestId: string
  tableId: string | null
}

const base = (eventId: string) => `/events/${eventId}/seating`

export const getSeating = (eventId: string) => api<Seating>(base(eventId))
export const savePlan = (eventId: string, layout: SeatingLayout, tables: TableInput[]) =>
  send<Seating>('PUT', `${base(eventId)}/plan`, { layout, tables })
export const assignSeats = (eventId: string, moves: Move[]) =>
  send<Seating>('PUT', `${base(eventId)}/assignments`, { moves })

export const elementKinds: Record<ElementKind, { label: string; width: number; height: number }> = {
  dancefloor: { label: 'Pista', width: 220, height: 180 },
  stage: { label: 'Escenario', width: 260, height: 90 },
  entrance: { label: 'Entrada', width: 120, height: 40 },
  bar: { label: 'Barra', width: 180, height: 50 },
  other: { label: 'Otro', width: 120, height: 80 },
}

export const shapeLabels: Record<TableShape, string> = {
  Round: 'Redonda',
  Rectangle: 'Rectangular',
  Square: 'Cuadrada',
}
