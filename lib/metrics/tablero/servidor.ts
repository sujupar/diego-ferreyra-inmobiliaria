/**
 * Arma el Tablero de /metrics (spec docs/superpowers/specs/2026-11-20-metricas-pantalla-a-design.md).
 * SOLO servidor. Reusa la carga del panel (`cargarDatos`): personas, Meta,
 * visitas, video, ventas y gastos se bajan UNA vez; acá se suman solo las
 * consultas chicas que el panel no tenía (registros de propiedades, consultas de
 * portales, propiedades, campañas de propiedades, configuración del A/B).
 */
import 'server-only'
import { getExperiment } from '@/lib/funnel/experiment'
import { calcularPeriodo, cargarDatos, type Datos } from '../panel/servidor'
import { embudoDeCampania, porVariante } from '../panel/embudo'
import { armarVideoCohortes, MEDICION_CONFIABLE_DESDE } from '../panel/video-cohortes'
import { hoyArgentina, sumarDias, type Comparar, type Rango } from '../panel/rango'
import { calcularAjustes, porCampania, totalAnuncios, type EnlaceCampania } from './anuncios'
import { consultasPorPortal, medianaDiasAgenda, referidos, registrosMetaPorPropiedad, registrosPorPropiedad, sinAgendar, type ConsultaRow, type LeadRow } from './comercial'
import { numerosPagina, paginasPublicadas, varianteVigente, variantesPublicadas, videoVigente } from './pagina'
import { cartera, resumenPropiedades, type PropiedadRow } from './propiedades'
import { estadoFranja } from './estado'

export interface ParametrosTablero { rango: Rango; comparar: Comparar }

/** Inicio del día `fecha` en Argentina (UTC−3), en ISO UTC. */
const inicioDiaAr = (fecha: string) => `${fecha}T03:00:00.000Z`

async function cargarExtras(d: Datos) {
  const { sb, total } = d
  // Un día de margen para atrás: la fecha que manda es la de Argentina.
  const desdeIso = inicioDiaAr(sumarDias(total.desde, -1))
  const [leads, consultas, props, campanias] = await Promise.all([
    sb.from('property_leads').select('property_id, source, utm, created_at, suspected_bot, deleted_at').gte('created_at', desdeIso).order('created_at').limit(5000),
    sb.from('portal_inquiries').select('portal, received_at, created_at').or(`received_at.gte.${desdeIso},created_at.gte.${desdeIso}`).order('created_at').limit(10000),
    sb.from('properties').select('id, address, captured_at, commercial_status, status').limit(5000),
    sb.from('property_meta_campaigns').select('property_id, campaign_id').limit(5000),
  ])
  for (const r of [leads, consultas, props, campanias]) if (r.error) throw new Error(r.error.message)
  return {
    leads: (leads.data ?? []) as LeadRow[],
    consultas: (consultas.data ?? []) as ConsultaRow[],
    props: (props.data ?? []) as PropiedadRow[],
    campanias: (campanias.data ?? []) as { property_id: string; campaign_id: string }[],
  }
}

export async function armarTablero(p: ParametrosTablero, ahora = new Date()) {
  const hoy = hoyArgentina(ahora)
  const anio: Rango = { desde: p.rango.hasta.slice(0, 4) + '-01-01', hasta: p.rango.hasta }
  const d = await cargarDatos({ rango: p.rango, comparar: p.comparar, agrupar: 'mes', vista: 'eventos' }, { metaDesde: anio.desde, metaHasta: hoy })
  const [x, experimento] = await Promise.all([cargarExtras(d), getExperiment('tasacion')])
  const comp = d.comp

  const actual = calcularPeriodo(d, p.rango, 'eventos')
  const anterior = comp ? calcularPeriodo(d, comp, 'eventos') : null
  const delAnio = calcularPeriodo(d, anio, 'eventos')

  const direcciones = new Map(x.props.map(pr => [pr.id, pr.address]))

  // ---- Anuncios -----------------------------------------------------------
  const enlaces = new Map<string, EnlaceCampania>(x.campanias.map(c => [c.campaign_id, { propiedadId: c.property_id, nombre: direcciones.get(c.property_id) ?? null }]))
  const tas = totalAnuncios(d.meta, p.rango, 'tasacion')
  const tasAntes = comp ? totalAnuncios(d.meta, comp, 'tasacion') : null
  const ajustes = calcularAjustes(d.hitos, d.meta, hoy, d.rangoMeta.desde)
  const ultimo = ajustes.find(a => a.embudo === 'tasacion') ?? null
  const ultimoDia = d.meta.reduce((m, r) => (r.gasto > 0 && r.fecha > m && embudoDeCampania(r.campania) === 'tasacion' ? r.fecha : m), '')
  const anuncios = {
    actual: tas,
    anterior: tasAntes,
    ultimoAjuste: ultimo,
    campanias: porCampania(d.meta, p.rango, enlaces, registrosMetaPorPropiedad(x.leads, p.rango)),
    ajustes,
    /** Último día con gasto de tasación cargado (Meta se sincroniza una vez por día, 9:30 UTC: el día en curso llega al día siguiente). */
    ultimoDiaConGasto: ultimoDia || null,
    estado: estadoFranja(tas?.costoPorRegistro, tasAntes?.costoPorRegistro, 'baja'),
  }

  // ---- Comercial ----------------------------------------------------------
  const pasos = actual.canales.tasacion.pasos
  const pasosAntes = anterior?.canales.tasacion.pasos ?? null
  const cuatro = (ps: typeof pasos) => ({ solicitudes: ps[0].cantidad, agendadas: ps[1].cantidad, realizadas: ps[2].cantidad, captadas: ps[4].cantidad })
  const dealsPorId = new Map(d.deals.map(x2 => [x2.id, x2]))
  const nombres = new Map(d.contactos.map(c => [c.id, c.full_name]))
  const regAct = registrosPorPropiedad(x.leads, p.rango, direcciones)
  const regAnt = comp ? registrosPorPropiedad(x.leads, comp, direcciones) : null
  const consAct = consultasPorPortal(x.consultas, p.rango)
  const consAnt = comp ? consultasPorPortal(x.consultas, comp) : null
  const comercial = {
    actual: cuatro(pasos),
    anterior: pasosAntes ? cuatro(pasosAntes) : null,
    pasos,
    medianaDiasAgenda: medianaDiasAgenda(d.personas, p.rango),
    medianaDiasAgendaAntes: comp ? medianaDiasAgenda(d.personas, comp) : null,
    sinAgendar: sinAgendar(d.personas, dealsPorId, nombres, p.rango, ahora),
    referidos: referidos(d.deals, d.historia, p.rango, d.pruebas),
    referidosAntes: comp ? referidos(d.deals, d.historia, comp, d.pruebas) : null,
    registros: regAct,
    registrosAntes: regAnt?.total ?? null,
    consultas: consAct,
    consultasAntes: consAnt?.total ?? null,
    estado: estadoFranja(pasos[1].cantidad, pasosAntes?.[1].cantidad, 'sube'),
  }

  // ---- Página y video -----------------------------------------------------
  const publicadas = variantesPublicadas(experimento)
  const paginas = paginasPublicadas(publicadas)
  const variantesAct = porVariante(d.personas, d.visitas, p.rango)
  const variantesAnt = comp ? porVariante(d.personas, d.visitas, comp) : null
  const cohortes = (r: Rango) => (d.filasCohortes ? armarVideoCohortes({ ...d.filasCohortes, pruebas: d.pruebas, rango: r }) : null)
  const videosAct = cohortes(p.rango)
  const videosAnt = comp ? cohortes(comp) : null
  const numPag = numerosPagina(variantesAct, videosAct, publicadas)
  const numPagAntes = variantesAnt ? numerosPagina(variantesAnt, videosAnt, publicadas) : null
  const pagina = {
    publicadas,
    actual: numPag,
    anterior: numPagAntes,
    landings: variantesAct.filter(v => varianteVigente(v, publicadas)),
    landingsAnteriores: variantesAct.filter(v => !varianteVigente(v, publicadas)),
    videos: videosAct?.filter(v => videoVigente(v.videoKey, paginas)) ?? null,
    videosAnteriores: videosAct?.filter(v => !videoVigente(v.videoKey, paginas)) ?? null,
    medicionVideoDesde: MEDICION_CONFIABLE_DESDE,
    estado: estadoFranja(numPag.conversion, numPagAntes?.conversion, 'sube'),
  }

  // ---- Propiedades --------------------------------------------------------
  const propAct = resumenPropiedades(x.props, d.ventas, p.rango)
  const propAnt = comp ? resumenPropiedades(x.props, d.ventas, comp) : null
  const propiedades = {
    actual: propAct,
    anterior: propAnt,
    cartera: cartera(x.props),
    estado: estadoFranja(propAct.captadas, propAnt?.captadas, 'sube'),
  }

  // ---- Plata --------------------------------------------------------------
  const comisiones = (pl: typeof actual.plata) => pl.repartoUsd.asesor + pl.repartoUsd.julian + pl.repartoUsd.referidor
  const publicidad = (pl: typeof actual.plata) => pl.publicidadCaptacionUsd + pl.publicidadPropiedadesUsd
  const resumenPlata = (per: typeof actual) => ({
    facturacionUsd: per.plata.facturacionUsd,
    comisionesUsd: comisiones(per.plata),
    publicidadUsd: publicidad(per.plata),
    margenNetoUsd: per.plata.margenNetoUsd,
  })
  // Sin ningún día con gasto de Meta en el período comparado no hay dato de margen (igual que el panel).
  const sinMetaAntes = !!anterior && anterior.canales.tasacion.diasConGasto + anterior.canales.clase.diasConGasto === 0
  const plata = {
    actual: resumenPlata(actual),
    anterior: anterior && !sinMetaAntes ? resumenPlata(anterior) : null,
    detalle: actual.plata,
    adquisicion: actual.adquisicion,
    estado: estadoFranja(actual.plata.margenNetoUsd, anterior && !sinMetaAntes ? anterior.plata.margenNetoUsd : null, 'sube'),
  }

  return {
    parametros: { ...p, comparado: comp, hoy },
    cabecera: {
      margenNetoUsd: actual.plata.margenNetoUsd,
      /** No hay todavía dónde cargar una meta mensual de margen: la pantalla muestra solo el número. */
      metaMesUsd: null as number | null,
      anio,
      margenNetoAnioUsd: delAnio.plata.margenNetoUsd,
      facturadoAnioUsd: delAnio.plata.facturacionUsd,
      gastosAConfirmar: actual.plata.gastosAConfirmar,
      sinImpuestos: actual.plata.sinImpuestos,
    },
    anuncios,
    comercial,
    pagina,
    propiedades,
    plata,
    excluidas: d.excluidas,
    generadoEn: new Date().toISOString(),
  }
}

export type Tablero = Awaited<ReturnType<typeof armarTablero>>
