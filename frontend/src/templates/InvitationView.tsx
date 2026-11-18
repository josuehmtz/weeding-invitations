import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { bodyFonts, headingFonts, useTemplateFonts } from './fonts'
import type { TemplateConfig, TemplateEvent, TemplateGuest, TemplateKey } from './types'
import './templates.css'

interface Props {
  templateKey: TemplateKey
  config: TemplateConfig
  event: TemplateEvent
  guest?: TemplateGuest
  /** Espacio para la confirmación de asistencia (fase 3). */
  rsvpSlot?: ReactNode
}

const dateFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })
const shortDateFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' })
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Una sola vista para las 3 plantillas: comparten contenido y secciones,
 * y cada una cambia tipografía, colores, ornamentos y acomodo vía CSS (.tpl-<clave>).
 */
export default function InvitationView({ templateKey, config, event, guest, rsvpSlot }: Props) {
  useTemplateFonts()
  const starts = new Date(event.startsAt)
  const { sections, texts } = config

  const style = {
    '--tpl-primary': config.colors.primary,
    '--tpl-bg': config.colors.background,
    '--tpl-text': config.colors.text,
    '--tpl-heading': headingFonts[config.headingFont].css,
    '--tpl-body': bodyFonts[templateKey],
  } as CSSProperties

  const hasPeople = sections.people && (config.people.parents.trim() || config.people.godparents.trim())
  const itinerary = config.itinerary.filter((i) => i.label.trim())

  return (
    <article className={`tpl tpl-${templateKey} tpl-font-${config.headingFont}`} style={style}>
      <header className="tpl-hero">
        <Ornament templateKey={templateKey} />
        {texts.headline && <p className="tpl-headline">{texts.headline}</p>}
        <h1 className="tpl-names">{texts.names || event.title}</h1>
        <p className="tpl-date">
          <span className="tpl-date-day">{capitalize(dateFmt.format(starts))}</span>
          <span className="tpl-date-time">{timeFmt.format(starts)}</span>
        </p>
        <Ornament templateKey={templateKey} flip />
      </header>

      {guest && (
        <section className="tpl-section tpl-guest">
          <p className="tpl-guest-name">{guest.displayName}</p>
          <p>
            Hemos reservado <strong>{guest.passes}</strong> {guest.passes === 1 ? 'lugar' : 'lugares'} en tu honor.
          </p>
        </section>
      )}

      {texts.message && (
        <section className="tpl-section">
          <p className="tpl-message">{texts.message}</p>
        </section>
      )}

      {sections.countdown && <Countdown target={starts} />}

      {hasPeople && (
        <section className="tpl-section tpl-people">
          {config.people.parents.trim() && (
            <div>
              <h2 className="tpl-title">Con la bendición de</h2>
              <p className="tpl-multiline">{config.people.parents}</p>
            </div>
          )}
          {config.people.godparents.trim() && (
            <div>
              <h2 className="tpl-title">Padrinos</h2>
              <p className="tpl-multiline">{config.people.godparents}</p>
            </div>
          )}
        </section>
      )}

      {sections.venue && (event.venueName || event.venueAddress) && (
        <section className="tpl-section">
          <h2 className="tpl-title">¿Dónde?</h2>
          {event.venueName && <p className="tpl-strong">{event.venueName}</p>}
          {event.venueAddress && <p>{event.venueAddress}</p>}
          {event.mapsUrl && (
            <a className="tpl-button" href={event.mapsUrl} target="_blank" rel="noreferrer">
              Ver ubicación
            </a>
          )}
        </section>
      )}

      {sections.itinerary && itinerary.length > 0 && (
        <section className="tpl-section">
          <h2 className="tpl-title">Itinerario</h2>
          <ol className="tpl-itinerary">
            {itinerary.map((item, i) => (
              <li key={i}>
                <span className="tpl-itinerary-time">{item.time}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {sections.dressCode && config.dressCode.trim() && (
        <section className="tpl-section">
          <h2 className="tpl-title">Código de vestimenta</h2>
          <p className="tpl-strong">{config.dressCode}</p>
        </section>
      )}

      {sections.gifts && (config.gifts.message.trim() || config.gifts.link.trim()) && (
        <section className="tpl-section">
          <h2 className="tpl-title">Mesa de regalos</h2>
          {config.gifts.message && <p>{config.gifts.message}</p>}
          {config.gifts.link && (
            <a className="tpl-button" href={config.gifts.link} target="_blank" rel="noreferrer">
              Ver mesa de regalos
            </a>
          )}
        </section>
      )}

      {(rsvpSlot || event.rsvpDeadline) && (
        <section className="tpl-section">
          <h2 className="tpl-title">Confirma tu asistencia</h2>
          {event.rsvpDeadline && (
            <p>Por favor confírmanos antes del {shortDateFmt.format(new Date(event.rsvpDeadline))}.</p>
          )}
          {rsvpSlot}
        </section>
      )}

      {texts.closing && (
        <footer className="tpl-closing">
          <p>{texts.closing}</p>
          <p className="tpl-closing-names">{texts.names || event.title}</p>
        </footer>
      )}
    </article>
  )
}

function Countdown({ target }: { target: Date }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const diff = target.getTime() - now
  // Si el evento ya pasó, la cuenta regresiva no se muestra.
  if (diff <= 0) return null
  const parts = [
    { value: Math.floor(diff / 86_400_000), label: 'días' },
    { value: Math.floor(diff / 3_600_000) % 24, label: 'horas' },
    { value: Math.floor(diff / 60_000) % 60, label: 'min' },
    { value: Math.floor(diff / 1000) % 60, label: 'seg' },
  ]

  return (
    <section className="tpl-section">
      <div className="tpl-countdown" role="timer" aria-label="Cuenta regresiva">
        {parts.map((p) => (
          <div key={p.label}>
            <span className="tpl-countdown-value">{p.value}</span>
            <span className="tpl-countdown-label">{p.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Adorno decorativo distinto por plantilla. */
function Ornament({ templateKey, flip }: { templateKey: TemplateKey; flip?: boolean }) {
  if (templateKey === 'moderna') return <span className="tpl-rule" aria-hidden />

  const transform = flip ? 'scale(1,-1)' : undefined
  if (templateKey === 'jardin')
    return (
      <svg className="tpl-ornament" viewBox="0 0 200 40" aria-hidden style={{ transform }}>
        <path d="M100 30 C 80 30, 60 10, 20 14" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M100 30 C 120 30, 140 10, 180 14" fill="none" stroke="currentColor" strokeWidth="1.2" />
        {[40, 62, 138, 160].map((x, i) => (
          <ellipse key={x} cx={x} cy={i % 2 ? 16 : 20} rx="7" ry="3.2" fill="currentColor" opacity="0.55"
            transform={`rotate(${x < 100 ? -25 : 25} ${x} ${i % 2 ? 16 : 20})`} />
        ))}
        <circle cx="100" cy="30" r="4" fill="currentColor" />
      </svg>
    )

  return (
    <svg className="tpl-ornament" viewBox="0 0 200 20" aria-hidden style={{ transform }}>
      <line x1="10" y1="10" x2="80" y2="10" stroke="currentColor" strokeWidth="0.8" />
      <line x1="120" y1="10" x2="190" y2="10" stroke="currentColor" strokeWidth="0.8" />
      <path d="M100 3 L107 10 L100 17 L93 10 Z" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="86" cy="10" r="1.6" fill="currentColor" />
      <circle cx="114" cy="10" r="1.6" fill="currentColor" />
    </svg>
  )
}
