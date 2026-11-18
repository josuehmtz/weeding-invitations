/**
 * Convierte un teléfono mexicano a formato internacional para wa.me (solo dígitos).
 * 10 dígitos → se antepone 52. Si ya trae lada de país, se respeta.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `52${digits}`
  if (digits.length >= 11 && digits.length <= 15) return digits
  return null
}

/** Link que abre WhatsApp con el mensaje ya escrito (gratis, sin API). */
export function whatsAppLink(phone: string | null | undefined, text: string): string | null {
  const number = toWhatsAppNumber(phone)
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null
}
