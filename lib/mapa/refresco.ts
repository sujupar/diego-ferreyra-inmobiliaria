/**
 * Qué celda del mapa propio actualizar en cada corrida de la tarea mensual
 * (`/api/cron/mapa-lugares`, una celda por corrida). Puro y testeado.
 *
 * Los datos de estaciones, paradas y plazas cambian poco: se refrescan cada 30
 * días. Una celda que falló no se reintenta antes de una hora (el servidor
 * público que falló suele seguir caído un rato) y conserva sus datos anteriores.
 */
export const REFRESCO_DIAS = 30
export const ESPERA_TRAS_ERROR_MS = 60 * 60 * 1000

export interface EstadoCelda {
  id: string
  estado: string
  actualizado_en: string | null
  intentado_en: string | null
}

export function elegirCeldaParaActualizar(celdas: EstadoCelda[], ahora: Date): string | null {
  const limite = ahora.getTime() - REFRESCO_DIAS * 86_400_000
  const t = (iso: string | null) => (iso ? Date.parse(iso) : -Infinity)
  const candidatas = celdas.filter(c => {
    const vencida = !c.actualizado_en || t(c.actualizado_en) < limite
    const enEspera = c.estado === 'error' && ahora.getTime() - t(c.intentado_en) < ESPERA_TRAS_ERROR_MS
    return vencida && !enEspera
  })
  candidatas.sort((a, b) => t(a.actualizado_en) - t(b.actualizado_en) || t(a.intentado_en) - t(b.intentado_en))
  return candidatas[0]?.id ?? null
}
