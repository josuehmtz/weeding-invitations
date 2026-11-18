import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

interface Props {
  value: string
  /** Nombre del archivo al descargar (sin extensión). */
  fileName: string
  color?: string
  className?: string
}

/** QR generado en el navegador (sin servicios externos) con botón para descargarlo como PNG. */
export default function QrCode({ value, fileName, color = '#000000', className }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, {
      width: 600,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: color, light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [value, color])

  if (!src) return <div className={`qr-placeholder ${className ?? ''}`} aria-hidden />

  return (
    <div className={className}>
      <img src={src} alt="Código QR de acceso" className="qr-image" width={220} height={220} />
      <a className="tpl-button" href={src} download={`${fileName}.png`}>
        Descargar QR
      </a>
    </div>
  )
}
