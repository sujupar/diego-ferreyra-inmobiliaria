/**
 * Pestaña Estadísticas de Consultas (spec Entrega 2 §3.3). Se calcula EN LA
 * PANTALLA con el período que ya viajó, sin pedidos extra.
 *
 * Regla del tablero (CLAUDE.md § Tablero): toda cifra viaja con su base; base 0
 * ⇒ "Sin datos" (`valor: null`), nunca 0; porcentajes con base < 20 ⇒
 * "orientativo". Se reusa `Cifra` de Visitas para que las dos pantallas digan
 * lo mismo de la misma forma.
 *
 * La conversión se cuenta por PERSONA, no por consulta: alguien que consultó
 * tres veces y vino una vez es una persona que convirtió, no un 33 %. La
 * persona se reconoce por su WhatsApp (regla del 549); sin uno válido, por el
 * email; sin ninguno, cada consulta es una persona.
 * Módulo puro y seguro para el navegador.
 */
import { conteo, cifra, porcentaje, type Cifra } from '@/lib/visitas/metricas'
import { fechaEnArgentina, sumarDias } from '@/lib/visitas/horario'
import { etiquetaCanal, etiquetaPortal } from './pantalla'
import { SIN_PROPIEDAD } from './bandeja'
import type { ConsultaEnBandeja } from './tipos'

export interface PasoRecorrido {
  clave: 'personas' | 'contactables' | 'con_visita' | 'visito'
  etiqueta: string
  cantidad: number
  /** Qué parte del paso anterior llegó a este (null en el primero o si el anterior es 0). */
  delAnterior: number | null
  /** El paso donde se pierde la mayor proporción de gente (solo uno). */
  masAngosto: boolean
}

export interface FilaGrupo {
  clave: string
  etiqueta: string
  consultas: number
  /** Parte del total de consultas del período. */
  porcentaje: Cifra
  /** Visitas distintas agendadas desde estas consultas. */
  visitas: number
  /** Personas con visita / personas contactables. */
  conversion: Cifra
  /** La consulta más reciente del grupo (ISO). */
  ultima: string
}

export interface FilaPropiedad extends FilaGrupo {
  portales: Array<{ portal: string; etiqueta: string; n: number }>
}

export interface EstadisticasConsultas {
  tarjetas: {
    consultas: Cifra
    porDia: Cifra
    personas: Cifra
    conPropiedad: Cifra
    visitas: Cifra
    conversion: Cifra
  }
  recorrido: PasoRecorrido[]
  porPortal: FilaGrupo[]
  porPropiedad: FilaPropiedad[]
  porMes: FilaGrupo[]
  porCanal: FilaGrupo[]
  /** `null` para quien solo ve lo suyo: un asesor no compara asesores. */
  porAsesor: FilaGrupo[] | null
}

function personaDe(c: ConsultaEnBandeja): string {
  if (c.tel.ok) return `tel:${c.tel.whatsapp}`
  const email = c.email?.trim().toLowerCase()
  return email ? `email:${email}` : `id:${c.id}`
}

const tieneVisita = (c: ConsultaEnBandeja) => c.estado.tipo !== 'sin_visita'

/**
 * Las personas de un grupo y en qué punto del recorrido llegó cada una.
 * "Contactable" = WhatsApp válido O ya tiene visita (si se le agendó, el equipo
 * pudo contactarla aunque el teléfono del portal viniera mal): así el recorrido
 * nunca sube.
 */
function contarPersonas(consultas: readonly ConsultaEnBandeja[]) {
  const personas = new Map<string, { contactable: boolean; conVisita: boolean; visito: boolean }>()
  const visitas = new Set<string>()
  for (const c of consultas) {
    const clave = personaDe(c)
    const p = personas.get(clave) ?? { contactable: false, conVisita: false, visito: false }
    if (c.tel.ok || tieneVisita(c)) p.contactable = true
    if (tieneVisita(c)) p.conVisita = true
    if (c.estado.tipo === 'visito') p.visito = true
    personas.set(clave, p)
    if (c.estado.tipo !== 'sin_visita') visitas.add(c.estado.visitaId)
  }
  let contactables = 0
  let conVisita = 0
  let visito = 0
  for (const p of personas.values()) {
    if (p.contactable) contactables++
    if (p.conVisita) conVisita++
    if (p.visito) visito++
  }
  return { personas: personas.size, contactables, conVisita, visito, visitas: visitas.size }
}

function ms(v: string): number {
  const n = Date.parse(v)
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n
}

function agrupar(
  consultas: readonly ConsultaEnBandeja[],
  clave: (c: ConsultaEnBandeja) => { clave: string; etiqueta: string },
  total: number,
): Array<FilaGrupo & { filas: ConsultaEnBandeja[] }> {
  const grupos = new Map<string, { etiqueta: string; filas: ConsultaEnBandeja[] }>()
  for (const c of consultas) {
    const k = clave(c)
    const g = grupos.get(k.clave) ?? { etiqueta: k.etiqueta, filas: [] }
    g.filas.push(c)
    grupos.set(k.clave, g)
  }
  return [...grupos].map(([k, g]) => {
    const p = contarPersonas(g.filas)
    const ultima = g.filas.reduce((a, c) => (ms(c.recibida_at) > ms(a) ? c.recibida_at : a), g.filas[0].recibida_at)
    return {
      clave: k, etiqueta: g.etiqueta, consultas: g.filas.length, porcentaje: porcentaje(g.filas.length, total),
      visitas: p.visitas, conversion: porcentaje(p.conVisita, p.contactables), ultima, filas: g.filas,
    }
  })
}

const porCantidad = (a: FilaGrupo, b: FilaGrupo) => b.consultas - a.consultas || a.etiqueta.localeCompare(b.etiqueta, 'es')
function sinFilas<T extends FilaGrupo & { filas: unknown }>(g: T): FilaGrupo {
  return { clave: g.clave, etiqueta: g.etiqueta, consultas: g.consultas, porcentaje: g.porcentaje, visitas: g.visitas, conversion: g.conversion, ultima: g.ultima }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Días del período, contando los dos extremos (mínimo 1). */
function diasDelPeriodo(desde: string, hasta: string): number {
  let n = 1
  for (let d = desde; d < hasta && n < 4000; d = sumarDias(d, 1)) n++
  return n
}

export function calcularEstadisticas(
  consultas: readonly ConsultaEnBandeja[],
  periodo: { desde: string; hasta: string },
  verTodo: boolean,
): EstadisticasConsultas {
  const total = consultas.length
  const todo = contarPersonas(consultas)
  const conPropiedad = consultas.filter((c) => c.property_id !== null).length
  const dias = diasDelPeriodo(periodo.desde, periodo.hasta)

  const pasos: Array<Omit<PasoRecorrido, 'delAnterior' | 'masAngosto'>> = [
    { clave: 'personas', etiqueta: 'Personas que consultaron', cantidad: todo.personas },
    { clave: 'contactables', etiqueta: 'Con WhatsApp para contactar', cantidad: todo.contactables },
    { clave: 'con_visita', etiqueta: 'Con visita agendada', cantidad: todo.conVisita },
    { clave: 'visito', etiqueta: 'Visitaron', cantidad: todo.visito },
  ]
  let angosto = -1
  let peor = Number.POSITIVE_INFINITY
  const recorrido = pasos.map((p, i) => {
    const anterior = i > 0 ? pasos[i - 1].cantidad : 0
    const delAnterior = i > 0 && anterior > 0 ? p.cantidad / anterior : null
    // Estrictamente menor: ante un empate queda marcado el PRIMERO, que es donde
    // empieza la pérdida.
    if (delAnterior !== null && delAnterior < peor) { peor = delAnterior; angosto = i }
    return { ...p, delAnterior, masAngosto: false }
  })
  if (angosto >= 0 && peor < 1) recorrido[angosto].masAngosto = true

  const porPropiedad = agrupar(consultas, (c) => c.property_id
    ? { clave: c.property_id, etiqueta: c.propiedad?.address || 'Propiedad sin dirección' }
    : { clave: SIN_PROPIEDAD.valor, etiqueta: SIN_PROPIEDAD.etiqueta }, total)
    .map((g) => {
      const n = new Map<string, number>()
      for (const c of g.filas) n.set(c.portal, (n.get(c.portal) ?? 0) + 1)
      const portales = [...n].map(([portal, cantidad]) => ({ portal, etiqueta: etiquetaPortal(portal), n: cantidad }))
        .sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, 'es'))
      return { ...sinFilas(g), portales }
    })
    .sort((a, b) => (a.clave === SIN_PROPIEDAD.valor ? -1 : b.clave === SIN_PROPIEDAD.valor ? 1 : porCantidad(a, b)))

  const porMes = agrupar(consultas, (c) => {
    const t = ms(c.recibida_at)
    const dia = Number.isFinite(t) ? fechaEnArgentina(new Date(t)) : 'sin-fecha'
    const mes = dia.slice(0, 7)
    const etiqueta = dia === 'sin-fecha' ? 'Sin fecha' : `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
    return { clave: dia === 'sin-fecha' ? 'sin-fecha' : mes, etiqueta }
  }, total).map(sinFilas).sort((a, b) => a.clave.localeCompare(b.clave))

  return {
    tarjetas: {
      consultas: conteo(total),
      porDia: total > 0 ? cifra(Math.round((total / dias) * 10) / 10, total) : cifra(0, 0),
      personas: conteo(todo.personas),
      conPropiedad: porcentaje(conPropiedad, total),
      // Un conteo no es una estimación: nunca es "orientativo". Con consultas y
      // ninguna visita dice 0 (es un dato); sin consultas, "Sin datos".
      visitas: total > 0 ? { valor: todo.visitas, base: total, orientativo: false } : cifra(0, 0),
      conversion: porcentaje(todo.conVisita, todo.contactables),
    },
    recorrido,
    porPortal: agrupar(consultas, (c) => ({ clave: c.portal, etiqueta: etiquetaPortal(c.portal) }), total).map(sinFilas).sort(porCantidad),
    porPropiedad,
    porMes,
    porCanal: agrupar(consultas, (c) => {
      const etiqueta = etiquetaCanal(c)
      return { clave: etiqueta, etiqueta }
    }, total).map(sinFilas).sort(porCantidad),
    porAsesor: verTodo
      ? agrupar(consultas, (c) => ({ clave: c.asesor_nombre ?? 'sin', etiqueta: c.asesor_nombre ?? 'Sin asesor' }), total).map(sinFilas).sort(porCantidad)
      : null,
  }
}
