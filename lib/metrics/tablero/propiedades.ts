/**
 * Franja "Propiedades" del Tablero. Módulo puro.
 *
 *  - Captadas: `properties.captured_at` en el período (fecha Argentina). Fuera las
 *    fichas fusionadas (dirección "[FUSIONADA->…]", duplicados del import).
 *  - Reservas / escrituras: `ventas.reservada_en` / `ventas.escriturada_en` en el
 *    período, sin las operaciones caídas.
 *  - Cartera: HOY (no depende del período): propiedades captadas que no están
 *    descartadas, agrupadas por estado comercial.
 */

import { dia } from '../panel/personas'
import { enRango, type Rango } from '../panel/rango'

export interface PropiedadRow {
  id: string
  address: string | null
  captured_at: string | null
  commercial_status: string | null
  status: string | null
}

export interface VentaFechas { estado: string | null; reservada_en: string | null; escriturada_en: string | null }

export const ETIQUETA_ESTADO_COMERCIAL: Record<string, string> = {
  disponible: 'Disponible',
  reservada: 'Reservada',
  vendida: 'Vendida',
  dada_de_baja: 'Dada de baja',
  descartada: 'Descartada',
}

const fusionada = (p: PropiedadRow) => (p.address ?? '').startsWith('[FUSIONADA')

export function resumenPropiedades(props: PropiedadRow[], ventas: VentaFechas[], r: Rango) {
  const vivas = ventas.filter(v => v.estado !== 'caida')
  return {
    captadas: props.filter(p => !fusionada(p) && enRango(dia(p.captured_at), r)).length,
    reservas: vivas.filter(v => enRango(v.reservada_en, r)).length,
    escrituras: vivas.filter(v => enRango(v.escriturada_en, r)).length,
  }
}

export function cartera(props: PropiedadRow[]): { disponible: number; porEstado: { estado: string; cantidad: number }[] } {
  const M = new Map<string, number>()
  for (const p of props) {
    if (!p.captured_at || fusionada(p) || p.status === 'descartada') continue
    const e = p.commercial_status ?? 'disponible'
    M.set(e, (M.get(e) ?? 0) + 1)
  }
  const orden = Object.keys(ETIQUETA_ESTADO_COMERCIAL)
  const pos = (e: string) => { const i = orden.indexOf(e); return i < 0 ? orden.length : i }
  const porEstado = [...M.entries()].map(([estado, cantidad]) => ({ estado, cantidad })).sort((a, b) => pos(a.estado) - pos(b.estado))
  return { disponible: M.get('disponible') ?? 0, porEstado }
}
