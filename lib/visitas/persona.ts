/**
 * Persona cargada a mano en la ventana de agendar (cartel, otro, o alguien que
 * no está en la lista). Teléfono obligatorio: sin él no hay encuesta posible
 * (decisión del dueño, 2026-10-10). Email opcional. Módulo puro.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { leerTelefono } from '@/lib/consultas/telefono'

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

/**
 * Formato ÚNICO para guardar un teléfono de visita (`property_visits.client_phone`,
 * y lo que llega a `asegurarComprador`/`completarTelefonoDelRegistro`): E.164 con
 * '+' cuando `normalizeWhatsappPhone` puede CONFIRMAR que es un número real
 * (lib/integrations/whatsapp/phone.ts, libphonenumber-js contra la metadata real,
 * no una heurística de longitud). Así "011 15 5823-4521" y "11 5823-4521" —el
 * mismo celular argentino, escrito con y sin el "15"— quedan guardados
 * IDÉNTICOS; sin esto, `ultimos10Digitos` ya los trata igual para comparar, pero
 * la FILA queda con el texto crudo de quien lo escribió, y dos cargas de la
 * misma persona en días distintos podrían guardar formatos distintos sin que
 * nada lo note. Si no se puede confirmar (texto raro, número extranjero no
 * reconocido), se guarda el texto tal cual recortado de espacios — NUNCA se
 * inventa un número.
 */
export function telefonoCanonico(tel: string): string {
  const leido = leerTelefono(tel)
  // Si `leerTelefono` no lo da por bueno se guarda crudo: el normalizador viejo
  // "completaba" cualquier cosa con un código de país inventado (4571430985
  // quedaba +4571430985, un número extranjero que nadie escribió).
  return leido.ok ? leido.canonico : tel.trim()
}

/**
 * Teléfono a usar cuando la persona YA existe (consulta de portal, registro
 * del formulario público): el que manda el navegador en la ventana de
 * "Agendar" es solo una SUGERENCIA del asesor (a veces ni la toca, queda lo
 * que precargó la pantalla) — el teléfono GUARDADO es la fuente de verdad SI
 * ya es válido. Si no (falta, o no llega a 10 dígitos), recién ahí se usa lo
 * que mandó el navegador. Decisión de la ronda 1 de revisión de la Tarea 8:
 * sin esto, un typo en ese campo del formulario podía pisarle el teléfono
 * real a una consulta/registro existente.
 */
export function telefonoEfectivo(guardado: string | null | undefined, enviado: string | null | undefined): string {
  const g = (guardado ?? '').trim()
  // "Válido" es válido PARA WHATSAPP (leerTelefono), no "tiene 10 dígitos":
  // 541103305864 tiene 12 y no sirve; si el asesor lo corrigió en la pantalla,
  // tiene que ganar el corregido.
  if (leerTelefono(g).ok) return g
  return (enviado ?? '').trim() || g
}
