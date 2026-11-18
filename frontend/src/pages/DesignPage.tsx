import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { getEvent, type EventDetail } from '../api/events'
import { getTemplateConfig, saveTemplateConfig, type SavedTemplate } from '../api/templates'
import { headingFonts } from '../templates/fonts'
import InvitationView from '../templates/InvitationView'
import { getTemplate, resolveConfig, templates } from '../templates/registry'
import type { HeadingFont, TemplateConfig, TemplateKey } from '../templates/types'

const sampleGuest = { displayName: 'Familia Ejemplo', passes: 2 }

export default function DesignPage() {
  const { id = '' } = useParams()
  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) })
  const saved = useQuery({ queryKey: ['template', id], queryFn: () => getTemplateConfig(id) })

  if (event.isPending || saved.isPending) return <main className="page">Cargando…</main>
  if (event.isError || saved.isError)
    return (
      <main className="page">
        <p className="error">{(event.error ?? saved.error)?.message}</p>
        <Link to="/app">Volver a mis eventos</Link>
      </main>
    )

  // key: si llega una versión nueva guardada, el editor se reinicia con ella.
  return <Editor key={JSON.stringify(saved.data)} event={event.data} saved={saved.data} />
}

function Editor({ event, saved }: { event: EventDetail; saved: SavedTemplate }) {
  const queryClient = useQueryClient()
  const initialKey = getTemplate(saved.templateKey).key
  const [templateKey, setTemplateKey] = useState<TemplateKey>(initialKey)
  const [config, setConfig] = useState<TemplateConfig>(() => resolveConfig(initialKey, event, saved.config))
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ templateKey: initialKey, config }))
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')

  const dirty = JSON.stringify({ templateKey, config }) !== savedSnapshot

  // Avisa antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useMutation({
    mutationFn: () => saveTemplateConfig(event.id, templateKey, config),
    onSuccess: (result) => {
      setSavedSnapshot(JSON.stringify({ templateKey, config }))
      queryClient.setQueryData(['template', event.id], result)
      queryClient.invalidateQueries({ queryKey: ['public-invitation'] })
    },
  })

  const set = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }))

  const chooseTemplate = (key: TemplateKey) => {
    // Al cambiar de plantilla se conservan los textos y se toman los colores y la letra de la nueva.
    const d = getTemplate(key).defaults(event)
    setTemplateKey(key)
    setConfig((c) => ({ ...c, colors: d.colors, headingFont: d.headingFont }))
  }

  const resetStyle = () => {
    const d = getTemplate(templateKey).defaults(event)
    setConfig((c) => ({ ...c, colors: d.colors, headingFont: d.headingFont }))
  }

  const { texts, sections, colors } = config

  return (
    <main className="page wide">
      <div className="page-header">
        <div>
          <Link to={`/app/events/${event.id}`} className="back">
            ← {event.title}
          </Link>
          <h1>Diseño de la invitación</h1>
        </div>
        <div className="actions">
          <span className="muted small save-state">
            {save.isPending ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Todo guardado'}
          </span>
          <button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            Guardar
          </button>
        </div>
      </div>
      {save.error && <p className="error">{save.error.message}</p>}

      <div className="tabs-sm" role="tablist">
        <button role="tab" aria-selected={mobileTab === 'edit'} className={mobileTab === 'edit' ? '' : 'secondary'} onClick={() => setMobileTab('edit')}>
          Editar
        </button>
        <button role="tab" aria-selected={mobileTab === 'preview'} className={mobileTab === 'preview' ? '' : 'secondary'} onClick={() => setMobileTab('preview')}>
          Vista previa
        </button>
      </div>

      <div className="design-layout" data-tab={mobileTab}>
        <div className="design-controls">
          <Group title="Plantilla">
            <div className="template-picker">
              {templates.map((t) => {
                const d = t.defaults(event)
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={`template-option${t.key === templateKey ? ' selected' : ''}`}
                    onClick={() => chooseTemplate(t.key)}
                    aria-pressed={t.key === templateKey}
                    aria-label={`Plantilla ${t.name}`}
                  >
                    <span className="swatches" aria-hidden>
                      <i style={{ background: d.colors.background }} />
                      <i style={{ background: d.colors.primary }} />
                      <i style={{ background: d.colors.text }} />
                    </span>
                    <strong>{t.name}</strong>
                    <span className="muted small">{t.description}</span>
                  </button>
                )
              })}
            </div>
          </Group>

          <Group title="Colores y letra">
            <div className="form grid-3">
              <ColorField label="Principal" value={colors.primary} onChange={(v) => set('colors', { ...colors, primary: v })} />
              <ColorField label="Fondo" value={colors.background} onChange={(v) => set('colors', { ...colors, background: v })} />
              <ColorField label="Texto" value={colors.text} onChange={(v) => set('colors', { ...colors, text: v })} />
            </div>
            <label className="field">
              Letra de títulos
              <select value={config.headingFont} onChange={(e) => set('headingFont', e.target.value as HeadingFont)}>
                {Object.entries(headingFonts).map(([value, f]) => (
                  <option key={value} value={value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="link small" onClick={resetStyle}>
              Restablecer colores de la plantilla
            </button>
          </Group>

          <Group title="Textos">
            <div className="form">
              <label>
                Encabezado
                <input value={texts.headline} onChange={(e) => set('texts', { ...texts, headline: e.target.value })} maxLength={80} />
              </label>
              <label>
                Nombres
                <input value={texts.names} onChange={(e) => set('texts', { ...texts, names: e.target.value })} placeholder="Ana & Luis" maxLength={120} />
              </label>
              <label>
                Mensaje
                <textarea rows={4} value={texts.message} onChange={(e) => set('texts', { ...texts, message: e.target.value })} maxLength={600} />
              </label>
              <label>
                Despedida
                <input value={texts.closing} onChange={(e) => set('texts', { ...texts, closing: e.target.value })} maxLength={120} />
              </label>
            </div>
            <p className="muted small">
              La fecha, la hora y el lugar se toman de los <Link to={`/app/events/${event.id}`}>datos del evento</Link>.
            </p>
          </Group>

          <Group title="Secciones">
            <div className="form">
              <Toggle label="Cuenta regresiva" checked={sections.countdown} onChange={(v) => set('sections', { ...sections, countdown: v })} />
              <Toggle label="Lugar y mapa" checked={sections.venue} onChange={(v) => set('sections', { ...sections, venue: v })} />

              <Toggle label="Itinerario" checked={sections.itinerary} onChange={(v) => set('sections', { ...sections, itinerary: v })} />
              {sections.itinerary && (
                <div className="nested">
                  {config.itinerary.map((item, i) => (
                    <div key={i} className="itinerary-row">
                      <input
                        type="time"
                        value={item.time}
                        aria-label="Hora"
                        onChange={(e) => set('itinerary', config.itinerary.map((it, j) => (j === i ? { ...it, time: e.target.value } : it)))}
                      />
                      <input
                        value={item.label}
                        aria-label="Actividad"
                        placeholder="Actividad"
                        maxLength={80}
                        onChange={(e) => set('itinerary', config.itinerary.map((it, j) => (j === i ? { ...it, label: e.target.value } : it)))}
                      />
                      <button type="button" className="danger small" aria-label="Quitar" onClick={() => set('itinerary', config.itinerary.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </div>
                  ))}
                  {config.itinerary.length < 12 && (
                    <button type="button" className="secondary small" onClick={() => set('itinerary', [...config.itinerary, { time: '', label: '' }])}>
                      Agregar actividad
                    </button>
                  )}
                </div>
              )}

              <Toggle label="Padres y padrinos" checked={sections.people} onChange={(v) => set('sections', { ...sections, people: v })} />
              {sections.people && (
                <div className="nested form">
                  <label>
                    Padres (uno por línea)
                    <textarea rows={3} value={config.people.parents} onChange={(e) => set('people', { ...config.people, parents: e.target.value })} maxLength={400} />
                  </label>
                  <label>
                    Padrinos (uno por línea)
                    <textarea rows={3} value={config.people.godparents} onChange={(e) => set('people', { ...config.people, godparents: e.target.value })} maxLength={600} />
                  </label>
                </div>
              )}

              <Toggle label="Código de vestimenta" checked={sections.dressCode} onChange={(v) => set('sections', { ...sections, dressCode: v })} />
              {sections.dressCode && (
                <div className="nested">
                  <input value={config.dressCode} onChange={(e) => set('dressCode', e.target.value)} aria-label="Código de vestimenta" placeholder="Formal" maxLength={120} />
                </div>
              )}

              <Toggle label="Mesa de regalos" checked={sections.gifts} onChange={(v) => set('sections', { ...sections, gifts: v })} />
              {sections.gifts && (
                <div className="nested form">
                  <label>
                    Mensaje
                    <textarea rows={2} value={config.gifts.message} onChange={(e) => set('gifts', { ...config.gifts, message: e.target.value })} maxLength={400} />
                  </label>
                  <label>
                    Link (Liverpool, Amazon, etc.)
                    <input type="url" value={config.gifts.link} onChange={(e) => set('gifts', { ...config.gifts, link: e.target.value })} placeholder="https://" maxLength={500} />
                  </label>
                </div>
              )}
            </div>
          </Group>
        </div>

        <div className="design-preview">
          <p className="muted small">Así la verá un invitado (ejemplo con 2 pases):</p>
          <div className="phone-frame">
            <InvitationView templateKey={templateKey} config={config} event={event} guest={sampleGuest} />
          </div>
        </div>
      </div>
    </main>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
