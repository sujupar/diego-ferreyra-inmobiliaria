/**
 * Cómo se MUESTRA una consulta en la bandeja (`/consultas`) y qué se le pasa a
 * la ventana de agendar. Las decisiones de qué estado tiene cada consulta viven
 * en `bandeja.ts` (servidor); acá solo se traducen a texto y a los datos que
 * piden los componentes, para que la pantalla no calcule nada y se pueda probar
 * sin montarla.
 * Módulo puro y seguro para el navegador.
 */
import type { ConsultaEnBandeja } from './tipos'
import type { TelefonoLeido } from './telefono'
import type { InicioRapido } from '@/lib/visitas/agendar-estado'
import { ETIQUETA_PORTAL } from './bandeja'
import { FILTROS_DEFECTO_CONSULTAS } from './filtros'
import { formatearFechaHora, horaEnArgentina } from '@/lib/visitas/horario'
import { origenDesdeLead } from '@/lib/visitas/origen'

export function etiquetaPortal(portal: string): string {
  return Object.hasOwn(ETIQUETA_PORTAL, portal) ? ETIQUETA_PORTAL[portal] : portal
}

export function nombreVisible(c: ConsultaEnBandeja): string {
  const nombre = c.nombre?.trim()
  if (nombre) return nombre
  return c.portal === 'mercadolibre' ? 'Pregunta en MercadoLibre' : 'Sin nombre'
}

/**
 * El teléfono de la fila. MercadoLibre sin teléfono NO se marca para revisar:
 * ML oculta el contacto de quien pregunta y no hay nada que corregir (misma
 * regla que la tarjeta "Teléfono a revisar" en `bandeja.ts`).
 */
export function textoTelefono(c: ConsultaEnBandeja): { texto: string; revisar: boolean } {
  if (c.tel.ok) return { texto: c.tel.mostrado, revisar: false }
  if (c.tel.motivo === 'vacio') {
    return c.portal === 'mercadolibre'
      ? { texto: 'MercadoLibre no comparte el contacto', revisar: false }
      : { texto: 'Teléfono a revisar', revisar: true }
  }
  const crudo = c.tel.crudo.trim()
  return { texto: crudo ? `${crudo} · Teléfono a revisar` : 'Teléfono a revisar', revisar: true }
}

/** En MercadoLibre la consulta es una pregunta en el aviso, llegue por donde llegue. */
export function etiquetaCanal(c: ConsultaEnBandeja): string {
  if (c.portal === 'mercadolibre') return 'Pregunta'
  if (c.canal === 'whatsapp') return 'WhatsApp'
  if (c.canal === 'mail') return 'Mail'
  return 'Landing'
}

export function horaDeLaConsulta(c: ConsultaEnBandeja): string {
  const d = new Date(c.recibida_at)
  return Number.isNaN(d.getTime()) ? '' : horaEnArgentina(d)
}

/** `Visita vie 30 · 17:00` / `Visitó jue 5 · 10:00`; `null` si no tiene visita. */
export function textoVisita(c: ConsultaEnBandeja): string | null {
  if (c.estado.tipo === 'sin_visita') return null
  // formatearFechaHora da "vie 30/10 · 17:00": en la fila alcanza con el día
  // (el mes se sobreentiende en una bandeja de días recientes) y sin cero adelante.
  const cuando = formatearFechaHora(c.estado.scheduled_at).replace(/(\d{2})\/\d{2}/, (_, dia: string) => String(Number(dia)))
  return `${c.estado.tipo === 'visito' ? 'Visitó' : 'Visita'} ${cuando}`
}

export function textoPropiedad(c: ConsultaEnBandeja): { texto: string; sinPropiedad: boolean } {
  if (c.propiedad) {
    const barrio = c.propiedad.neighborhood?.trim()
    return { texto: barrio ? `${c.propiedad.address}, ${barrio}` : c.propiedad.address, sinPropiedad: false }
  }
  if (c.property_id) return { texto: 'Propiedad sin dirección', sinPropiedad: false }
  const codigo = c.aviso_codigo?.trim()
  return { texto: codigo ? `⚠ Sin propiedad identificada · aviso CÓD ${codigo}` : '⚠ Sin propiedad identificada', sinPropiedad: true }
}

/**
 * "Ver más" agrega la página siguiente. La bandeja pagina por posición sobre una
 * lista que puede cambiar entre pedidos (entra una consulta nueva y todo se
 * corre un lugar), así que la misma consulta puede venir en dos páginas: se
 * agrega una sola vez.
 */
export function unirSinRepetir(actuales: readonly ConsultaEnBandeja[], nuevas: readonly ConsultaEnBandeja[]): ConsultaEnBandeja[] {
  const vistos = new Set(actuales.map((f) => f.id))
  const resultado = [...actuales]
  for (const f of nuevas) {
    if (vistos.has(f.id)) continue
    vistos.add(f.id)
    resultado.push(f)
  }
  return resultado
}

/**
 * Lo que necesita la ventana de agendar para abrir directo en "Día y hora".
 * El teléfono lo valida la regla del 549 (`tel`), no la ventana: si no sirve,
 * el botón rápido queda bloqueado y el teléfono se corrige antes, en la hoja
 * "Revisá el teléfono": lo corregido llega en `opciones.telefono` y reemplaza
 * al de la consulta (el servidor lo guarda en la visita y en la consulta).
 */
export function inicioRapidoDe(
  c: ConsultaEnBandeja,
  opciones: { telefono?: Extract<TelefonoLeido, { ok: true }> } = {},
): InicioRapido {
  const esLanding = c.tipo === 'landing'
  const hora = horaDeLaConsulta(c)
  const portal = etiquetaPortal(c.portal)
  const tel = opciones.telefono ?? c.tel
  const base = {
    persona: {
      tipo: esLanding ? ('registro' as const) : ('consulta' as const),
      id: c.id,
      nombre: c.nombre?.trim() || 'Sin nombre',
      telefono: c.telefono,
      detalle: hora ? `${portal} · ${hora}` : portal,
    },
    telefonoMostrado: tel.ok ? tel.mostrado : (c.telefono ?? null),
    telefonoValido: tel.ok,
    ...(tel.ok ? { telefono: tel.canonico } : {}),
  }
  // Portal: el detalle (qué portal) lo deriva el servidor de la consulta.
  if (!esLanding) return { ...base, origen: 'portal' }
  // Landing: el origen sale del UTM con la misma regla que las visitas que se
  // crean solas. El detalle VIAJA: "otro" lo exige y sin él la visita no se agenda.
  const derivado = origenDesdeLead({ source: 'landing', utm: c.utm })
  return { ...base, origen: derivado.origen, ...(derivado.detalle ? { origenDetalle: derivado.detalle } : {}) }
}

/** Las otras consultas ya traídas de la misma persona (mismo WhatsApp). */
export function otrasDeLaPersona(c: ConsultaEnBandeja, filas: readonly ConsultaEnBandeja[]): ConsultaEnBandeja[] {
  if (!c.tel.ok) return []
  const whatsapp = c.tel.whatsapp
  return filas.filter((f) => f.id !== c.id && f.tel.ok && f.tel.whatsapp === whatsapp)
}

type FiltrosEnUrl = typeof FILTROS_DEFECTO_CONSULTAS

/** Para el botón "Filtros · N" del celular. Un rango de fechas es el período: cuenta uno. */
export function contarFiltrosActivos(f: FiltrosEnUrl): number {
  const periodoDistinto = f.periodo !== FILTROS_DEFECTO_CONSULTAS.periodo || f.from !== '' || f.to !== ''
  const resto = (['portal', 'propiedad', 'estado', 'asesor', 'telefono', 'q'] as const).filter((k) => f[k] !== '').length
  return resto + (periodoDistinto ? 1 : 0)
}

/** El dominio de cada portal. Un enlace a un aviso solo se muestra si es de ESE dominio. */
const DOMINIO_DEL_PORTAL: Readonly<Record<string, string>> = {
  zonaprop: 'zonaprop.com.ar',
  argenprop: 'argenprop.com',
  mercadolibre: 'mercadolibre.com.ar',
}

/**
 * Enlaces que vienen de un portal (texto de terceros, sacado de un mail): solo
 * `https://` y del dominio EXACTO de ese portal o un subdominio suyo
 * (MercadoLibre usa `articulo.`, `departamento.`, …). Se compara el host
 * completo, nunca con `includes`: `zonaprop.com.ar.otro.com` no pasa. Un
 * enlace de otro dominio en un mail del portal no se muestra: no hay forma de
 * saber a dónde lleva.
 */
/**
 * Dónde guarda cada portal las fotos de sus avisos. Host EXACTO: la foto viene
 * de un mail de terceros y termina en un <img> de la plataforma.
 */
const FOTOS_DEL_PORTAL: Record<string, { host: string; ruta: string }> = {
  zonaprop: { host: 'imgar.zonapropcdn.com', ruta: '/avisos/' },
  argenprop: { host: 'www.argenprop.com', ruta: '/static-content/' },
}

/** La foto del aviso si es `https`, del portal del aviso y de su carpeta de fotos; si no, null. */
export function fotoSegura(url: string | null | undefined, portal: string): string | null {
  if (!url || !Object.hasOwn(FOTOS_DEL_PORTAL, portal)) return null
  const { host, ruta } = FOTOS_DEL_PORTAL[portal]
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname !== host || !u.pathname.startsWith(ruta)) return null
    return u.toString()
  } catch {
    return null
  }
}

export function enlaceSeguro(url: string | null | undefined, portal: string): string | null {
  if (!url) return null
  const dominio = Object.hasOwn(DOMINIO_DEL_PORTAL, portal) ? DOMINIO_DEL_PORTAL[portal] : null
  if (!dominio) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (u.protocol !== 'https:' || (host !== dominio && !host.endsWith(`.${dominio}`))) return null
    return u.toString()
  } catch {
    return null
  }
}
