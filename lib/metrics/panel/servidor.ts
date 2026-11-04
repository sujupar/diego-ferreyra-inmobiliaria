/**
 * Arma el panel de negocio: baja los datos (columnas mínimas) y llama a la
 * lógica pura. SOLO servidor (usa service role).
 *
 * OJO: `appraisals` pesa cientos de MB por los JSON de cada tasación. Acá se
 * piden SOLO `contact_id, created_at` — un `select('*')` de esa tabla ya tumbó
 * la base una vez.
 */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { rpcPaginado } from '@/lib/supabase/rpc-paginado'
import { armarPersonas, type ContactoRow, type DealRow, type Embudo, type HistoriaRow, type InformeRow, type EnvioLanding } from './personas'
import { armarBlue, embudoDeCampania, porVariante, resumirCanal, serie, type MetaDia, type VisitaDia, type Blue } from './embudo'
import { adquisicion, calcularPlata, planificar, TASA_VENTA_DEFAULT, type GastoFijo } from './economia'
import { rangoComparado, type Agrupar, type Comparar, type Rango } from './rango'
import type { VentaRow } from './reparto'

// Las tablas nuevas no están en los tipos generados: cliente sin tipar.
export const db = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient

/** Trae TODAS las filas de una consulta (PostgREST corta en 1000 sin avisar). */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let p = 0; p < 50; p++) {
    const { data, error } = await armar(p * 1000, p * 1000 + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) return out
  }
  throw new Error('Demasiadas filas: el panel cortó la lectura para no colgar la base.')
}

let blueCache: { en: number; blue: Blue } | null = null
/** Dólar blue diario (bluelytics), cacheado 12 h en memoria de la función. */
export async function cargarBlue(): Promise<Blue> {
  if (blueCache && Date.now() - blueCache.en < 12 * 3600_000) return blueCache.blue
  const r = await fetch('https://api.bluelytics.com.ar/v2/evolution.json')
  if (!r.ok) throw new Error(`No se pudo leer el dólar blue (${r.status}).`)
  const blue = armarBlue(await r.json())
  blueCache = { en: Date.now(), blue }
  return blue
}

async function cargarPersonas(sb: SupabaseClient) {
  const [deals, contactos, historia, informes, envios] = await Promise.all([
    todas<DealRow>((a, b) => sb.from('deals').select('id, contact_id, origin, stage, created_at, notes, appraisal_id, landing_variant, scheduled_at, visited_at, visit_completed_at, delivered_at, captured_at').order('id').range(a, b)),
    todas<ContactoRow>((a, b) => sb.from('contacts').select('id, full_name, email, phone').order('id').range(a, b)),
    todas<HistoriaRow>((a, b) => sb.from('deal_stage_history').select('deal_id, to_stage, changed_at').order('id').range(a, b)),
    todas<InformeRow>((a, b) => sb.from('appraisals').select('contact_id, created_at').order('id').range(a, b)),
    todas<EnvioLanding>((a, b) => sb.from('funnel_lead_submissions').select('deal_id, funnel').order('id').range(a, b)),
  ])
  return armarPersonas({ deals, contactos, historia, informes, envios })
}

interface MetaRaw { date: string; campaign_name: string | null; spend: number | string | null; impressions: number | string | null; clicks: number | string | null; landing_page_views: number | string | null; acciones: { action_type: string; value: string }[] | null }

async function cargarMeta(sb: SupabaseClient, r: Rango): Promise<MetaDia[]> {
  const rows = await todas<MetaRaw>((a, b) => sb.from('meta_ads_daily')
    .select('date, campaign_name, spend, impressions, clicks, landing_page_views, acciones:raw_data->actions')
    .gte('date', r.desde).lte('date', r.hasta).order('date').order('campaign_id').range(a, b))
  const n = (x: unknown) => Number(x ?? 0) || 0
  return rows.map(m => {
    const linkClicks = m.acciones?.find(x => x.action_type === 'link_click')
    return {
      fecha: String(m.date).slice(0, 10),
      campania: m.campaign_name ?? '',
      gasto: n(m.spend),
      impresiones: n(m.impressions),
      clics: linkClicks ? n(linkClicks.value) : n(m.clicks),
      visitasMeta: n(m.landing_page_views),
    }
  })
}

async function cargarVisitas(sb: SupabaseClient, r: Rango): Promise<VisitaDia[]> {
  const res = await rpcPaginado<{ dia: string; embudo: Embudo; variante: string; visitas: number }>(
    sb as never, 'get_panel_visitas', { p_desde: r.desde, p_hasta: r.hasta }, ['dia', 'embudo', 'variante'])
  if (res.error) throw new Error(res.error)
  return res.filas.map(v => ({ fecha: String(v.dia).slice(0, 10), embudo: v.embudo, variante: v.variante, visitas: Number(v.visitas) }))
}

export interface VideoFila { video_key: string; embudo: string; cargas: number; reproducciones: number; llegan_25: number; llegan_50: number; llegan_75: number; completan: number; segundos_promedio: number | null }

async function cargarVideo(sb: SupabaseClient, r: Rango): Promise<VideoFila[]> {
  const { data, error } = await sb.rpc('get_panel_video', { p_desde: r.desde, p_hasta: r.hasta })
  if (error) throw new Error(error.message)
  return ((data ?? []) as VideoFila[]).map(v => ({ ...v, cargas: +v.cargas, reproducciones: +v.reproducciones, llegan_25: +v.llegan_25, llegan_50: +v.llegan_50, llegan_75: +v.llegan_75, completan: +v.completan, segundos_promedio: v.segundos_promedio == null ? null : +v.segundos_promedio }))
}

const numVenta = (v: Record<string, unknown>): VentaRow => {
  const n = (x: unknown) => (x == null ? null : Number(x))
  return {
    ...(v as unknown as VentaRow),
    precio: n(v.precio), pct_vendedor: n(v.pct_vendedor), pct_comprador: n(v.pct_comprador),
    otra_inmobiliaria_usd: Number(v.otra_inmobiliaria_usd ?? 0), honorario_cobrado_usd: n(v.honorario_cobrado_usd),
    asesor_pct: Number(v.asesor_pct ?? 0), julian_pct: Number(v.julian_pct ?? 0), referidor_pct: Number(v.referidor_pct ?? 0),
    gastos_propiedad_usd: Number(v.gastos_propiedad_usd ?? 0),
  }
}

export async function cargarVentas(sb: SupabaseClient): Promise<VentaRow[]> {
  const { data, error } = await sb.from('ventas').select('*').order('reservada_en', { ascending: false, nullsFirst: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(numVenta)
}

export async function cargarGastos(sb: SupabaseClient) {
  const { data, error } = await sb.from('gastos_fijos').select('*').order('concepto')
  if (error) throw new Error(error.message)
  return (data ?? []).map(g => ({ ...g, monto_usd: Number(g.monto_usd) })) as (GastoFijo & { id: string; notas: string | null })[]
}

export async function cargarHitos(sb: SupabaseClient) {
  const { data, error } = await sb.from('hitos_metricas').select('id, fecha, embudo, titulo, detalle').order('fecha')
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; fecha: string; embudo: Embudo | null; titulo: string; detalle: string | null }[]
}

export interface ParametrosPanel {
  rango: Rango
  comparar: Comparar
  agrupar: Agrupar
  vista: 'eventos' | 'cohorte'
}

const EMBUDOS: Embudo[] = ['tasacion', 'clase']

export async function armarPanel(p: ParametrosPanel) {
  const sb = db()
  const comp = rangoComparado(p.rango, p.comparar)
  const total: Rango = comp ? { desde: comp.desde < p.rango.desde ? comp.desde : p.rango.desde, hasta: p.rango.hasta > comp.hasta ? p.rango.hasta : comp.hasta } : p.rango

  const [{ personas, excluidas }, meta, visitas, video, blue, ventas, gastos, hitos] = await Promise.all([
    cargarPersonas(sb), cargarMeta(sb, total), cargarVisitas(sb, total), cargarVideo(sb, p.rango),
    cargarBlue(), cargarVentas(sb), cargarGastos(sb), cargarHitos(sb),
  ])

  const periodo = (r: Rango) => {
    const canales = Object.fromEntries(EMBUDOS.map(e => [e, resumirCanal(e, { personas, meta, visitas, blue, rango: r, vista: p.vista })])) as Record<Embudo, ReturnType<typeof resumirCanal>>
    const cohorte = Object.fromEntries(EMBUDOS.map(e => [e, resumirCanal(e, { personas, meta, visitas, blue, rango: r, vista: 'cohorte' })])) as Record<Embudo, ReturnType<typeof resumirCanal>>
    let publicidadPropiedadesUsd = 0
    for (const m of meta) {
      if (embudoDeCampania(m.campania) !== 'propiedad' || m.fecha < r.desde || m.fecha > r.hasta) continue
      const t = blue(m.fecha)
      if (t) publicidadPropiedadesUsd += m.gasto / t
    }
    const publicidadCaptacionUsd = canales.tasacion.inversionUsd + canales.clase.inversionUsd
    const { plata, detalle } = calcularPlata({ ventas, gastos, publicidadCaptacionUsd, publicidadPropiedadesUsd, rango: r, tasaArs: blue })
    const captaciones = canales.tasacion.pasos[4].cantidad + canales.clase.pasos[4].cantidad
    const adq = adquisicion({ publicidadCaptacionUsd, captaciones, limpioPromedioPorVentaUsd: plata.limpioPromedioPorVentaUsd, tasaVenta: TASA_VENTA_DEFAULT })
    return { rango: r, canales, cohorte, plata, detalle, adquisicion: { ...adq, captaciones, tasaVenta: TASA_VENTA_DEFAULT } }
  }

  const actual = periodo(p.rango)
  const anterior = comp ? periodo(comp) : null

  // Tasas para el planificador: cohorte de tasación del período (editables en pantalla).
  const ct = actual.cohorte.tasacion.pasos
  const tasas = {
    realizadaPorSolicitud: ct[0].cantidad ? ct[2].cantidad / ct[0].cantidad : 0,
    costoPorSolicitudUsd: ct[0].cantidad ? actual.canales.tasacion.inversionUsd / ct[0].cantidad : 0,
    captadaPorRealizada: ct[2].cantidad ? ct[4].cantidad / ct[2].cantidad : 0,
    tasaVenta: TASA_VENTA_DEFAULT,
    limpioPorVentaUsd: actual.plata.limpioPromedioPorVentaUsd ?? 0,
  }

  return {
    parametros: { ...p, comparado: comp },
    actual: { ...actual, detalle: undefined },
    anterior: anterior ? { ...anterior, detalle: undefined } : null,
    ventasDelPeriodo: actual.detalle,
    series: Object.fromEntries(EMBUDOS.map(e => [e, serie(e, { personas, meta, visitas, blue, rango: p.rango }, p.agrupar)])),
    variantes: porVariante(personas, visitas, p.rango),
    video,
    hitos: hitos.filter(h => h.fecha >= p.rango.desde && h.fecha <= p.rango.hasta),
    plan: { tasas, ejemplo: planificar(8, tasas) },
    excluidas,
    generadoEn: new Date().toISOString(),
  }
}

export type Panel = Awaited<ReturnType<typeof armarPanel>>

// ---------------------------------------------------------------------------
// Alcance (Meta, por rango: no se puede sumar por día).
// ---------------------------------------------------------------------------
const FILTRO_ALCANCE: Record<Embudo, string> = { tasacion: 'Tasación', clase: 'Clase' }

export async function alcance(r: Rango, hoy: string): Promise<Record<Embudo, number | null>> {
  const sb = db()
  const { data: cache } = await sb.from('meta_reach_cache').select('embudo, alcance, consultado_en').eq('desde', r.desde).eq('hasta', r.hasta)
  const vigente = (c: { consultado_en: string }) => r.hasta < hoy || Date.now() - new Date(c.consultado_en).getTime() < 6 * 3600_000
  const out = {} as Record<Embudo, number | null>
  const tok = process.env.META_ACCESS_TOKEN, cuenta = process.env.META_AD_ACCOUNT_ID
  await Promise.all(EMBUDOS.map(async e => {
    const c = cache?.find(x => x.embudo === e)
    if (c && vigente(c)) { out[e] = Number(c.alcance); return }
    if (!tok || !cuenta) { out[e] = c ? Number(c.alcance) : null; return }
    const f = encodeURIComponent(JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: FILTRO_ALCANCE[e] }]))
    const tr = encodeURIComponent(JSON.stringify({ since: r.desde, until: r.hasta }))
    const url = `https://graph.facebook.com/v21.0/act_${cuenta.replace(/^act_/, '')}/insights?level=account&fields=reach,impressions&filtering=${f}&time_range=${tr}&access_token=${tok}`
    try {
      const j = await (await fetch(url, { cache: 'no-store' })).json()
      if (j.error) throw new Error(j.error.message)
      const fila = j.data?.[0]
      const valor = fila ? Number(fila.reach) : 0
      out[e] = valor
      await sb.from('meta_reach_cache').upsert({ embudo: e, desde: r.desde, hasta: r.hasta, alcance: valor, impresiones: fila ? Number(fila.impressions) : 0, consultado_en: new Date().toISOString() })
    } catch (err) {
      console.warn('[panel/alcance]', e, err instanceof Error ? err.message : err)
      out[e] = c ? Number(c.alcance) : null
    }
  }))
  return out
}
