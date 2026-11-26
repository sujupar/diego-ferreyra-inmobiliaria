// Cómo se muestra y se marca el teléfono en la ficha ("Llamar · 11 5555-0142"). Puro.
// Solo se reformatea lo que se sabe cortar sin adivinar (la característica 11, de dos
// dígitos): con otra característica (3 o 4 dígitos) el corte sería una apuesta, y un
// número mal agrupado se lee como otro número. Ese caso se muestra como está guardado.
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

export function telefonoParaMostrar(tel: string | null | undefined): string | null {
  const limpio = tel?.trim()
  if (!limpio) return null
  const d = ultimos10Digitos(limpio)
  if (d && d.startsWith('11')) return `11 ${d.slice(2, 6)}-${d.slice(6)}`
  return limpio
}

/** `tel:` para el marcador del teléfono propio (la plataforma no llama a nadie). */
export function enlaceTel(tel: string): string {
  const digitos = tel.replace(/\D/g, '')
  if (tel.trim().startsWith('+')) return `tel:+${digitos}`
  if (digitos.length === 10) return `tel:+549${digitos}`
  return `tel:${digitos}`
}
