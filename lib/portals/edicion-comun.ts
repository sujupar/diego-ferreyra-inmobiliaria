/**
 * Reglas compartidas por la edición de avisos publicados (ML y Argenprop).
 * Puro: sin red ni base. La regla madre del diseño es "leer el aviso vivo,
 * aplicar SOLO lo que la persona cambió, enviar completo": acá vive la parte
 * de "qué cambió", que alimenta el contador de la pantalla y lo que se envía.
 */
export type Valor = { value_name?: string; value_id?: string }
export type Valores = Record<string, Valor>
/** `null` = la persona vació el dato. */
export type CambiosDeValores = Record<string, Valor | null>
export interface CambiosDeAviso { titulo?: string; descripcion?: string; valores: CambiosDeValores }

// NFC primero: macOS entrega la "í" descompuesta y sin esto "Sí" ≠ "Sí".
const plano = (s: string) => s.normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const vacio = (v: Valor | undefined | null) => !v || (!v.value_id && !(v.value_name ?? '').trim())

export function mismoValor(a: Valor | undefined, b: Valor | undefined, normalizar: (v: string) => string = s => s): boolean {
  if (vacio(a) && vacio(b)) return true
  if (vacio(a) || vacio(b)) return false
  const aValue = a as Valor
  const bValue = b as Valor
  if (aValue.value_id && bValue.value_id) return aValue.value_id === bValue.value_id
  const na = aValue.value_name ?? '', nb = bValue.value_name ?? ''
  return plano(normalizar(na)) === plano(normalizar(nb))
}

export function diferencias(
  inicial: Valores,
  actual: Valores,
  normalizar: (id: string, v: string) => string = (_id, v) => v,
): CambiosDeValores {
  const out: CambiosDeValores = {}
  for (const id of new Set([...Object.keys(inicial), ...Object.keys(actual)])) {
    const a = inicial[id], b = actual[id]
    if (mismoValor(a, b, v => normalizar(id, v))) continue
    out[id] = vacio(b) ? null : { ...b }
  }
  return out
}

export function sugeridosPara(delPortal: Valores, conocidos: Valores, idsAceptados: ReadonlySet<string>): Valores {
  const out: Valores = {}
  for (const [id, v] of Object.entries(conocidos)) {
    if (!idsAceptados.has(id) || vacio(v) || !vacio(delPortal[id])) continue
    out[id] = { ...v }
  }
  return out
}

export function aplicarCambios(base: Valores, cambios: CambiosDeValores): Valores {
  const out: Valores = { ...base }
  for (const [id, v] of Object.entries(cambios)) {
    if (v === null) delete out[id]
    else out[id] = { ...v }
  }
  return out
}
