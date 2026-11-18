import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { getMe, logout } from '../api/auth'

/** Marco del panel del cliente: exige sesión y muestra la barra superior. */
export default function AppLayout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })

  const signOut = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear()
      navigate('/login')
    },
  })

  if (me.isPending) return <main className="page">Cargando…</main>
  if (me.isError) return <Navigate to="/login" replace />

  return (
    <>
      <header className="topbar">
        <Link to="/app" className="brand">
          Invitaciones
        </Link>
        <div className="topbar-user">
          <span className="muted">{me.data.email}</span>
          <button className="secondary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <Outlet />
    </>
  )
}
