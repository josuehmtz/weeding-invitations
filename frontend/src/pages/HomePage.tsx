import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { getPlans } from '../api/client'

export default function HomePage() {
  const plans = useQuery({ queryKey: ['plans'], queryFn: getPlans })

  return (
    <main className="page">
      <h1>Invitaciones digitales con QR</h1>
      <p>Bodas, XV años y más: invitación, confirmación de asistencia, mesas y acceso con QR.</p>

      <h2>Paquetes</h2>
      {plans.isPending && <p>Cargando…</p>}
      {plans.isError && <p className="error">No se pudo conectar con la API.</p>}
      {plans.data && (
        <ul className="plans">
          {plans.data.map((p) => (
            <li key={p.code}>
              <strong>{p.name}</strong>
              <span>Hasta {p.maxPasses} invitados</span>
            </li>
          ))}
        </ul>
      )}

      <Link to="/login">Iniciar sesión</Link>
    </main>
  )
}
