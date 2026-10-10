/**
 * ¿Esta persona ya es un comprador registrado de ESTA propiedad?
 * Por teléfono (últimos 10 dígitos, nunca igualdad exacta — CLAUDE.md §Teléfonos)
 * y, si no, por email. Nunca pisa un dato que ya existe: solo completa huecos
 * (un teléfono mal tipeado no puede cambiarle los datos a otra persona).
 *
 * El email SOLO identifica a la misma persona si alguno de los dos lados no
 * tiene un teléfono utilizable. Con los dos teléfonos puestos y DISTINTOS, un
 * email compartido (una casilla familiar, la de la inmobiliaria, un error de
 * tipeo) no alcanza para asumir que es la misma persona — uniría a dos
 * compradores reales bajo un solo registro.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

export interface CompradorExistente {
  id: string
  phone: string | null
  email: string | null
  created_at: string
}

export type DecisionComprador =
  | { accion: 'reusar'; leadId: string; completar: { phone?: string; email?: string } }
  | { accion: 'crear' }

export function decidirComprador(
  existentes: CompradorExistente[],
  entrada: { telefono: string | null; email: string | null },
): DecisionComprador {
  const norm = ultimos10Digitos(entrada.telefono)
  const email = entrada.email?.trim().toLowerCase() || null
  const masNuevosPrimero = [...existentes].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const porTelefono = norm ? masNuevosPrimero.find(e => ultimos10Digitos(e.phone) === norm) : undefined
  const porEmail = email
    ? masNuevosPrimero.find(e => e.email?.trim().toLowerCase() === email && (norm === null || ultimos10Digitos(e.phone) === null))
    : undefined
  const encontrado = porTelefono ?? porEmail ?? null
  if (!encontrado) return { accion: 'crear' }
  const completar: { phone?: string; email?: string } = {}
  if (!encontrado.phone && entrada.telefono) completar.phone = entrada.telefono
  if (!encontrado.email && email) completar.email = email
  return { accion: 'reusar', leadId: encontrado.id, completar }
}
