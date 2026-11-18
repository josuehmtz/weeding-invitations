import { useParams } from 'react-router'

/** Invitación pública: plantilla del evento + confirmación de asistencia + QR (tras confirmar). */
export default function InvitationPage() {
  const { token } = useParams()

  return (
    <main className="page narrow">
      <h1>Invitación</h1>
      <p className="muted">Token: {token}</p>
      <p className="muted">Próximamente: plantilla personalizada, confirmación de asistencia y código QR.</p>
    </main>
  )
}
