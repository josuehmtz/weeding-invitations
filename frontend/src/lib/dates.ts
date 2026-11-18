/** ISO (UTC) → valor para <input type="datetime-local"> en la hora local del usuario. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Valor de <input type="datetime-local"> → ISO con zona horaria, o null si está vacío. */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

const formatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' })

export const formatDateTime = (iso: string) => formatter.format(new Date(iso))
