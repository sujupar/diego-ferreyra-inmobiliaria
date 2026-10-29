import 'server-only'
/**
 * Arma el período de Consultas que viaja a la pantalla. Lo usan la página
 * (`app/(dashboard)/consultas/page.tsx`, primera carga dentro del HTML) y
 * `GET /api/consultas` (cambio de período): UNA sola definición, así lo que se
 * ve al abrir y lo que se ve al cambiar el período no pueden divergir.
 *
 * Los permisos los decide quien llama (rol y usuario de la SESIÓN); acá se
 * traducen a alcance. Nunca recibe el alcance del navegador.
 */
import { createClient } from '@supabase/supabase-js'
import * as datos from './datos'
import { consultasEnBandeja } from './bandeja'
import type { PeriodoConsultas } from './tipos'
import { alcanceDeVisitas } from '@/lib/visitas/acceso'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import type { Role } from '@/types/auth.types'

export async function cargarPeriodo(p: {
  rol: Role
  usuarioId: string
  /** AAAA-MM-DD de Argentina, inclusivos. */
  desde: string
  hasta: string
  etiqueta: string
}): Promise<PeriodoConsultas> {
  const leido = await datos.leerPeriodo({
    alcance: alcanceDeVisitas(p.rol, p.usuarioId),
    desde: inicioDelDiaArgentina(p.desde),
    hasta: finDelDiaArgentina(p.hasta),
  })
  return {
    periodo: { desde: p.desde, hasta: p.hasta, etiqueta: p.etiqueta },
    consultas: consultasEnBandeja(leido.filas, leido.visitas, leido.propiedades, leido.asesores),
    truncado: leido.truncado,
  }
}

/**
 * Asesores activos para el filtro de asesor (la misma lista que
 * `GET /api/users/advisors`), leídos acá para que viajen con la página en vez
 * de costar un pedido más desde el navegador.
 */
export async function asesoresActivos(): Promise<Array<{ id: string; full_name: string }>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  const { data, error } = await createClient(url, key)
    .from('profiles')
    .select('id, full_name')
    .in('role', ['asesor', 'dueno'])
    .eq('is_active', true)
    .order('full_name')
  if (error) throw new Error(`asesores activos: ${error.message}`)
  return (data ?? []).map((r) => ({ id: String(r.id), full_name: String(r.full_name ?? '') }))
}
