/**
 * Ventas, gastos fijos e hitos que se cargan una sola vez al estrenar el panel.
 *
 * Fuente: documento "Datos para la reunión del lunes", tabla 1, completado por
 * Diego en la reunión del 2026-09-28 (+ Agüero, agregada después). Cuando Diego
 * anotó solo el mes, la fecha es el día 1.
 *
 * El honorario cobrado se carga tal cual lo anotó Diego; el reparto con la
 * regla del dueño. Tres cuentas no dan igual que su anotación y quedan marcadas
 * para revisar (ver notas). Lo usa `scripts/metricas/cargar-datos-panel.ts`.
 */

import type { VentaRow } from './reparto'
import type { GastoFijo } from './economia'

type V = Omit<VentaRow, 'id' | 'property_id' | 'escriturada_en' | 'moneda' | 'otra_inmobiliaria_usd' | 'gastos_propiedad_usd' | 'a_confirmar' | 'referidor_nombre' | 'estado'> &
  Partial<Pick<VentaRow, 'escriturada_en' | 'a_confirmar' | 'referidor_nombre' | 'estado'>>

const base = (v: V): VentaRow => ({
  estado: 'vendida', escriturada_en: null, moneda: 'USD', otra_inmobiliaria_usd: 0, gastos_propiedad_usd: 0,
  a_confirmar: false, referidor_nombre: null, ...v,
})
const sinPct = { pct_vendedor: null, pct_comprador: null }
const ABOGADA = 'Abogada (refirió Baigorria, Maure y Santo Tomé)'

export const VENTAS_INICIALES: VentaRow[] = [
  base({ direccion: 'Piedras', captada_en: '2025-11-01', reservada_en: '2026-03-30', precio: 68000, pct_vendedor: 1, pct_comprador: 2, honorario_cobrado_usd: 2040, capto: 'Diego', vendio: 'Lucas', asesor_pct: 20, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: 'Con otra inmobiliaria: quedó 1% de la propietaria y 2% de la compradora. Diego anotó el precio como "68": se tomó USD 68.000.' }),
  base({ direccion: 'Moreno 3885 6 A', captada_en: '2025-10-01', reservada_en: '2025-12-01', precio: 70000, ...sinPct, honorario_cobrado_usd: 3250, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: 'Cobrado al vendedor.' }),
  base({ direccion: 'Peña 671', captada_en: '2025-11-01', reservada_en: '2026-02-01', precio: 68000, ...sinPct, honorario_cobrado_usd: 2689, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: 'Cobrado al comprador. Herencia.' }),
  base({ direccion: 'Peña 2778 1 A', captada_en: '2025-09-01', reservada_en: '2025-12-01', escriturada_en: '2026-03-01', precio: 181700, ...sinPct, honorario_cobrado_usd: 9967, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: 'Cobrado al comprador.' }),
  base({ direccion: 'Baigorria', captada_en: '2026-01-01', reservada_en: '2026-01-01', precio: 92000, ...sinPct, honorario_cobrado_usd: 3280, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_nombre: ABOGADA, referidor_pct: 17.5, origen_dueno: 'referido', notas: 'CUENTA A REVISAR: Diego anotó 3.280 − 574 para la abogada (se manejó modificando los porcentajes) = 2.706.' }),
  base({ direccion: 'Lares de Canning', captada_en: '2025-08-01', reservada_en: '2025-12-01', precio: 230000, ...sinPct, honorario_cobrado_usd: 10350, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: 'La diferencia al 7% fue para la otra inmobiliaria. La ficha de la plataforma todavía la muestra disponible.' }),
  base({ direccion: 'Rosario 755', captada_en: '2025-05-01', reservada_en: '2026-01-01', precio: 120000, ...sinPct, honorario_cobrado_usd: 7625, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: 'El dueño también trajo Lares de Canning.' }),
  base({ direccion: 'Maure', captada_en: '2025-10-01', reservada_en: '2026-02-01', precio: 70000, pct_vendedor: 7, pct_comprador: null, honorario_cobrado_usd: 4900, capto: 'Diego', vendio: 'Lucas', asesor_pct: 20, julian_pct: 0, referidor_nombre: ABOGADA, referidor_pct: 20, origen_dueno: 'referido', notas: 'CUENTA A REVISAR: Diego anotó que le quedaron 2.832; con 7% − 20% − 20% da 2.940.' }),
  base({ direccion: 'Nahuel Huapi', captada_en: '2026-03-01', reservada_en: '2026-04-01', precio: 115000, pct_vendedor: 5, pct_comprador: null, honorario_cobrado_usd: 5750, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: null }),
  base({ direccion: 'Tupac Amaru', captada_en: '2025-10-01', reservada_en: '2026-04-01', precio: 110000, ...sinPct, honorario_cobrado_usd: 4400, capto: 'Diego', vendio: 'Lucas', asesor_pct: 20, julian_pct: 20, referidor_pct: 0, origen_dueno: 'embudo', notas: 'Con otra inmobiliaria: quedó el 4%. Diego anotó "Redes o anuncio".' }),
  base({ direccion: 'Luis Viale', captada_en: '2025-12-01', reservada_en: '2026-01-01', precio: 59000, pct_vendedor: 2, pct_comprador: 4, honorario_cobrado_usd: 3540, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: null }),
  base({ direccion: 'Quesada', captada_en: '2025-12-01', reservada_en: '2026-03-01', precio: 600000, ...sinPct, honorario_cobrado_usd: 42000, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: '7%. La recomendó una persona que había tasado por el embudo. La ficha de la plataforma todavía la muestra disponible.' }),
  base({ direccion: 'Díaz Vélez', captada_en: '2026-01-01', reservada_en: '2026-04-01', precio: 118000, pct_vendedor: 3, pct_comprador: 4, honorario_cobrado_usd: 8260, capto: 'Diego', vendio: 'Lucas', asesor_pct: 20, julian_pct: 20, referidor_pct: 0, origen_dueno: 'embudo', notas: null }),
  base({ direccion: 'Matorras', captada_en: '2026-01-01', reservada_en: '2026-04-22', precio: 270000, pct_vendedor: 3, pct_comprador: 2, honorario_cobrado_usd: 13500, capto: 'Diego', vendio: 'Diego', asesor_pct: 0, julian_pct: 0, referidor_pct: 0, origen_dueno: 'portal', notas: 'La compradora llegó por un aviso y en el seguimiento se captó su propiedad. 1% se lo llevó la inmobiliaria que trajo al comprador.' }),
  base({ direccion: 'Caracas', captada_en: '2026-02-01', reservada_en: '2026-05-01', precio: 146000, pct_vendedor: 1, pct_comprador: 4, honorario_cobrado_usd: 7300, capto: 'Diego', vendio: 'Lucas', asesor_pct: 20, julian_pct: 0, referidor_pct: 0, origen_dueno: 'referido', notas: null }),
  base({ direccion: 'Santo Tomé', captada_en: '2026-05-01', reservada_en: '2026-08-01', precio: 160000, ...sinPct, honorario_cobrado_usd: 8000, capto: 'Diego', vendio: 'Lucas', asesor_pct: 20, julian_pct: 0, referidor_nombre: ABOGADA, referidor_pct: 20, origen_dueno: 'referido', notas: 'CUENTA A REVISAR: Diego anotó 4.900; con 5% − 20% − 20% da 4.800. Mismos dueños que Maure.' }),
  base({ direccion: 'Agüero', estado: 'reservada', captada_en: '2026-06-01', reservada_en: '2026-10-01', precio: 150000, pct_vendedor: 5, pct_comprador: null, honorario_cobrado_usd: null, capto: 'Diego', vendio: 'Lucas', asesor_pct: 20, julian_pct: 20, referidor_pct: 0, origen_dueno: 'embudo', a_confirmar: true, notas: 'A CONFIRMAR: Diego anotó 5% (había otra inmobiliaria), 20% Julián y 20% Lucas, sin el monto cobrado. Se supone 5% de 150.000 = 7.500.' }),
]

export const GASTOS_INICIALES: (GastoFijo & { notas: string })[] = [
  { concepto: 'Oficina (alquiler, expensas, servicios)', tipo: 'fijo', monto_usd: 1300, desde: '2026-01-01', hasta: null, a_confirmar: true, notas: 'Moneda a confirmar con Diego.' },
  { concepto: 'Sueldos y retiros', tipo: 'fijo', monto_usd: 500, desde: '2026-01-01', hasta: null, a_confirmar: true, notas: 'Moneda a confirmar con Diego.' },
  { concepto: 'Portales', tipo: 'fijo', monto_usd: 473, desde: '2026-01-01', hasta: null, a_confirmar: true, notas: 'Moneda a confirmar con Diego.' },
  { concepto: 'Abogada', tipo: 'fijo', monto_usd: 95, desde: '2026-01-01', hasta: null, a_confirmar: true, notas: 'Moneda a confirmar con Diego.' },
  { concepto: 'Cowork', tipo: 'fijo', monto_usd: 100, desde: '2026-01-01', hasta: null, a_confirmar: true, notas: 'Moneda a confirmar con Diego.' },
]

export const HITOS_INICIALES: { fecha: string; embudo: 'tasacion' | 'clase' | null; titulo: string; detalle: string }[] = [
  { fecha: '2026-07-17', embudo: null, titulo: 'Landings propias (fin de GoHighLevel)', detalle: 'Las solicitudes entran por la plataforma y desde el 20/7 se miden las visitas propias (antes, las de Meta).' },
  { fecha: '2026-09-03', embudo: 'tasacion', titulo: 'Prueba A/B: landing B "Tasación Neta"', detalle: 'La mitad de las visitas ve la versión B.' },
  { fecha: '2026-09-19', embudo: 'tasacion', titulo: 'A/B: reparto por clic y botón de la B arreglado', detalle: 'Las métricas del A/B son válidas desde esta fecha.' },
]
