/**
 * Las personas que se ofrecen en el paso "Persona" de la ventana de agendar.
 * Consulta de portal → quienes consultaron por ESA propiedad. Publicidad → los
 * registrados en su landing, con la publicidad que los trajo. Cartel/otro →
 * nadie: se cargan a mano. Módulo puro y seguro para el navegador.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { ORIGEN_INFO, PORTAL_ETIQUETA, origenDesdeLead, type OrigenVisita } from './origen'
import type { ConsultaR, RegistroR, VisitaActivaR } from './tipos'

export const MAX_INTERESADOS = 200

export interface Interesado {
  clave: string
  tipo: 'consulta' | 'registro'
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  detalle: string
  fecha: string
  tieneTelefono: boolean
  consultas: number
  coincideConElOrigen: boolean
  visitaActiva: { id: string; scheduled_at: string } | null
}

interface Datos {
  consultas: ConsultaR[]
  registros: RegistroR[]
  visitasActivas: VisitaActivaR[]
}

function visitaDe(visitas: VisitaActivaR[], tipo: 'consulta' | 'registro', id: string, telefono: string | null) {
  const norm = ultimos10Digitos(telefono)
  const v = visitas.find(x =>
    (tipo === 'registro' && x.lead_id === id) || (norm !== null && ultimos10Digitos(x.client_phone) === norm))
  return v ? { id: v.id, scheduled_at: v.scheduled_at } : null
}

/** Ordena (ya ordenado de más nuevo a más viejo) y colapsa el mismo teléfono en una persona. */
function sinRepetir(lista: Interesado[]): Interesado[] {
  const vistos = new Map<string, Interesado>()
  const salida: Interesado[] = []
  for (const i of lista) {
    const norm = ultimos10Digitos(i.telefono)
    if (!norm) { salida.push(i); continue }
    const previo = vistos.get(norm)
    if (previo) { previo.consultas += 1; continue }
    vistos.set(norm, i)
    salida.push(i)
  }
  return salida
}

function porFechaDesc(a: { fecha: string }, b: { fecha: string }): number {
  return b.fecha.localeCompare(a.fecha)
}

export function interesadosParaOrigen(origen: OrigenVisita, datos: Datos): Interesado[] {
  if (origen === 'portal') {
    const lista: Interesado[] = datos.consultas
      .map(c => {
        const fecha = c.received_at ?? c.created_at
        return {
          clave: `consulta:${c.id}`, tipo: 'consulta' as const, id: c.id,
          nombre: c.lead_name?.trim() || 'Sin nombre',
          telefono: c.lead_phone, email: c.lead_email,
          detalle: PORTAL_ETIQUETA[c.portal] ?? c.portal,
          fecha, tieneTelefono: ultimos10Digitos(c.lead_phone) !== null, consultas: 1,
          coincideConElOrigen: true,
          visitaActiva: visitaDe(datos.visitasActivas, 'consulta', c.id, c.lead_phone),
        }
      })
      .sort(porFechaDesc)
    return sinRepetir(lista).slice(0, MAX_INTERESADOS)
  }

  if (origen === 'publicidad_meta' || origen === 'publicidad_paga') {
    const lista: Interesado[] = datos.registros
      .filter(r => !r.deleted_at && !r.suspected_bot && (r.source ?? 'landing') === 'landing')
      .map(r => {
        const derivado = origenDesdeLead({ source: r.source, utm: r.utm })
        const base = ORIGEN_INFO[derivado.origen].etiqueta
        return {
          clave: `registro:${r.id}`, tipo: 'registro' as const, id: r.id,
          nombre: r.name?.trim() || 'Sin nombre',
          telefono: r.phone, email: r.email,
          detalle: derivado.detalle && derivado.origen !== 'otro' ? `${base} · ${derivado.detalle}` : (derivado.detalle ?? base),
          fecha: r.created_at, tieneTelefono: ultimos10Digitos(r.phone) !== null, consultas: 1,
          coincideConElOrigen: derivado.origen === origen,
          visitaActiva: visitaDe(datos.visitasActivas, 'registro', r.id, r.phone),
        }
      })
      .sort((a, b) => Number(b.coincideConElOrigen) - Number(a.coincideConElOrigen) || porFechaDesc(a, b))
    return sinRepetir(lista).slice(0, MAX_INTERESADOS)
  }

  return []
}

function plano(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function filtrarInteresados(lista: Interesado[], texto: string): Interesado[] {
  const t = plano(texto.trim())
  if (!t) return lista
  const digitos = texto.replace(/\D/g, '')
  return lista.filter(i => {
    if (plano(i.nombre).includes(t)) return true
    if (digitos.length >= 4 && (i.telefono ?? '').replace(/\D/g, '').includes(digitos.slice(-8))) return true
    return false
  })
}
