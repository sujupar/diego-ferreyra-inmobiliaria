/**
 * Arma el Tablero de /metrics con la estructura del documento "Métricas del mes"
 * (spec docs/superpowers/specs/2026-11-21-tablero-estructura-del-mes-design.md).
 * SOLO servidor. Reusa la carga del panel (`cargarDatos`): personas, Meta,
 * visitas, ventas y gastos se bajan UNA vez; acá se suman solo las consultas
 * chicas que el panel no tenía (registros de propiedades, consultas de portales,
 * propiedades, campañas de propiedades, configuración del A/B).
 *
 * Lo que sale de Meta EN VIVO (cada anuncio, vistas de los reels) va por rutas
 * aparte, con caché, para que un Meta lento no tire el Tablero entero.
 */
import 'server-only'
import { getExperiment } from '@/lib/funnel/experiment'
import { calcularPeriodo, cargarDatos, todas, type Datos } from '../panel/servidor'
import { dia } from '../panel/personas'
import { porVariante, resumirCanal, REALIZADAS_SIN_DATO_HASTA, VISITAS_META_SIN_DATO } from '../panel/embudo'
import { hoyArgentina, rangoComparado, sumarDias, type Comparar, type Rango } from '../panel/rango'
import { calcularAjustes, claveCampania, consolidarCampanias, porCampania, totalAnuncios, type EnlaceCampania, type FilaCampania } from './anuncios'
import { consultasPorPortal, registrosMetaPorPropiedad, registrosPorPropiedad, type ConsultaRow, type LeadRow } from './comercial'
import { varianteVigente, variantesPublicadas } from './pagina'
import { cartera, resumenPropiedades, type PropiedadRow } from './propiedades'
import { elegirMejorMes, mesesCerradosDelAnio, nombreMes, rangoDelMes, tramoEnMes, type CandidatoMes } from './comparacion'
import { embudoGeneral } from './embudo-general'
import { nombresDeAnuncios } from './meta-vivo'
import { embudoDeCampania } from '../panel/embudo'

/** Contra qué se compara: los modos del panel, un mes elegido o "el mejor mes". */
export type ModoComparacion = Comparar | 'mes' | 'mejor_mes'
export const MODOS_COMPARACION: ModoComparacion[] = ['mes_anterior', 'mes', 'mejor_mes', 'anterior', 'anio_pasado', 'ninguno']

export interface ParametrosTablero { rango: Rango; comparar: ModoComparacion; /** 'YYYY-MM', con comparar = 'mes'. */ mes?: string | null }

/** Inicio del día `fecha` en Argentina (UTC−3), en ISO UTC. */
const inicioDiaAr = (fecha: string) => `${fecha}T03:00:00.000Z`

/** Primer día (Argentina) con alguna fila en la tabla: antes de eso no hay dato, no hay "0". */
async function primerDia(d: Datos, tabla: 'property_leads' | 'portal_inquiries'): Promise<string | null> {
  const { data, error } = await d.sb.from(tabla).select('created_at').order('created_at').limit(1)
  if (error) throw new Error(error.message)
  const f = data?.[0]?.created_at as string | undefined
  return f ? dia(f) : null
}

async function cargarExtras(d: Datos, desde: string) {
  const { sb } = d
  // Un día de margen para atrás: la fecha que manda es la de Argentina.
  const desdeIso = inicioDiaAr(sumarDias(desde, -1))
  // PostgREST corta en 1000 filas SIN avisar: las listas que crecen se paginan con orden fijo.
  const [leads, consultas, props, campanias, pisoLeads, pisoConsultas] = await Promise.all([
    todas<LeadRow>((a, b) => sb.from('property_leads').select('property_id, source, utm, created_at, suspected_bot, deleted_at, email, phone').gte('created_at', desdeIso).order('created_at').order('id').range(a, b)),
    todas<ConsultaRow>((a, b) => sb.from('portal_inquiries').select('portal, received_at, created_at').or(`received_at.gte.${desdeIso},created_at.gte.${desdeIso}`).order('created_at').order('id').range(a, b)),
    todas<PropiedadRow>((a, b) => sb.from('properties').select('id, address, captured_at, commercial_status, status').order('id').range(a, b)),
    todas<{ property_id: string; campaign_id: string }>((a, b) => sb.from('property_meta_campaigns').select('property_id, campaign_id').order('campaign_id').order('property_id').range(a, b)),
    primerDia(d, 'property_leads'),
    primerDia(d, 'portal_inquiries'),
  ])
  return { leads, consultas, props, campanias, pisoLeads, pisoConsultas }
}

/** ¿Hay datos de esa tabla para todo el rango? (si el rango arranca antes de la primera fila, no). */
const cubre = (r: Rango, piso: string | null) => !!piso && r.desde >= piso

const ETIQUETA_MODO: Record<Comparar, string> = {
  mes_anterior: 'mismo tramo del mes anterior',
  anterior: 'período anterior',
  anio_pasado: 'mismo período del año pasado',
  ninguno: '',
}

/** Rango comparado de los modos que NO necesitan datos para resolverse. */
function comparadoFijo(p: ParametrosTablero): Rango | null {
  if (p.comparar === 'mejor_mes') return null
  if (p.comparar === 'mes') return p.mes ? tramoEnMes(p.rango, p.mes) : null
  return rangoComparado(p.rango, p.comparar)
}

/** Candidatos a "mejor mes": los meses cerrados del año, con la inversión y las solicitudes de tasación. */
function candidatosMejorMes(d: Datos, hoy: string): CandidatoMes[] {
  return mesesCerradosDelAnio(hoy).map(mes => {
    const entero = rangoDelMes(mes)
    const c = resumirCanal('tasacion', { personas: d.personas, meta: d.meta, visitas: d.visitas, blue: d.blue, rango: entero, vista: 'eventos' })
    const diasDelMes = Number(entero.hasta.slice(8))
    return { mes, inversionUsd: c.inversionUsd, solicitudes: c.pasos[0].cantidad, diasConGasto: c.diasConGasto, diasDelMes }
  })
}

export async function armarTablero(p: ParametrosTablero, ahora = new Date()) {
  const hoy = hoyArgentina(ahora)
  const anio: Rango = { desde: p.rango.hasta.slice(0, 4) + '-01-01', hasta: p.rango.hasta }
  let comp = comparadoFijo(p)
  // Meta y visitas desde el 1 de enero (margen del año, ajustes y "el mejor mes"),
  // o desde antes si el comparado cae en otro año.
  // "El mejor mes" sale de los meses del año en curso, que pueden caer antes o
  // DESPUÉS del período elegido: en ese modo Meta y visitas se bajan hasta hoy.
  const anioActual = hoy.slice(0, 4) + '-01-01'
  let piso = comp && comp.desde < anio.desde ? comp.desde : anio.desde
  if (p.comparar === 'mejor_mes' && anioActual < piso) piso = anioActual
  const d = await cargarDatos(
    { rango: p.rango, comparar: 'ninguno', agrupar: 'mes', vista: 'eventos' },
    { metaDesde: piso, metaHasta: hoy, comparado: comp, visitasDesde: piso, visitasHasta: p.comparar === 'mejor_mes' ? hoy : undefined },
  )

  let mejorMes: { mes: string; costoPorSolicitudUsd: number } | null = null
  let motivoSinComparar: string | null = null
  if (p.comparar === 'mejor_mes') {
    const candidatos = candidatosMejorMes(d, hoy)
    const mes = elegirMejorMes(candidatos)
    if (mes) {
      const c = candidatos.find(x => x.mes === mes)!
      mejorMes = { mes, costoPorSolicitudUsd: c.inversionUsd / c.solicitudes }
      comp = tramoEnMes(p.rango, mes)
    } else motivoSinComparar = 'Todavía no hay un mes cerrado este año con datos completos de Meta.'
  } else if (p.comparar === 'mes' && !comp) motivoSinComparar = 'Elegí un mes para comparar.'

  const x = await cargarExtras(d, comp && comp.desde < d.total.desde ? comp.desde : d.total.desde)
  const experimento = await getExperiment('tasacion')

  const actual = calcularPeriodo(d, p.rango, 'eventos')
  const anterior = comp ? calcularPeriodo(d, comp, 'eventos') : null
  const delAnio = calcularPeriodo(d, anio, 'eventos')
  const direcciones = new Map(x.props.map(pr => [pr.id, pr.address]))

  const comparacion = {
    modo: p.comparar,
    rango: comp,
    mes: p.comparar === 'mes' ? p.mes ?? null : mejorMes?.mes ?? null,
    etiqueta: !comp ? '' : p.comparar === 'mes' ? nombreMes(p.mes!) : p.comparar === 'mejor_mes' ? `mejor mes: ${nombreMes(mejorMes!.mes)}` : ETIQUETA_MODO[p.comparar],
    costoPorSolicitudMejorMesUsd: mejorMes?.costoPorSolicitudUsd ?? null,
    motivo: motivoSinComparar,
  }

  // ---- Inversión total en Meta (todas las campañas) -----------------------
  const inversionMeta = (r: Rango) => {
    let ars = 0, usd: number | null = 0, dias = 0
    const vistos = new Set<string>()
    for (const m of d.meta) {
      if (m.fecha < r.desde || m.fecha > r.hasta) continue
      if (!vistos.has(m.fecha)) { vistos.add(m.fecha); dias++ }
      ars += m.gasto
      if (usd != null && m.gasto > 0) { const t = d.blue(m.fecha); usd = t ? usd + m.gasto / t : null }
    }
    return dias ? { ars, usd } : null
  }

  // ---- 1. Campaña de tasación ---------------------------------------------
  const tas = totalAnuncios(d.meta, p.rango, 'tasacion', d.blue)
  const tasAntes = comp ? totalAnuncios(d.meta, comp, 'tasacion', d.blue) : null
  const ajustes = calcularAjustes(d.hitos, d.meta, hoy, d.rangoMeta.desde)
  const ultimoDia = d.meta.reduce((m, r) => (r.gasto > 0 && r.fecha > m && embudoDeCampania(r.campania) === 'tasacion' ? r.fecha : m), '')
  const publicadas = variantesPublicadas(experimento)
  const landingsTas = (r: Rango) => porVariante(d.personas, d.visitas, r).filter(v => v.embudo === 'tasacion' && v.visitas > 0)
  const landingsAct = landingsTas(p.rango)
  const tasacion = {
    actual: tas,
    anterior: tasAntes,
    diasActual: diasDe(p.rango),
    diasAnterior: comp ? diasDe(comp) : null,
    ultimoAjuste: ajustes.find(a => a.embudo === 'tasacion') ?? null,
    ajustes,
    /** Último día con gasto de tasación cargado (Meta se sincroniza una vez por día: el día en curso llega al día siguiente). */
    ultimoDiaConGasto: ultimoDia || null,
    // Embudo por cohorte: de las solicitudes del período, cuántas avanzaron.
    embudo: embudoGeneral(tas ? { impresiones: tas.impresiones, clics: tas.clics, visitasMeta: tas.visitas } : null, actual.cohorte.tasacion.pasos, calidad(p.rango)),
    embudoAntes: anterior && comp ? embudoGeneral(tasAntes ? { impresiones: tasAntes.impresiones, clics: tasAntes.clics, visitasMeta: tasAntes.visitas } : null, anterior.cohorte.tasacion.pasos, calidad(comp)) : null,
    /** Si Meta midió bien las visitas en cada período (en la tabla, "sin dato" si no). */
    visitasConfiables: { actual: calidad(p.rango).visitasConfiables, anterior: comp ? calidad(comp).visitasConfiables : null },
    landing: {
      publicadas,
      actual: landingsAct.filter(v => varianteVigente(v, publicadas)),
      /** Otras versiones que tuvieron visitas en el período (antes de cambiar la publicada). */
      otrasDelPeriodo: landingsAct.filter(v => !varianteVigente(v, publicadas)),
      /** Las versiones que estaban publicadas EN el período comparado (por sus visitas). */
      comparado: comp ? landingsTas(comp) : null,
    },
  }

  // ---- 2. Campañas del período, registros de propiedades -----------------
  const enlaces = new Map<string, EnlaceCampania>(x.campanias.map(c => [c.campaign_id, { propiedadId: c.property_id, nombre: direcciones.get(c.property_id) ?? null }]))
  const campAct = consolidarCampanias(porCampania(d.meta, p.rango, enlaces, registrosMetaPorPropiedad(x.leads, p.rango), d.blue))
  const campAnt = comp ? consolidarCampanias(porCampania(d.meta, comp, enlaces, registrosMetaPorPropiedad(x.leads, comp), d.blue)) : []
  const antesPorClave = new Map(campAnt.map(f => [claveCampania(f), f]))
  const campanias = campAct.map(f => ({ ...f, antes: (antesPorClave.get(claveCampania(f)) ?? null) as FilaCampania | null }))
  const regAct = registrosPorPropiedad(x.leads, p.rango, direcciones)
  const regAnt = comp && cubre(comp, x.pisoLeads) ? registrosPorPropiedad(x.leads, comp, direcciones) : null
  // Algunos anuncios mandan su NÚMERO en el enlace en vez del nombre: se traduce
  // con UNA consulta corta a Meta (3 s); si falla, queda el número.
  const POR_ID = /^Anuncio «(\d{6,25})»$/
  const ids = regAct.porPropiedad.flatMap(r => r.detalle.map(dd => POR_ID.exec(dd.etiqueta)?.[1]).filter((y): y is string => !!y))
  if (ids.length) {
    const nombres = await nombresDeAnuncios(ids)
    for (const r of regAct.porPropiedad) {
      for (const dd of r.detalle) {
        const id = POR_ID.exec(dd.etiqueta)?.[1]
        if (id && nombres.has(id)) dd.etiqueta = `Anuncio «${nombres.get(id)!.slice(0, 80)}»`
      }
    }
  }

  // ---- 3. Consultas y propiedades ----------------------------------------
  const consAct = consultasPorPortal(x.consultas, p.rango)
  const consAnt = comp && cubre(comp, x.pisoConsultas) ? consultasPorPortal(x.consultas, comp) : null

  // ---- 4. Plata -----------------------------------------------------------
  // Sin ningún día con gasto de Meta en el período comparado no hay dato de margen (igual que el panel).
  const sinMetaAntes = !!anterior && anterior.canales.tasacion.diasConGasto + anterior.canales.clase.diasConGasto === 0

  return {
    parametros: { rango: p.rango, comparar: p.comparar, mes: p.mes ?? null, hoy },
    comparacion,
    inversionMeta: { actual: inversionMeta(p.rango), anterior: comp ? inversionMeta(comp) : null },
    tasacion,
    campanias,
    registros: { actual: regAct, anterior: regAnt ? { total: regAnt.total, personas: regAnt.personas, porPropiedad: regAnt.porPropiedad.map(r => ({ propiedadId: r.propiedadId, total: r.total })) } : null },
    consultas: { actual: consAct, anterior: consAnt },
    propiedades: {
      actual: resumenPropiedades(x.props, d.ventas, p.rango),
      anterior: comp ? resumenPropiedades(x.props, d.ventas, comp) : null,
      cartera: cartera(x.props),
    },
    plata: {
      actual: actual.plata,
      anterior: anterior && !sinMetaAntes ? anterior.plata : null,
      adquisicion: actual.adquisicion,
      anio,
      margenNetoAnioUsd: delAnio.plata.margenNetoUsd,
      facturadoAnioUsd: delAnio.plata.facturacionUsd,
    },
    excluidas: d.excluidas,
    generadoEn: new Date().toISOString(),
  }
}

/** Qué datos de tasación son confiables en el rango (las mismas reglas que el panel validado). */
function calidad(r: Rango) {
  const sin = VISITAS_META_SIN_DATO.tasacion
  const tocaSinVisitas = !!sin && r.desde <= sin.hasta && r.hasta >= sin.desde
  return { visitasConfiables: !tocaSinVisitas, realizadasConDato: r.desde > REALIZADAS_SIN_DATO_HASTA }
}

const diasDe = (r: Rango) =>Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000) + 1

export type Tablero = Awaited<ReturnType<typeof armarTablero>>
