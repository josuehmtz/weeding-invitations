import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onScan: (content: string) => void
}

/** Cámara trasera leyendo códigos QR. Se detiene al desmontarse (al mostrar un resultado). */
export default function QrCameraScanner({ onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let done = false
    const scanner = new QrScanner(
      video,
      (result) => {
        if (done) return
        done = true // Evita lecturas repetidas del mismo QR mientras se procesa.
        onScanRef.current(result.data)
      },
      { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8 },
    )
    scanner.start().catch((err: unknown) => {
      const msg = String(err)
      setError(
        msg.includes('NotAllowed') || msg.includes('Permission')
          ? 'Sin permiso para usar la cámara. Actívalo en la configuración del navegador o usa la búsqueda por nombre.'
          : 'No se encontró una cámara disponible. Usa la búsqueda por nombre.',
      )
    })
    return () => scanner.destroy()
  }, [])

  return (
    <div className="scanner-camera">
      <video ref={videoRef} muted playsInline />
      {error && <p className="scanner-camera-error">{error}</p>}
    </div>
  )
}
