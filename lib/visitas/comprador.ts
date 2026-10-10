/**
 * ¿Esta persona ya es un comprador registrado de ESTA propiedad?
 * Por teléfono (últimos 10 dígitos, nunca igualdad exacta — CLAUDE.md §Teléfonos)
 * y, si no, por email. Nunca pisa un dato que ya existe: solo completa huecos
 * (un teléfono mal tipeado no puede cambiarle los datos a otra persona).
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
  const encontrado =
    (norm && masNuevosPrimero.find(e => ultimos10Digitos(e.phone) === norm)) ||
    (email && masNuevosPrimero.find(e => e.email?.trim().toLowerCase() === email)) ||
    null
  if (!encontrado) return { accion: 'crear' }
  const completar: { phone?: string; email?: string } = {}
  if (!encontrado.phone && entrada.telefono) completar.phone = entrada.telefono
  if (!encontrado.email && email) completar.email = email
  return { accion: 'reusar', leadId: encontrado.id, completar }
}
