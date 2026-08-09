/**
 * Los TRES valores canónicos de `properties.operation_type`.
 *
 * POR QUÉ vive en un módulo propio: la columna es texto libre en Postgres —
 * NO hay CHECK que avise. Si alguien escribe `alquiler_temporario`, la base lo
 * acepta callada y río abajo el daño es silencioso: `resolveCategory` de
 * MercadoLibre no encuentra categoría, `derivedPrefill` de Argenprop cae en
 * `VENTA` y un alquiler temporario termina publicado COMO VENTA. Por eso el
 * formulario de alta elige de acá y la ruta que escribe valida contra acá.
 *
 * Deben coincidir con `ML_OPERACIONES_SOPORTADAS`
 * (lib/portals/mercadolibre/mapping.ts) — hay un test que lo verifica.
 */
export const OPERACIONES_VALORES = ['venta', 'alquiler', 'temporario'] as const

export type Operacion = (typeof OPERACIONES_VALORES)[number]

/** Etiquetas para el desplegable del alta. El orden es el de `OPERACIONES_VALORES`. */
export const OPERACIONES: ReadonlyArray<{ valor: Operacion; etiqueta: string }> = [
  { valor: 'venta', etiqueta: 'Venta' },
  { valor: 'alquiler', etiqueta: 'Alquiler' },
  { valor: 'temporario', etiqueta: 'Alquiler temporario' },
]

export function esOperacion(valor: unknown): valor is Operacion {
  return typeof valor === 'string' && (OPERACIONES_VALORES as readonly string[]).includes(valor)
}
