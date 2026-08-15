/** Catálogos visuales de la Central de Contenido (estilo tablero monday). */

export const CATEGORIAS: Record<string, { label: string; bg: string; text: string; soft: string }> = {
  tendencias: { label: 'Tendencias', bg: 'bg-red-600', text: 'text-white', soft: 'bg-red-50 text-red-700 border-red-200' },
  secretos: { label: 'Secretos', bg: 'bg-amber-500', text: 'text-white', soft: 'bg-amber-50 text-amber-700 border-amber-200' },
  metodo: { label: 'Método', bg: 'bg-blue-600', text: 'text-white', soft: 'bg-blue-50 text-blue-700 border-blue-200' },
  casos: { label: 'Casos', bg: 'bg-emerald-600', text: 'text-white', soft: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  psicologia: { label: 'Psicología', bg: 'bg-purple-600', text: 'text-white', soft: 'bg-purple-50 text-purple-700 border-purple-200' },
  innovacion: { label: 'Innovación', bg: 'bg-cyan-600', text: 'text-white', soft: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
}

export const ESTADOS: Record<string, { label: string; bg: string }> = {
  propuesto: { label: 'Propuesto', bg: 'bg-gray-400' },
  aprobado: { label: 'Aprobado', bg: 'bg-blue-500' },
  guionizado: { label: 'Guionizado', bg: 'bg-amber-500' },
  revisado: { label: 'Revisado', bg: 'bg-purple-500' },
  grabado: { label: 'Grabado', bg: 'bg-rose-500' },
  publicado: { label: 'Publicado', bg: 'bg-emerald-600' },
  descartado: { label: 'Descartado', bg: 'bg-gray-700' },
}

export const ORDEN_ESTADOS = ['propuesto', 'aprobado', 'guionizado', 'revisado', 'grabado', 'publicado', 'descartado']

export const PLATAFORMAS = ['tiktok', 'instagram', 'youtube'] as const

/** La grilla fija aprobada por Diego: qué categoría va en cada slot del día. */
export const GRILLA_SEMANAL: Record<number, [string, string]> = {
  1: ['tendencias', 'secretos'], // lunes
  2: ['metodo', 'innovacion'],   // martes (IA)
  3: ['tendencias', 'casos'],    // miércoles
  4: ['secretos', 'psicologia'], // jueves
  5: ['metodo', 'innovacion'],   // viernes (Marketing)
}
