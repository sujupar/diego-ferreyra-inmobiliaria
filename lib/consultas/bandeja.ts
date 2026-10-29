/**
 * Reglas de la bandeja de Consultas: qué estado tiene cada consulta, qué ofrece
 * su botón de agendar, cuántas veces consultó la misma persona, qué entra en la
 * página y cómo se agrupa por día.
 *
 * La ruta trae las filas y las visitas de la base; todo lo que se decide sobre
 * ellas vive acá, sin red ni base, para poder probarlo entero.
 * Módulo puro y seguro para el navegador.
 */
import { leerTelefono, type TelefonoLeido } from './telefono'
import type {
  AccionAgendar, ConsultaEnBandeja, ConsultaFila, ConteoOpcion, EstadoConsulta, RespuestaBandeja, TarjetasBandeja,
  VisitaDeConsulta,
} from './tipos'
import type { FiltrosConsultas } from './filtros'
import { fechaEnArgentina, sumarDias, ZONA_ARGENTINA } from '@/lib/visitas/horario'

export const POR_PAGINA = 25

/** Milisegundos de un instante; uno ilegible va al fondo en vez de romper el orden. */
function instante(v: string): number {
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

/**
 * Memoria de `whatsappDe` por texto crudo. `estadoDeConsulta` compara cada
 * consulta contra TODAS las visitas, y leer un teléfono pasa por libphonenumber
 * (lento): sin esto, un mes de consultas × visitas son decenas de miles de
 * lecturas por pedido y la ruta se acerca al techo de tiempo de Netlify. Es solo
 * un caché de una función determinística: no cambia ningún resultado. Tiene tope
 * para que un proceso largo no acumule teléfonos sin fin.
 */
const MAX_TELEFONOS_EN_MEMORIA = 5000
const telefonosLeidos = new Map<string, string | null>()

/** El teléfono de WhatsApp (`549…`) o `null` si no sirve para comparar personas. */
function whatsappDe(crudo: string | null): string | null {
  const clave = crudo ?? ''
  const guardado = telefonosLeidos.get(clave)
  if (guardado !== undefined) return guardado
  const t = leerTelefono(crudo)
  const valor = t.ok ? t.whatsapp : null
  if (telefonosLeidos.size >= MAX_TELEFONOS_EN_MEMORIA) telefonosLeidos.clear()
  telefonosLeidos.set(clave, valor)
  return valor
}

/**
 * Si la consulta ya tiene visita. Coincide por el vínculo explícito
 * (`portal_inquiry_id`) o, para las visitas cargadas sin ese vínculo, por
 * MISMA propiedad + MISMO teléfono leído con la regla del 549: así
 * `011 15 6140-0496` y `+5491161400496` son la misma persona. Un teléfono
 * inválido nunca empareja (dos "4941-0027" no prueban que sea la misma
 * persona). Las canceladas no cuentan: la consulta vuelve a quedar sin visita.
 */
export function estadoDeConsulta(c: ConsultaFila, visitas: readonly VisitaDeConsulta[]): EstadoConsulta {
  const telConsulta = c.property_id ? whatsappDe(c.telefono) : null
  let elegida: VisitaDeConsulta | null = null
  for (const v of visitas) {
    if (v.status === 'cancelled') continue
    const porVinculo = v.portal_inquiry_id === c.id
    const porPersona = telConsulta !== null && v.property_id === c.property_id
      && whatsappDe(v.client_phone) === telConsulta
    if (!porVinculo && !porPersona) continue
    if (elegida === null || instante(v.scheduled_at) > instante(elegida.scheduled_at)) elegida = v
  }
  if (elegida === null) return { tipo: 'sin_visita' }
  return {
    tipo: elegida.status === 'completed' ? 'visito' : 'con_visita',
    visitaId: elegida.id,
    scheduled_at: elegida.scheduled_at,
  }
}

/**
 * Qué ofrece el botón de agendar. Sin propiedad va PRIMERO: una visita es a una
 * propiedad, y corregir el teléfono antes de saber a cuál no sirve de nada.
 */
export function accionDeAgendar(c: ConsultaFila, tel: TelefonoLeido): AccionAgendar {
  if (!c.property_id) return 'elegir_propiedad'
  if (tel.ok) return 'agendar'
  return tel.motivo === 'vacio' ? 'pedir_telefono' : 'revisar_telefono'
}

/**
 * Cuántas consultas tiene cada persona en TODO lo traído (id → cantidad).
 * La persona se reconoce por su WhatsApp; sin uno válido, por el email; sin
 * ninguno de los dos no hay con qué juntarla y cuenta 1.
 */
export function contarRepetidas(filas: readonly ConsultaFila[]): Map<string, number> {
  const claveDe = new Map<string, string | null>()
  const porPersona = new Map<string, number>()
  for (const f of filas) {
    const wa = whatsappDe(f.telefono)
    const email = f.email?.trim().toLowerCase() ?? ''
    const clave = wa ? `tel:${wa}` : email ? `email:${email}` : null
    claveDe.set(f.id, clave)
    if (clave) porPersona.set(clave, (porPersona.get(clave) ?? 0) + 1)
  }
  const resultado = new Map<string, number>()
  for (const f of filas) {
    const clave = claveDe.get(f.id) ?? null
    resultado.set(f.id, clave ? porPersona.get(clave) ?? 1 : 1)
  }
  return resultado
}

/**
 * Teléfono para revisar. MercadoLibre sin teléfono NO entra: ML oculta el
 * contacto de quien pregunta, no hay nada que el equipo pueda corregir ahí, y
 * contarlo llenaría la tarjeta de falsas alarmas.
 */
function telefonoParaRevisar(f: ConsultaEnBandeja): boolean {
  if (f.tel.ok) return false
  return !(f.portal === 'mercadolibre' && f.tel.motivo === 'vacio')
}

function pasaEstado(f: ConsultaEnBandeja, estado: FiltrosConsultas['estado']): boolean {
  return estado === null || f.estado.tipo === estado
}

/**
 * Las tarjetas se cuentan ANTES de filtrar por estado o teléfono: son la foto
 * del período, y si cambiaran al tocar un filtro la tarjeta que se tocó
 * mentiría sobre cuántas quedan.
 */
export function armarBandeja(
  filas: readonly ConsultaEnBandeja[],
  f: Pick<FiltrosConsultas, 'estado' | 'telefonoRevisar' | 'pagina'>,
): Pick<RespuestaBandeja, 'filas' | 'total' | 'tarjetas'> {
  const tarjetas: TarjetasBandeja = { sinVisita: 0, sinPropiedad: 0, telefonoRevisar: 0 }
  for (const fila of filas) {
    if (fila.estado.tipo === 'sin_visita') tarjetas.sinVisita++
    if (fila.property_id === null) tarjetas.sinPropiedad++
    if (telefonoParaRevisar(fila)) tarjetas.telefonoRevisar++
  }
  const filtradas = filas
    .filter((fila) => pasaEstado(fila, f.estado) && (!f.telefonoRevisar || telefonoParaRevisar(fila)))
    .sort((a, b) => {
      const porFecha = instante(b.recibida_at) - instante(a.recibida_at)
      if (porFecha !== 0 && !Number.isNaN(porFecha)) return porFecha
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })
  const inicio = (Math.max(1, Math.trunc(f.pagina)) - 1) * POR_PAGINA
  return { filas: filtradas.slice(inicio, inicio + POR_PAGINA), total: filtradas.length, tarjetas }
}

type DatosPropiedad = { address: string; neighborhood: string | null }

/**
 * Cada fila de la vista con todo lo que la pantalla necesita para mostrarla.
 * Las repetidas se cuentan sobre TODAS las filas recibidas (el período entero
 * con sus filtros), no sobre la página: "consultó 3 veces" tiene que ser
 * verdad aunque las otras dos estén en la página siguiente.
 * El asesor es el de la PROPIEDAD; el de la consulta solo cuando no hay
 * propiedad (o la propiedad no tiene asesor).
 */
export function consultasEnBandeja(
  filas: readonly ConsultaFila[],
  visitas: readonly VisitaDeConsulta[],
  propiedades: ReadonlyMap<string, DatosPropiedad>,
  asesores: ReadonlyMap<string, string>,
): ConsultaEnBandeja[] {
  const repetidas = contarRepetidas(filas)
  return filas.map((fila) => {
    const tel = leerTelefono(fila.telefono)
    const asesorId = fila.asesor_propiedad ?? fila.assigned_to
    return {
      ...fila,
      estado: estadoDeConsulta(fila, visitas),
      tel,
      repetidas: repetidas.get(fila.id) ?? 1,
      accion: accionDeAgendar(fila, tel),
      propiedad: fila.property_id ? propiedades.get(fila.property_id) ?? null : null,
      asesor_nombre: asesorId ? asesores.get(asesorId) ?? null : null,
    }
  })
}

/** Cómo se escribe cada portal en pantalla. Uno fuera del catálogo sale con su nombre crudo. */
export const ETIQUETA_PORTAL: Readonly<Record<string, string>> = {
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
  mercadolibre: 'MercadoLibre',
  landing: 'Landing',
}

export const SIN_PROPIEDAD = { valor: 'sin', etiqueta: 'Sin propiedad identificada' } as const

/** De mayor a menor; a igual cantidad, alfabético, para que el orden no baile entre pedidos. */
function porCantidad(a: ConteoOpcion, b: ConteoOpcion): number {
  return b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, 'es')
}

function contar(filas: readonly ConsultaFila[], clave: (f: ConsultaFila) => string | null): Map<string, number> {
  const n = new Map<string, number>()
  for (const f of filas) {
    const k = clave(f)
    if (k !== null) n.set(k, (n.get(k) ?? 0) + 1)
  }
  return n
}

/**
 * Los números del selector de portal. El portal elegido aparece aunque tenga 0:
 * si desapareciera del selector, no habría forma de ver qué está filtrado.
 */
export function contarPorPortal(filas: readonly ConsultaFila[], elegido: string | null): ConteoOpcion[] {
  const n = contar(filas, (f) => f.portal)
  if (elegido && !n.has(elegido)) n.set(elegido, 0)
  return [...n].map(([valor, cantidad]) => ({ valor, etiqueta: ETIQUETA_PORTAL[valor] ?? valor, n: cantidad }))
    .sort(porCantidad)
}

/**
 * Los números del selector de propiedad. "Sin propiedad identificada" va
 * PRIMERO: es lo que el equipo tiene que resolver, no una propiedad más.
 */
export function contarPorPropiedad(
  filas: readonly ConsultaFila[],
  propiedades: ReadonlyMap<string, DatosPropiedad>,
  elegido: string | null,
): ConteoOpcion[] {
  const n = contar(filas, (f) => f.property_id)
  if (elegido && elegido !== SIN_PROPIEDAD.valor && !n.has(elegido)) n.set(elegido, 0)
  const resto = [...n].map(([valor, cantidad]) => ({
    valor, etiqueta: propiedades.get(valor)?.address || 'Propiedad sin dirección', n: cantidad,
  })).sort(porCantidad)
  const sin = filas.filter((f) => f.property_id === null).length
  return sin > 0 || elegido === SIN_PROPIEDAD.valor ? [{ ...SIN_PROPIEDAD, n: sin }, ...resto] : resto
}

const formatoDia = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_ARGENTINA, weekday: 'short', day: 'numeric', month: 'short',
})

/** `mié 28 oct`: sin comas ni los puntos de abreviatura que agrega Intl ("mié.", "oct."). */
function etiquetaDeDia(dia: string, hoy: string): string {
  if (dia === hoy) return 'Hoy'
  if (dia === sumarDias(hoy, -1)) return 'Ayer'
  // Mediodía de Argentina: ese instante es el mismo día en cualquier zona del servidor.
  const partes = formatoDia.formatToParts(new Date(`${dia}T12:00:00-03:00`))
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    (partes.find((p) => p.type === tipo)?.value ?? '').replace(/\./g, '').trim()
  return `${valor('weekday')} ${valor('day')} ${valor('month')}`
}

/**
 * Agrupa por DÍA DE ARGENTINA conservando el orden recibido (la bandeja ya
 * viene ordenada). Una consulta de las 23:30 es de ese día aunque en UTC ya sea
 * el siguiente. `hoy` (AAAA-MM-DD de Argentina) entra como parámetro para que la
 * función siga siendo pura y se pueda probar.
 */
export function agruparPorDia(
  filas: readonly ConsultaEnBandeja[],
  hoy: string,
): Array<{ dia: string; etiqueta: string; filas: ConsultaEnBandeja[] }> {
  const grupos: Array<{ dia: string; etiqueta: string; filas: ConsultaEnBandeja[] }> = []
  const porDia = new Map<string, ConsultaEnBandeja[]>()
  for (const fila of filas) {
    const ms = instante(fila.recibida_at)
    const dia = Number.isFinite(ms) ? fechaEnArgentina(new Date(ms)) : 'sin-fecha'
    let lista = porDia.get(dia)
    if (!lista) {
      lista = []
      porDia.set(dia, lista)
      grupos.push({ dia, etiqueta: dia === 'sin-fecha' ? 'Sin fecha' : etiquetaDeDia(dia, hoy), filas: lista })
    }
    lista.push(fila)
  }
  return grupos
}
