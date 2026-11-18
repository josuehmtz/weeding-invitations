import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { login, register } from '../api/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'register') await register({ email, password })
      await login({ email, password })
    },
    onSuccess: () => {
      // Descarta un "sin sesión" cacheado de una visita anterior a /app.
      queryClient.removeQueries({ queryKey: ['me'] })
      navigate('/app')
    },
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit.mutate()
  }

  return (
    <main className="page narrow">
      <h1>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
      <form onSubmit={onSubmit} className="form">
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {submit.isError && (
          <p className="error">
            {mode === 'login' ? 'Correo o contraseña incorrectos.' : submit.error.message}
          </p>
        )}
        <button type="submit" disabled={submit.isPending}>
          {mode === 'login' ? 'Entrar' : 'Registrarme'}
        </button>
      </form>
      <button className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
      </button>
    </main>
  )
}
