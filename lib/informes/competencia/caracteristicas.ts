/**
 * Disposición y estado escritos de muchas formas ("Contrafrente", "CONTRAFRENTE", {value_id:'LATERAL'},
 * "MUY_BUENO", "Muy bueno") llevados a un solo vocabulario, para comparar la nuestra con las candidatas. Puro.
 * Lo que no se reconoce queda en null: mejor no comparar que comparar mal.
 */

export type Disposicion = 'frente' | 'contrafrente' | 'interno' | 'lateral'
export type Estado = 'a estrenar' | 'excelente' | 'muy bueno' | 'bueno' | 'reciclado' | 'regular' | 'a refaccionar'

/** Un valor de portal: texto suelto o el objeto de atributo ({value_id} de Argenprop, {value_name} de ML). */
function comoTexto(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return String(o.value_name ?? o.value_id ?? o.name ?? '')
  }
  return ''
}

const limpiar = (v: unknown) => comoTexto(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_-]+/g, ' ').trim()

export function normalizarDisposicion(v: unknown): Disposicion | null {
  const t = limpiar(v)
  if (/contra ?frente/.test(t)) return 'contrafrente'
  if (/\bfrente\b/.test(t)) return 'frente'
  if (/\binterno\b|\binterior\b/.test(t)) return 'interno'
  if (/\blateral\b/.test(t)) return 'lateral'
  return null
}

export function normalizarEstado(v: unknown): Estado | null {
  const t = limpiar(v)
  if (!t) return null
  if (/estrenar|nuevo\b/.test(t)) return 'a estrenar'
  if (/excelente/.test(t)) return 'excelente'
  if (/muy bueno/.test(t)) return 'muy bueno'
  if (/reciclad/.test(t)) return 'reciclado'
  if (/refaccion|reparar/.test(t)) return 'a refaccionar'
  if (/regular/.test(t)) return 'regular'
  if (/\bbueno\b/.test(t)) return 'bueno'
  return null
}
