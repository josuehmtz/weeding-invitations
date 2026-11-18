export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface ProblemDetails {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}

/** Convierte un ProblemDetails del backend en un mensaje legible. */
async function readError(res: Response): Promise<string> {
  try {
    const p = (await res.json()) as ProblemDetails
    if (p.errors) return Object.values(p.errors).flat().join(' ')
    return p.detail ?? p.title ?? `Error ${res.status}`
  } catch {
    return `Error ${res.status}`
  }
}

/** fetch hacia /api con la cookie de sesión incluida y JSON por defecto. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const send = <T>(method: string, path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export interface Plan {
  code: string
  name: string
  maxPasses: number
  priceMxn: number
}

export const getPlans = () => api<Plan[]>('/plans')
