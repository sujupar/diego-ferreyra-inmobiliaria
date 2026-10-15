/**
 * Atajos de "¿cuánto ofertarías?" (spec §3.6 paso 6) y cómo se escribe un monto. Puro y seguro
 * para el navegador. Sin precio publicado no hay atajos: inventar un ancla sería peor que nada.
 */
import { formatearMiles } from '@/lib/properties/money-input'
import type { Moneda } from './tipos'

export interface AtajoOferta { etiqueta: string; monto: number }

function redondear(monto: number, moneda: Moneda): number {
  const paso = moneda === 'ARS' ? 100_000 : 1_000
  return Math.max(paso, Math.round(monto / paso) * paso)
}

export function atajosDeOferta(precio: number | null, moneda: Moneda): AtajoOferta[] {
  if (precio === null || !Number.isFinite(precio) || precio <= 0) return []
  const lista: AtajoOferta[] = [
    { etiqueta: '−10 %', monto: redondear(precio * 0.9, moneda) },
    { etiqueta: '−5 %', monto: redondear(precio * 0.95, moneda) },
    { etiqueta: 'Precio publicado', monto: redondear(precio, moneda) },
  ]
  const vistos = new Set<number>()
  return lista.filter(a => (vistos.has(a.monto) ? false : (vistos.add(a.monto), true)))
}

export function textoMonto(monto: number, moneda: Moneda): string {
  const n = formatearMiles(String(Math.round(monto)))
  return moneda === 'USD' ? `US$ ${n}` : `$ ${n}`
}
