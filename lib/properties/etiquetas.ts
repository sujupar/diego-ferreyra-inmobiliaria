/**
 * Cómo se NOMBRA una propiedad en castellano: el tipo y la operación.
 *
 * ## Por qué existe este archivo
 *
 * Estas dos funciones vivían dentro de `lib/marketing/ad-image-generator-v2.ts`,
 * que importa `sharp` en el tope. Cualquier módulo que las necesitara se
 * arrastraba toda la maquinaria de generación de imágenes — inaceptable para el
 * webhook de Instagram, que corre por cada comentario que entra.
 *
 * Acá no hay dependencias: ni red, ni base, ni `process.env`. El generador de
 * imágenes las REEXPORTA, así que sus cinco consumidores (incluidos los anuncios
 * de Meta, que gastan presupuesto real) siguen importándolas de donde siempre y
 * no hubo que tocarlos.
 *
 * Queda una tercera copia privada en `lib/marketing/ad-image-prompts.ts`, que es
 * un duplicado declarado a propósito en su propio comentario. No se toca acá:
 * unificarla es un cambio del área de anuncios, no de esta.
 */

/**
 * Tipo de propiedad con mayúscula inicial y en castellano.
 *
 * El dueño pidió expresamente "Departamento", nunca "departamento" (2026-07-25),
 * porque el valor crudo de la base viene en minúscula y a veces en inglés.
 */
export function normalizePropertyTypeLabel(t: string | null | undefined): string {
  const map: Record<string, string> = {
    apartment: 'Departamento',
    departamento: 'Departamento',
    depto: 'Departamento',
    dpto: 'Departamento',
    house: 'Casa',
    casa: 'Casa',
    ph: 'PH',
    'p.h.': 'PH',
    loft: 'Loft',
    duplex: 'Dúplex',
    'dúplex': 'Dúplex',
    studio: 'Monoambiente',
    monoambiente: 'Monoambiente',
    mono: 'Monoambiente',
  }
  const key = (t ?? '').toString().toLowerCase().trim()
  // Fallback: capitalizar la primera letra (nunca dejar el tipo en minúscula cruda).
  const raw = (t ?? 'Propiedad').toString()
  return map[key] ?? (raw.charAt(0).toUpperCase() + raw.slice(1))
}

/** Etiqueta de operación: "En venta" / "En alquiler" / "Alquiler temporario". */
export function operationLabelFor(op: string | null | undefined): string {
  const key = (op ?? 'venta').toString().toLowerCase().trim()
  if (key === 'alquiler') return 'En alquiler'
  if (key === 'temporario' || key === 'alquiler_temporario' || key === 'temporal') return 'Alquiler temporario'
  return 'En venta'
}
