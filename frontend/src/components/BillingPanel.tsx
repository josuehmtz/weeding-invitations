import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { formatMxn, getBilling, orderStatusLabels, startCheckout, syncCheckout, type Billing } from '../api/billing'
import { formatDateTime } from '../lib/dates'

/** Paquete del evento: comprar (publica el evento) o mejorar pagando la diferencia. */
export default function BillingPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  // Al regresar de Stripe la URL trae ?pago=exito&session_id=... o ?pago=cancelado
  const [returned] = useState(() => ({ result: params.get('pago'), sessionId: params.get('session_id') }))
  const [notice, setNotice] = useState<{ kind: 'ok' | 'info' | 'error'; text: string } | null>(() =>
    returned.result === 'cancelado' ? { kind: 'info', text: 'Cancelaste el pago. No se hizo ningún cargo.' } : null,
  )
  const billing = useQuery({ queryKey: ['billing', eventId], queryFn: () => getBilling(eventId) })

  const refreshEvent = () => {
    queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    queryClient.invalidateQueries({ queryKey: ['events'] })
  }

  const checkout = useMutation({
    mutationFn: (planCode: string) => startCheckout(eventId, planCode),
    // Stripe Checkout es una página de Stripe: ahí se captura la tarjeta (nunca pasa por nuestro servidor).
    onSuccess: ({ url }) => window.location.assign(url),
  })

  const sync = useMutation({
    mutationFn: (sessionId: string) => syncCheckout(eventId, sessionId),
    onSuccess: (b: Billing) => {
      queryClient.setQueryData(['billing', eventId], b)
      refreshEvent()
      const last = b.orders[0]
      setNotice(
        last?.status === 'Paid'
          ? { kind: 'ok', text: '¡Pago recibido! Tu evento está publicado: tus invitados ya pueden confirmar y recibir su QR.' }
          : { kind: 'info', text: 'Tu pago está pendiente. Si elegiste OXXO, el evento se publicará en cuanto se acredite (puede tardar hasta un día hábil).' },
      )
    },
    onError: () => setNotice({ kind: 'error', text: 'No pudimos confirmar el pago. Si se cobró, se reflejará en unos minutos.' }),
  })

  const handled = useRef(false)
  const { mutate: syncMutate } = sync
  useEffect(() => {
    if (!returned.result || handled.current) return
    handled.current = true
    if (returned.result === 'exito' && returned.sessionId) syncMutate(returned.sessionId)
    // Limpia la URL para que recargar la página no repita el aviso.
    setParams((p) => {
      p.delete('pago')
      p.delete('session_id')
      return p
    }, { replace: true })
  }, [returned, setParams, syncMutate])

  if (billing.isPending) return null
  if (billing.isError) return <p className="error">{billing.error.message}</p>

  const b = billing.data
  const draft = b.eventStatus === 'Draft'
  const pendingOrder = b.orders.find((o) => o.status === 'Pending')
  const upgrades = b.options.filter((o) => o.available)

  return (
    <section className="card billing">
      <div className="page-header">
        <div>
          <h2>Paquete y pago</h2>
          {draft ? (
            <p className="muted small">
              Tu evento está en <strong>borrador</strong>: puedes diseñar, cargar invitados y ver la invitación, pero tus
              invitados no podrán confirmar ni recibir su QR hasta que elijas un paquete.
            </p>
          ) : (
            <p className="muted small">
              Paquete <strong>{b.currentPlan}</strong> · hasta {b.maxPasses} invitados ({b.totalPasses} registrados).
            </p>
          )}
        </div>
        {!draft && <span className="badge rsvp-confirmed">Publicado</span>}
      </div>

      {notice && (
        <p className={`notice notice-${notice.kind}`} role="status">
          {notice.text}
        </p>
      )}
      {sync.isPending && <p className="muted">Confirmando tu pago…</p>}
      {checkout.error && <p className="error">{checkout.error.message}</p>}
      {!b.paymentsEnabled && <p className="notice notice-info">Los pagos aún no están configurados en el servidor.</p>}
      {pendingOrder && !notice && (
        <p className="notice notice-info">
          Tienes un pago pendiente de {formatMxn(pendingOrder.amountMxn)} (paquete {pendingOrder.planName}). Si pagaste en
          OXXO, se reflejará en cuanto se acredite.
        </p>
      )}

      {(draft || upgrades.length > 0) && (
        <>
          {!draft && <h3 className="small-heading">Mejorar paquete</h3>}
          <div className="plan-options">
            {(draft ? b.options : upgrades).map((p) => (
              <div key={p.code} className={`plan-option${p.available ? '' : ' disabled'}`}>
                <strong>{p.name}</strong>
                <span className="muted small">Hasta {p.maxPasses} invitados</span>
                <span className="plan-price">
                  {formatMxn(p.amountToPay)}
                  {!draft && <span className="muted small"> (diferencia)</span>}
                </span>
                {p.reason && <span className="muted small">{p.reason}</span>}
                <button
                  disabled={!p.available || !b.paymentsEnabled || checkout.isPending}
                  onClick={() => checkout.mutate(p.code)}
                >
                  {checkout.isPending && checkout.variables === p.code ? 'Abriendo pago…' : draft ? 'Elegir y pagar' : 'Mejorar'}
                </button>
              </div>
            ))}
          </div>
          <p className="muted small">Pago seguro con Stripe: tarjeta de crédito o débito, u OXXO. Pago único por evento.</p>
        </>
      )}

      {b.orders.length > 0 && (
        <details className="orders">
          <summary className="small">Historial de pagos ({b.orders.length})</summary>
          <ul>
            {b.orders.map((o) => (
              <li key={o.id}>
                <span>
                  {o.planName} · {formatMxn(o.amountMxn)}
                </span>
                <span className="muted small">
                  {orderStatusLabels[o.status]} · {formatDateTime(o.paidAt ?? o.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
