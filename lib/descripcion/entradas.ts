/**
 * Arma el mensaje de DATOS del paso de escritura: todo lo que el modelo puede
 * afirmar, en bloques rotulados que el prompt (`metodo-diego.ts`) nombra uno
 * por uno.
 *
 * Reglas que viven ACÁ y no en el prompt, porque tienen que cumplirse siempre:
 *  - El motivo de venta y el plazo del dueño (`reason_for_sale`,
 *    `sale_timeframe`) NUNCA salen de este módulo: son datos privados del
 *    cliente y un modelo no distingue qué es publicable.
 *  - Piso 0 se escribe "Planta baja": con "Piso: 0" el generador anterior
 *    escribió "primer piso" (Díaz Colodrero).
 *  - Lo que escribió una persona (respuestas, notas) o viene de la web va entre
 *    « » y sin « » adentro, para que no pueda cerrar el delimitador y colarse
 *    como instrucción.
 */
import type { SaleVisitData } from '@/types/visit-data.types'
import type { RespuestaConocida } from './respuestas'
import type { InventarioFotos, ZonaInvestigada } from './tipos'
import { lineasATexto } from './zona-mapa'

export interface PropiedadParaEscribir {
  property_type: string
  operation_type?: string | null
  address: string
  neighborhood: string
  city?: string | null
  asking_price: number
  currency: string
  expensas?: number | null
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  total_area?: number | null
  floor?: number | null
  age?: number | null
  amenities?: unknown
}

export interface EntradaEscritura {
  propiedad: PropiedadParaEscribir
  visita: SaleVisitData | null
  portalData: unknown
  respuestas: RespuestaConocida[]
  inventario: InventarioFotos | null
  zona: ZonaInvestigada | null
  comprador: string | null
  notas: string | null
}

export type TipologiaDiego = 'CASA' | 'DEPARTAMENTO' | 'PH'

/** Diego escribió estructuras para casa, departamento y PH; el resto cae en la más cercana. */
export function tipologiaDiego(tipo: string): TipologiaDiego {
  const t = (tipo ?? '').trim().toLowerCase()
  if (t === 'ph') return 'PH'
  if (t === 'casa' || t === 'terreno' || t === 'quinta' || t === 'chalet') return 'CASA'
  return 'DEPARTAMENTO'
}

/** Texto de una persona o de la web, listo para ir como DATO. */
export function dato(t: string): string {
  return `«${t.replace(/[«»]/g, '').replace(/\s+/g, ' ').trim()}»`
}

const ORIENTACION: Record<string, string> = {
  N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste', NE: 'Noreste', NO: 'Noroeste', SE: 'Sudeste', SO: 'Sudoeste',
}
const DISPOSICION: Record<string, string> = {
  frente: 'Frente', contrafrente: 'Contrafrente', interno: 'Interno', lateral: 'Lateral',
}
const CALIDAD: Record<string, string> = {
  economica: 'económica', buena_economica: 'buena económica', buena: 'buena', muy_buena: 'muy buena', excelente: 'excelente',
}
/** Escala Ross-Heidecke del formulario de visita, en palabras de aviso. */
const CONSERVACION: Record<string, string> = {
  estado_1: 'a nuevo', estado_1_5: 'muy bueno', estado_2: 'bueno', estado_2_5: 'bueno, con detalles a mejorar',
  estado_3: 'necesita reparaciones sencillas', estado_3_5: 'necesita reparaciones', estado_4: 'necesita reparaciones importantes',
  estado_4_5: 'a refaccionar', estado_5: 'a demoler',
}

/** Atributos de MercadoLibre/Argenprop más comunes. El resto se muestra con su id legible. */
const ATRIBUTO_PORTAL: Record<string, string> = {
  HAS_BALCONY: 'Balcón', HAS_TERRACE: 'Terraza', HAS_LIFT: 'Ascensor', HAS_SWIMMING_POOL: 'Pileta',
  HAS_GRILL: 'Parrilla', HAS_GYM: 'Gimnasio', HAS_HEATING: 'Calefacción', HAS_AIR_CONDITIONING: 'Aire acondicionado',
  HAS_CLOSETS: 'Placards', HAS_LAUNDRY: 'Lavadero', HAS_SECURITY: 'Seguridad', HAS_GARDEN: 'Jardín',
  HAS_PATIO: 'Patio', HAS_PLAYGROUND: 'Área de juegos', HAS_PARTY_ROOM: 'SUM', HAS_ELECTRIC_GENERATOR: 'Grupo electrógeno',
  IS_SUITABLE_FOR_PETS: 'Apto mascotas', UNITS_PER_FLOOR: 'Departamentos por piso', FLOORS: 'Pisos del edificio',
  DISPOSITION: 'Disposición', FACING: 'Orientación', PARKING_LOTS: 'Cocheras', WAREHOUSES: 'Bauleras',
  BALCONY_AREA: 'Superficie del balcón',
  ESTADO_PROPIEDAD: 'Estado de la propiedad', DISPOSICION: 'Disposición', ORIENTACION: 'Orientación', SUBTIPO: 'Subtipo',
}
/**
 * Repiten datos que ya están en DATOS CARGADOS. Se omiten para no ofrecerle al
 * modelo dos valores del mismo dato (Doblas 248: ficha 17 años, ML "10 años").
 */
const DUPLICADOS_DE_LA_FICHA = new Set([
  'ROOMS', 'BEDROOMS', 'FULL_BATHROOMS', 'COVERED_AREA', 'TOTAL_AREA', 'PROPERTY_AGE', 'UNIT_FLOOR',
])

function etiquetaAtributo(id: string): string {
  if (ATRIBUTO_PORTAL[id]) return ATRIBUTO_PORTAL[id]
  const legible = id.toLowerCase().replace(/_/g, ' ')
  return legible.charAt(0).toUpperCase() + legible.slice(1)
}

function numeroAr(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function listaDeAmenities(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k.replace(/_/g, ' '))
  }
  return []
}

function limpiar(t: string): string {
  return t.replace(/[«»]/g, '').replace(/\s+/g, ' ').trim()
}

function bloqueDatosCargados(p: PropiedadParaEscribir): string[] {
  const l: string[] = ['# DATOS CARGADOS (mandan sobre todo lo demás)']
  const push = (etiqueta: string, valor: string | null) => { if (valor) l.push(`- ${etiqueta}: ${valor}`) }
  const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  push('Operación', p.operation_type || 'venta')
  push('Dirección', limpiar(p.address))
  push('Barrio', limpiar(p.neighborhood))
  push('Ciudad', p.city ? limpiar(p.city) : null)
  const moneda = p.currency === 'USD' ? 'US$' : '$'
  push('Precio (NO lo menciones: es para ubicar el segmento)', n(p.asking_price) ? `${moneda} ${numeroAr(p.asking_price)}` : null)
  push('Expensas', n(p.expensas) ? `$ ${numeroAr(p.expensas as number)} por mes` : null)
  push('Ambientes', n(p.rooms)?.toString() ?? null)
  push('Dormitorios', n(p.bedrooms)?.toString() ?? null)
  push('Baños', n(p.bathrooms)?.toString() ?? null)
  push('Cocheras', n(p.garages) ? String(p.garages) : null)
  push('Superficie cubierta', n(p.covered_area) ? `${numeroAr(p.covered_area as number)} m²` : null)
  push('Superficie total', n(p.total_area) ? `${numeroAr(p.total_area as number)} m²` : null)
  const piso = n(p.floor)
  push('Piso', piso === null ? null : piso === 0 ? 'Planta baja' : `${piso}°`)
  push('Antigüedad', n(p.age) ? `${p.age} años` : n(p.age) === 0 ? 'a estrenar' : null)
  const amenities = listaDeAmenities(p.amenities)
  push('Amenities', amenities.length ? amenities.map(limpiar).join(', ') : null)
  return l
}

function bloqueVisita(v: SaleVisitData): string[] {
  const l: string[] = ['# DATOS DE LA VISITA (relevados por el asesor en la propiedad)']
  const push = (etiqueta: string, valor: string | null | undefined) => { if (valor) l.push(`- ${etiqueta}: ${valor}`) }
  push('Orientación', v.orientation ? ORIENTACION[v.orientation] : null)
  push('Disposición', v.disposition ? DISPOSICION[v.disposition] : null)
  push('Pisos del edificio', v.total_floors ? String(v.total_floors) : null)
  push('Calidad de construcción', v.quality ? CALIDAD[v.quality] : null)
  push('Estado de conservación', v.conservation ? CONSERVACION[v.conservation] : null)
  push('Reciclada', v.is_refurbished ? 'sí' : null)
  push('Superficie semicubierta', v.semi_covered_m2 ? `${numeroAr(v.semi_covered_m2)} m²` : null)
  push('Superficie descubierta', v.uncovered_m2 ? `${numeroAr(v.uncovered_m2)} m²` : null)
  push('Superficie del terreno', v.terrain_m2 ? `${numeroAr(v.terrain_m2)} m²` : null)
  const caracteristicas = (v.construction_features ?? []).filter(Boolean).map(limpiar)
  push('Características', caracteristicas.length ? caracteristicas.join(', ') : null)
  const fuertes = (v.strong_points ?? []).filter(Boolean)
  push('Puntos fuertes según el asesor', fuertes.length ? dato(fuertes.join('; ')) : null)
  push('Notas de la visita', v.extra_notes?.trim() ? dato(v.extra_notes) : null)
  // reason_for_sale y sale_timeframe NO se leen acá, a propósito (ver cabecera).
  return l.length > 1 ? l : []
}

function bloquePortales(portalData: unknown): string[] {
  const pd = portalData && typeof portalData === 'object' ? (portalData as Record<string, unknown>) : {}
  const l: string[] = []
  for (const portal of ['ml', 'ap']) {
    const attrs = pd[portal] && typeof pd[portal] === 'object' ? (pd[portal] as Record<string, unknown>) : {}
    for (const [id, crudo] of Object.entries(attrs)) {
      if (DUPLICADOS_DE_LA_FICHA.has(id)) continue
      const v = crudo && typeof crudo === 'object' ? (crudo as { value_name?: unknown; value_id?: unknown }) : {}
      const valor = typeof v.value_name === 'string' && v.value_name.trim() ? v.value_name
        : typeof v.value_id === 'string' && v.value_id.trim() ? v.value_id : ''
      if (valor) l.push(`- ${etiquetaAtributo(id)}: ${limpiar(valor)}`)
    }
  }
  return l.length ? ['# CHECKLIST DE PORTALES (cargado por el asesor)', ...l] : []
}

function bloqueRespuestas(respuestas: RespuestaConocida[]): string[] {
  if (!respuestas.length) return []
  return [
    '# RESPUESTAS DEL ASESOR (preguntas que ya contestó)',
    ...respuestas.map(r => r.tema === 'objecion'
      ? `- OBJECIÓN (solo para no afirmar lo contrario; NUNCA la menciones): ${limpiar(r.pregunta)} → ${dato(r.respuesta)}`
      : `- ${limpiar(r.pregunta)} → ${dato(r.respuesta)}`),
  ]
}

const USO: Record<InventarioFotos['exteriores'][number]['uso'], string> = {
  propio: 'propio de la unidad', comun: 'común del edificio', no_se_sabe: 'no se sabe',
}

function fotos(ns: number[]): string {
  return ns.length === 1 ? `foto ${ns[0]}` : `fotos ${ns.join(', ')}`
}

function bloqueInventario(inv: InventarioFotos): string[] {
  const l: string[] = ['# LO QUE SE VE EN LAS FOTOS (inventario del análisis de las fotos)']
  if (inv.ambientes.length) {
    l.push('Ambientes:')
    for (const a of inv.ambientes) l.push(`- ${limpiar(a.nombre)} (${fotos(a.fotos)}): ${limpiar(a.detalle)}`)
  }
  if (inv.exteriores.length) {
    l.push('Exteriores:')
    for (const e of inv.exteriores) l.push(`- ${limpiar(e.espacio)} — uso: ${USO[e.uso]} (${fotos(e.fotos)}): ${limpiar(e.detalle)}`)
  }
  const lista = (etiqueta: string, xs: string[]) => { if (xs.length) l.push(`${etiqueta}: ${xs.map(limpiar).join('; ')}`) }
  lista('Edificio (partes comunes)', inv.edificio)
  lista('Vistas', inv.vistas)
  if (inv.estilo) l.push(`Estilo: ${limpiar(inv.estilo)}`)
  if (inv.estadoGeneral) l.push(`Estado general: ${limpiar(inv.estadoGeneral)}`)
  lista('Puntos fuertes', inv.puntosFuertes)
  lista('No se puede saber por las fotos', inv.noSeVe)
  if (inv.fotosAmbientadas.length) {
    l.push(`Fotos ambientadas o renders (sus muebles NO vienen incluidos): ${inv.fotosAmbientadas.join(', ')}`)
  }
  return l
}

function bloqueZona(zona: ZonaInvestigada | null): string[] {
  const lugares = zona?.mapa?.lugares ?? []
  const mapa = lugares.length
    ? ['# ZONA — MAPA (distancias calculadas: las ÚNICAS que podés usar)', lineasATexto(lugares)]
    : ['# ZONA — MAPA', 'Sin datos del mapa: NO des ninguna distancia.']
  const web = zona?.web?.trim()
    ? ['# ZONA — WEB (contexto del barrio; sin distancias)', dato(zona.web)]
    : ['# ZONA — WEB', 'Sin datos de la web: no nombres líneas de colectivo ni comercios concretos; usá solo lo que sea ampliamente conocido del barrio y, ante la duda, omití.']
  return [...mapa, '', ...web]
}

export function armarEntradaEscritura(e: EntradaEscritura): string {
  const tipologia = tipologiaDiego(e.propiedad.property_type)
  const bloques: string[][] = [
    [`# TIPOLOGÍA: ${tipologia} (cargada como "${limpiar(e.propiedad.property_type)}")`],
    bloqueDatosCargados(e.propiedad),
    e.visita ? bloqueVisita(e.visita) : [],
    bloquePortales(e.portalData),
    bloqueRespuestas(e.respuestas),
    ['# COMPRADOR IDEAL', e.comprador?.trim() ? dato(e.comprador) : 'No definido: escribí para el comprador más probable según los datos y las fotos.'],
    e.notas?.trim() ? ['# LO QUE NO SE VE EN LAS FOTOS (notas del asesor)', dato(e.notas)] : [],
    e.inventario ? bloqueInventario(e.inventario) : ['# LO QUE SE VE EN LAS FOTOS', 'Sin análisis de fotos.'],
    bloqueZona(e.zona),
    ['# TAREA', `Escribí el titular, el subtitular y el cuerpo de esta propiedad con la estructura de ${tipologia} del método de Diego. Devolvé solo el JSON.`],
  ]
  return bloques.filter(b => b.length).map(b => b.join('\n')).join('\n\n')
}
