// La dirección de la cartera: filtros, parámetros viejos de /crm y el "Volver" de la ficha
// (crm-cartera-por-rol, design.md D5 y D11). Puro.
import type { FiltrosCartera } from './cartera'
import { ETAPAS_CERRADAS_CARTERA, type EtapaCRM } from './etapas'

export const FILTROS_DEFECTO: FiltrosCartera = {
  seg: 'abiertos',
  etapa: '',
  origen: '',
  asesor: '',
  entro: '',
  desde: '',
  hasta: '',
  q: '',
  trabado: '',
  orden: 'nuevos',
  colegas: '',
  ver: '',
}

// Con qué nombre se avisa "No se aplicó {nombre}: ese valor no es válido." (spec).
const NOMBRE_FILTRO: Record<keyof FiltrosCartera, string> = {
  seg: 'Abiertos o cerrados',
  etapa: 'Etapa',
  origen: 'Origen',
  asesor: 'Asesor',
  entro: 'Entró al CRM',
  desde: 'Entró al CRM',
  hasta: 'Entró al CRM',
  q: 'Buscar',
  trabado: 'Lo que está trabado',
  orden: 'Ordenar por',
  colegas: 'Colegas',
  ver: 'Ver como',
}

const SEGMENTOS = ['abiertos', 'cerrados'] as const
const ORIGENES = ['embudo', 'referido', 'historico'] as const
const ENTRO = ['hoy', 'ayer', '7', '15', '30', '90', 'rango'] as const
const TRABADO = ['sin-contacto', 'sin-asesor', 'sin-movimiento'] as const
const ORDENES = ['proximo', 'ultimo', 'nuevos', 'nombre'] as const
const MAX_BUSQUEDA = 100
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

function fechaValida(s: string): boolean {
  const m = RE_FECHA.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

function deLaLista<T extends string>(valor: string, lista: readonly T[]): T | null {
  return lista.find((x) => x === valor) ?? null
}

/**
 * Lee los filtros de la dirección. Todo lo que no se reconoce cae al defecto y se avisa en
 * `rechazados` (una vez por filtro): la lista carga igual, sin romper la pantalla (spec
 * "Valor inventado en la dirección"). Las etapas y los asesores válidos los da la vista
 * (una etapa que existe pero no está en esta vista también es inválida acá); `verComo`, si
 * se conoce, limita a esas personas; si no, basta con que sea un uuid (el servidor decide).
 */
export function leerFiltrosCartera(
  params: URLSearchParams,
  permitidos: { asesores: string[]; etapas: EtapaCRM[]; verComo?: string[] },
): { filtros: FiltrosCartera; rechazados: string[] } {
  const f: FiltrosCartera = { ...FILTROS_DEFECTO }
  const rechazados: string[] = []
  // Cada clave se rechaza a lo sumo una vez (el rango entero cuenta como "entro").
  const rechazar = (clave: keyof FiltrosCartera) => {
    rechazados.push(NOMBRE_FILTRO[clave])
  }
  const leer = (clave: keyof FiltrosCartera) => (params.get(clave) ?? '').trim()

  const seg = leer('seg')
  if (seg) f.seg = deLaLista(seg, SEGMENTOS) ?? (rechazar('seg'), f.seg)
  const etapa = leer('etapa')
  if (etapa) f.etapa = deLaLista(etapa, permitidos.etapas) ?? (rechazar('etapa'), '')
  const origen = leer('origen')
  if (origen) f.origen = deLaLista(origen, ORIGENES) ?? (rechazar('origen'), '')
  const asesor = leer('asesor')
  if (asesor) f.asesor = asesor === 'sin' || permitidos.asesores.includes(asesor) ? asesor : (rechazar('asesor'), '')

  const entro = leer('entro')
  if (entro) {
    const e = deLaLista(entro, ENTRO)
    if (!e) rechazar('entro')
    else if (e !== 'rango') f.entro = e
    else {
      const desde = leer('desde')
      const hasta = leer('hasta')
      const okDesde = !desde || fechaValida(desde)
      const okHasta = !hasta || fechaValida(hasta)
      const alReves = !!desde && !!hasta && desde > hasta
      if (!okDesde || !okHasta || alReves || (!desde && !hasta)) rechazar('entro')
      else Object.assign(f, { entro: 'rango', desde, hasta })
    }
  }

  const q = (params.get('q') ?? '').trim()
  f.q = q.slice(0, MAX_BUSQUEDA)
  const trabado = leer('trabado')
  if (trabado) f.trabado = deLaLista(trabado, TRABADO) ?? (rechazar('trabado'), '')
  const orden = leer('orden')
  if (orden) f.orden = deLaLista(orden, ORDENES) ?? (rechazar('orden'), f.orden)
  const colegas = leer('colegas')
  if (colegas) f.colegas = colegas === '1' ? '1' : (rechazar('colegas'), '')
  const ver = leer('ver')
  if (ver) {
    const ok = permitidos.verComo ? permitidos.verComo.includes(ver) : RE_UUID.test(ver)
    f.ver = ok ? ver : (rechazar('ver'), '')
  }
  return { filtros: f, rechazados }
}

/**
 * Traduce un marcador guardado de la pantalla vieja de /crm: `origin` → `origen`,
 * `from`/`to` → `entro=rango` con `desde`/`hasta`, y una etapa cerrada sin `seg` suma
 * `seg=cerrados` (si no, la lista abriría en Abiertos y no mostraría nada). `etapa` y
 * `asesor` se llaman igual en la dirección nueva y NO cuentan como viejos: si contaran, la
 * página se redirigiría a sí misma para siempre. `null` = no había nada que traducir; por
 * eso traducir dos veces da `null` la segunda.
 */
export function traducirParametrosViejos(params: URLSearchParams): URLSearchParams | null {
  const origin = params.get('origin')
  const from = params.get('from')
  const to = params.get('to')
  const etapa = params.get('etapa') ?? ''
  const cerradaSinSeg = ETAPAS_CERRADAS_CARTERA.some((e) => e === etapa) && !params.get('seg')
  if (origin === null && from === null && to === null && !cerradaSinSeg) return null

  const nueva = new URLSearchParams()
  for (const [k, v] of params) if (k !== 'origin' && k !== 'from' && k !== 'to') nueva.append(k, v)
  if (origin && !nueva.get('origen')) nueva.set('origen', origin)
  if (from) nueva.set('desde', from)
  if (to) nueva.set('hasta', to)
  if ((from || to) && !nueva.get('entro')) nueva.set('entro', 'rango')
  if (cerradaSinSeg) nueva.set('seg', 'cerrados')
  return nueva
}

const MAX_VOLVER = 2000
// Solo estos caminos: la lista del CRM o la de Contactos, nunca una ficha ni otra pantalla.
const CAMINOS_VOLVER: Record<string, { texto: 'Volver al CRM' | 'Volver a Contactos'; seccion: 'crm' | 'contactos' }> = {
  '/crm': { texto: 'Volver al CRM', seccion: 'crm' },
  '/crm/': { texto: 'Volver al CRM', seccion: 'crm' },
  '/contacts': { texto: 'Volver a Contactos', seccion: 'contactos' },
  '/contacts/': { texto: 'Volver a Contactos', seccion: 'contactos' },
}

/**
 * El "‹ Volver" de la ficha. `volver` viene de la dirección, o sea de cualquiera: sin esta
 * validación la ficha sería un redirector abierto (`?volver=//otro.com` lleva a otro sitio
 * con nuestro dominio en el enlace). Se acepta SOLO un camino relativo cuyo tramo antes de
 * `?`/`#` sea exactamente `/crm` o `/contacts`, sin caracteres de control ni `\`, y no muy
 * largo. Se compara el camino entero (nunca `startsWith`: `/crmx` y `/crm@otro.com` pasarían).
 */
export function enlaceVolver(
  volver: string | null,
): { href: string; texto: 'Volver al CRM' | 'Volver a Contactos'; seccion: 'crm' | 'contactos' } | null {
  if (!volver || volver.length > MAX_VOLVER) return null
  // Caracteres de control (un salto de línea partiría el enlace) y la barra invertida, que
  // algunos navegadores leen como "/" y convierte `/\otro.com` en `//otro.com`.
  if (/[\u0000-\u001f\u007f\\]/.test(volver)) return null
  const camino = volver.split(/[?#]/, 1)[0]
  const destino = CAMINOS_VOLVER[camino]
  return destino ? { href: volver, ...destino } : null
}
