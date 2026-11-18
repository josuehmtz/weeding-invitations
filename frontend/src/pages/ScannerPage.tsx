import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import {
  checkIn,
  getStaffSession,
  scanCode,
  searchInvitations,
  staffLogin,
  staffLogout,
  undoCheckIn,
  type ScanResult,
  type StaffSession,
} from '../api/staff'
import QrCameraScanner from '../components/QrCameraScanner'

/** Pantalla de las hostess: entran con link + PIN, escanean QR y registran la entrada. */
export default function ScannerPage() {
  const { accessId } = useParams()
  const session = useQuery({ queryKey: ['staff-session'], queryFn: getStaffSession, retry: false })

  if (session.isPending) return <main className="page narrow center">Cargando…</main>

  // Sin sesión, o con sesión de otro acceso (otro link abierto en el mismo celular).
  const needsLogin = session.isError || (accessId && session.data.accessId !== accessId)
  if (needsLogin) {
    if (session.isError && !(session.error instanceof ApiError && session.error.status === 401))
      return (
        <main className="page narrow center">
          <p className="error">{session.error.message}</p>
        </main>
      )
    if (!accessId)
      return (
        <main className="page narrow center">
          <h1>Acceso de hostess</h1>
          <p className="muted">Abre el link que te compartieron los organizadores del evento.</p>
        </main>
      )
    return <PinForm accessId={accessId} />
  }

  return <Station session={session.data!} />
}

function PinForm({ accessId }: { accessId: string }) {
  const queryClient = useQueryClient()
  const [pin, setPin] = useState('')
  const login = useMutation({
    mutationFn: () => staffLogin(accessId, pin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-session'] }),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate()
  }

  return (
    <main className="page narrow center">
      <h1>Acceso de hostess</h1>
      <p className="muted">Escribe el PIN de 6 dígitos que te dieron los organizadores.</p>
      <form className="form pin-form" onSubmit={submit}>
        <input
          className="pin-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          aria-label="PIN"
          autoFocus
          required
        />
        {login.error && <p className="error">{login.error.message}</p>}
        <button type="submit" disabled={pin.length !== 6 || login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

function Station({ session }: { session: StaffSession }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'scan' | 'search'>('scan')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [lastCheckInId, setLastCheckInId] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const refreshSession = () => queryClient.invalidateQueries({ queryKey: ['staff-session'] })

  const scan = useMutation({
    mutationFn: scanCode,
    onMutate: () => setScanError(null),
    onSuccess: (r) => {
      navigator.vibrate?.(80)
      setLastCheckInId(null)
      setResult(r)
    },
    onError: (err) => {
      navigator.vibrate?.([60, 60, 60])
      if (err instanceof ApiError && err.status === 401) return refreshSession()
      setScanError(err.message)
    },
  })

  const logout = useMutation({
    mutationFn: staffLogout,
    onSettled: () => queryClient.resetQueries({ queryKey: ['staff-session'] }),
  })

  const next = () => {
    setResult(null)
    setLastCheckInId(null)
    setScanError(null)
  }

  return (
    <main className="page narrow scanner">
      <header className="scanner-header">
        <div>
          <strong>{session.eventTitle}</strong>
          <span className="muted small">{session.label}</span>
        </div>
        <div className="scanner-counter" aria-label="Personas que han llegado">
          <span className="stat-value">{session.checkedIn}</span>
          <span className="muted small">de {session.confirmedPasses} confirmados</span>
        </div>
      </header>

      {result ? (
        <ResultCard
          result={result}
          lastCheckInId={lastCheckInId}
          onChange={(r, checkInId) => {
            setResult(r)
            setLastCheckInId(checkInId)
            refreshSession()
          }}
          onNext={next}
        />
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'scan'} className={tab === 'scan' ? '' : 'secondary'} onClick={() => setTab('scan')}>
              Escanear QR
            </button>
            <button role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? '' : 'secondary'} onClick={() => setTab('search')}>
              Buscar por nombre
            </button>
          </div>

          {scanError && (
            <div className="scan-alert" role="alert">
              <p>{scanError}</p>
              <button className="secondary small" onClick={() => setScanError(null)}>
                Intentar de nuevo
              </button>
            </div>
          )}

          {tab === 'scan' ? (
            scan.isPending ? (
              <p className="center">Buscando invitación…</p>
            ) : (
              !scanError && <QrCameraScanner onScan={(content) => scan.mutate(content)} />
            )
          ) : (
            <Search onPick={(token) => scan.mutate(token)} />
          )}
        </>
      )}

      <button className="link small logout" onClick={() => logout.mutate()}>
        Cerrar sesión
      </button>
    </main>
  )
}

function ResultCard({ result, lastCheckInId, onChange, onNext }: {
  result: ScanResult
  lastCheckInId: string | null
  onChange: (r: ScanResult, checkInId: string | null) => void
  onNext: () => void
}) {
  const pendingConfirmed = Math.max(0, result.confirmedPasses - result.checkedIn)
  const suggested = Math.min(result.remaining, result.rsvpStatus === 'Confirmed' && pendingConfirmed > 0 ? pendingConfirmed : result.remaining)
  const [count, setCount] = useState(Math.max(1, suggested))

  const register = useMutation({
    mutationFn: () => checkIn(result.token, count),
    onSuccess: (r) => onChange(r, r.checkIns[r.checkIns.length - 1]?.id ?? null),
  })
  const undo = useMutation({
    mutationFn: (id: string) => undoCheckIn(id),
    onSuccess: (r) => onChange(r, null),
  })

  const tablesText =
    result.tables.length === 0 ? 'Mesa sin asignar' : `${result.tables.length === 1 ? 'Mesa' : 'Mesas'} ${result.tables.join(', ')}`
  const justRegistered = lastCheckInId !== null
  const full = result.remaining === 0

  return (
    <section className={`card result-card${justRegistered ? ' ok' : full ? ' full' : ''}`}>
      {justRegistered && <p className="result-banner">✓ Entrada registrada</p>}
      <h1 className="result-name">{result.displayName}</h1>
      <p className="result-table">{tablesText}</p>

      <dl className="result-facts">
        <div>
          <dt>Pases</dt>
          <dd>{result.passes}</dd>
        </div>
        <div>
          <dt>Confirmados</dt>
          <dd>{result.rsvpStatus === 'Confirmed' ? result.confirmedPasses : '—'}</dd>
        </div>
        <div>
          <dt>Ya entraron</dt>
          <dd>{result.checkedIn}</dd>
        </div>
      </dl>

      {result.warnings.map((w) => (
        <p key={w} className="result-warning">
          {w}
        </p>
      ))}

      {result.guests.length > 0 && (
        <ul className="result-guests">
          {result.guests.map((g, i) => (
            <li key={i}>
              <span>{g.name}</span>
              <span className="muted">{g.tableNumber ? `Mesa ${g.tableNumber}` : ''}</span>
            </li>
          ))}
        </ul>
      )}

      {!justRegistered && !full && (
        <div className="checkin-row">
          <div className="stepper" aria-label="Personas que entran">
            <button className="secondary" onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} aria-label="Menos">
              −
            </button>
            <span>{count}</span>
            <button className="secondary" onClick={() => setCount((c) => Math.min(result.remaining, c + 1))} disabled={count >= result.remaining} aria-label="Más">
              +
            </button>
          </div>
          <button className="big" onClick={() => register.mutate()} disabled={register.isPending}>
            {register.isPending ? 'Registrando…' : `Registrar entrada (${count})`}
          </button>
        </div>
      )}
      {full && !justRegistered && <p className="result-warning">Ya entraron todos los lugares de esta invitación.</p>}
      {(register.error || undo.error) && <p className="error">{(register.error ?? undo.error)!.message}</p>}

      <div className="actions">
        <button className="big" onClick={onNext}>
          Escanear siguiente
        </button>
        {justRegistered && (
          <button className="secondary" onClick={() => undo.mutate(lastCheckInId)} disabled={undo.isPending}>
            Deshacer
          </button>
        )}
      </div>
    </section>
  )
}

function Search({ onPick }: { onPick: (token: string) => void }) {
  const [q, setQ] = useState('')
  const term = q.trim()
  const results = useQuery({
    queryKey: ['staff-search', term],
    queryFn: () => searchInvitations(term),
    enabled: term.length >= 2,
  })

  return (
    <div className="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Apellido o nombre del invitado"
        aria-label="Buscar invitado"
        autoFocus
      />
      {results.data?.length === 0 && <p className="muted">Sin resultados.</p>}
      <ul className="search-results">
        {results.data?.map((r) => (
          <li key={r.token}>
            <button className="secondary" onClick={() => onPick(r.token)}>
              <strong>{r.displayName}</strong>
              <span className="muted small">
                {r.passes} pases · {r.checkedIn > 0 ? `ya entraron ${r.checkedIn}` : 'no ha llegado'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
