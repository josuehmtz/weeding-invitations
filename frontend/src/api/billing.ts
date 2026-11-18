import { api, send } from './client'
import type { EventStatus } from './events'

export type OrderStatus = 'Pending' | 'Paid' | 'Failed' | 'Refunded'

export interface PlanOption {
  code: string
  name: string
  maxPasses: number
  priceMxn: number
  amountToPay: number
  available: boolean
  reason: string | null
}

export interface Order {
  id: string
  planName: string
  amountMxn: number
  status: OrderStatus
  createdAt: string
  paidAt: string | null
}

export interface Billing {
  eventStatus: EventStatus
  currentPlan: string | null
  maxPasses: number
  totalPasses: number
  paymentsEnabled: boolean
  options: PlanOption[]
  orders: Order[]
}

export const getBilling = (eventId: string) => api<Billing>(`/events/${eventId}/billing`)

/** Crea la sesión de Stripe Checkout; el front redirige a la URL devuelta. */
export const startCheckout = (eventId: string, planCode: string) =>
  send<{ url: string }>('POST', `/events/${eventId}/checkout`, { planCode })

export const syncCheckout = (eventId: string, sessionId: string) =>
  send<Billing>('POST', `/events/${eventId}/checkout/sync`, { sessionId })

export const orderStatusLabels: Record<OrderStatus, string> = {
  Pending: 'Pendiente',
  Paid: 'Pagado',
  Failed: 'No completado',
  Refunded: 'Reembolsado',
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
export const formatMxn = (n: number) => mxn.format(n)
