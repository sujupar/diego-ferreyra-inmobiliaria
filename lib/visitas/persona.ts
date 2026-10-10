/**
 * Persona cargada a mano en la ventana de agendar (cartel, otro, o alguien que
 * no está en la lista). Teléfono obligatorio: sin él no hay encuesta posible
 * (decisión del dueño, 2026-10-10). Email opcional. Módulo puro.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

export interface PersonaNueva {
  nombre: string
  telefono: string
  email: string | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function texto(v: unknown): string {
  return typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : ''
}

export function validarPersonaNueva(input: { nombre?: unknown; telefono?: unknown; email?: unknown }):
  { ok: true; valor: PersonaNueva } | { ok: false; errores: string[] } {
  const nombre = texto(input.nombre).slice(0, 80)
  const telefono = texto(input.telefono).slice(0, 40)
  const email = texto(input.email).toLowerCase()
  const errores: string[] = []
  if (nombre.length < 2 || !/\p{L}/u.test(nombre)) errores.push('Escribí el nombre de la persona')
  if (!ultimos10Digitos(telefono)) errores.push('El teléfono tiene que tener al menos 10 números (con código de área)')
  if (email && !EMAIL.test(email)) errores.push('El email no es válido')
  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, valor: { nombre, telefono, email: email || null } }
}
