import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import { getPublicInvitation } from '../api/public'
import InvitationView from '../templates/InvitationView'
import { getTemplate, resolveConfig } from '../templates/registry'

/** Invitación pública que abre cada invitado desde su link (y después desde el QR). */
export default function InvitationPage() {
  const { token = '' } = useParams()
  const invitation = useQuery({
    queryKey: ['public-invitation', token],
    queryFn: () => getPublicInvitation(token),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  })

  const title = invitation.data?.event.title
  useEffect(() => {
    if (title) document.title = title
  }, [title])

  if (invitation.isPending) return <main className="page narrow center">Cargando invitación…</main>
  if (invitation.isError) {
    const notFound = invitation.error instanceof ApiError && invitation.error.status === 404
    return (
      <main className="page narrow center">
        <h1>{notFound ? 'Invitación no encontrada' : 'No pudimos cargar la invitación'}</h1>
        <p className="muted">
          {notFound
            ? 'Revisa que el link esté completo o pide uno nuevo a quien te invitó.'
            : 'Intenta de nuevo en unos momentos.'}
        </p>
      </main>
    )
  }

  const { event, ...guest } = invitation.data
  const key = getTemplate(event.templateKey).key
  const config = resolveConfig(key, event, event.templateConfig)

  return (
    <div className="public-invitation">
      {guest.isPreview && (
        <div className="preview-banner">Vista previa · Esta invitación aún no está publicada</div>
      )}
      <InvitationView templateKey={key} config={config} event={event} guest={guest} />
    </div>
  )
}
