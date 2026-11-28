/**
 * Sección "Llamadas a las solicitudes" del Tablero (crm-estadisticas-llamadas, D2).
 * Las solicitudes son las MISMAS personas de tasación que el Tablero cuenta en el período
 * (sin pruebas, colegas ni repetidas), creadas desde el inicio de la medición. Se suma una
 * sola lectura: los intentos de `contact_activities`. Si esa lectura falla, la sección dice
 * que no se pudo cargar y el resto del Tablero sigue.
 */
import { INICIO_MEDICION_LLAMADAS, metricasLlamadas, type IntentoMedido, type MetricasLlamadas, type SolicitudMedida } from '@/lib/crm/metricas-llamadas'
import { enArgentina } from '@/lib/crm/horario-laboral'
import type { DealRow, Persona } from '../panel/personas'
import type { Rango } from '../panel/rango'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Día de Argentina en que empieza la medición (ese día cuenta desde las 21:04). */
export const DIA_INICIO_MEDICION = enArgentina(new Date(INICIO_MEDICION_LLAMADAS)).fecha

export type SeccionLlamadas =
  | { ok: true; antesDeLaMedicion: boolean; medicionRecortada: boolean; datos: MetricasLlamadas }
  | { ok: false }

/** 00:00 de Argentina del día `fecha`, en ms. */
const inicioDia = (fecha: string) => Date.parse(`${fecha}T03:00:00.000Z`)

/**
 * Piso de la lectura, por `created_at`: una llamada de una solicitud ocurre después de creada
 * y se carga a lo sumo 5 min antes de su hora; un día de margen alcanza (auditoría 13).
 */
export function pisoDeLectura(r: Rango): string {
  return new Date(Math.max(Date.parse(INICIO_MEDICION_LLAMADAS), inicioDia(r.desde) - 86_400_000)).toISOString()
}

/** Las solicitudes de tasación del período que se miden. */
export function solicitudesMedidas(personas: readonly Persona[], deals: readonly Pick<DealRow, 'id' | 'created_at'>[], r: Rango): SolicitudMedida[] {
  const creado = new Map(deals.map((d) => [d.id, d.created_at]))
  const inicio = Date.parse(INICIO_MEDICION_LLAMADAS)
  const out: SolicitudMedida[] = []
  for (const p of personas) {
    if (p.embudo !== 'tasacion') continue
    const dia = p.fechas.solicitud
    if (!dia || dia < r.desde || dia > r.hasta) continue
    const creadoEn = creado.get(p.dealId)
    if (!creadoEn || Date.parse(creadoEn) < inicio) continue
    out.push({ dealId: p.dealId, contactId: p.contactId, creadoEn })
  }
  return out
}

type Leer = (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/**
 * Arma la sección. `todas` es el paginador del panel (PostgREST corta en 1000 filas sin
 * avisar). Nunca tira: un error se registra y la sección queda `{ ok: false }`.
 */
export async function seccionLlamadas(
  sb: SupabaseClient,
  todas: <T>(leer: Leer) => Promise<T[]>,
  personas: readonly Persona[],
  deals: readonly Pick<DealRow, 'id' | 'created_at'>[],
  r: Rango,
): Promise<SeccionLlamadas> {
  try {
    const solicitudes = solicitudesMedidas(personas, deals, r)
    const intentos = solicitudes.length === 0 ? [] : await todas<IntentoMedido>((a, b) =>
      sb.from('contact_activities')
        .select('id, deal_id, contact_id, kind, call_outcome, occurred_at, created_at, voided_at')
        .in('kind', ['call', 'whatsapp_sent'])
        .is('voided_at', null)
        // Por cuándo se CARGÓ (una hora corregida hacia atrás no la deja afuera).
        .gte('created_at', pisoDeLectura(r))
        .order('id')
        .range(a, b))
    return {
      ok: true,
      antesDeLaMedicion: r.hasta < DIA_INICIO_MEDICION,
      // El 26/11 también: la medición arranca a las 21:04 (auditoría 10).
      medicionRecortada: inicioDia(r.desde) < Date.parse(INICIO_MEDICION_LLAMADAS),
      datos: metricasLlamadas(solicitudes, intentos),
    }
  } catch (e) {
    console.error('[tablero] falló la sección de llamadas:', e instanceof Error ? e.message : e)
    return { ok: false }
  }
}
