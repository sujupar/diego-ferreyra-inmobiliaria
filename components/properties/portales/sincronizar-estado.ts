// Lógica pura del cuadro "¿Actualizamos los avisos?" y de la franja de la ficha:
// qué filas se muestran, qué texto lleva cada una y cómo se lee la respuesta del
// servidor. Sin React ni red, para poder probarla.
import type { Diferencia, DiferenciasPortal, CampoSincronizable, PortalSincronizable } from '@/lib/portals/diferencias-con-ficha'

export type FilaPortal =
  | { tipo: 'diferencias'; portal: PortalSincronizable; diferencias: Diferencia[]; accion: DiferenciasPortal['accion']; externalUrl: string | null }
  | { tipo: 'error'; portal: PortalSincronizable; error: string }

export const NOMBRE_PORTAL: Record<PortalSincronizable, string> = {
  mercadolibre: 'MercadoLibre',
  argenprop: 'Argenprop',
}

const ETIQUETA_CAMPO: Record<CampoSincronizable, string> = {
  tipo: 'Tipo',
  operacion: 'Operación',
  precio: 'Precio',
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const esPortal = (v: unknown): v is PortalSincronizable => v === 'mercadolibre' || v === 'argenprop'
const esCampo = (v: unknown): v is CampoSincronizable => v === 'tipo' || v === 'operacion' || v === 'precio'
const esAccion = (v: unknown): v is DiferenciasPortal['accion'] => v === 'actualizar' || v === 'republicar' || v === 'nada'

function esDiferencia(v: unknown): v is Diferencia {
  return esObjeto(v) && esCampo(v.campo) && typeof v.antes === 'string' && typeof v.despues === 'string'
}

/** Lee `{ portales: [...] }` del GET de diferencias; ignora lo que no tiene la forma esperada. */
export function parsearFilas(json: unknown): FilaPortal[] {
  if (!esObjeto(json) || !Array.isArray(json.portales)) return []
  const filas: FilaPortal[] = []
  for (const p of json.portales as unknown[]) {
    if (!esObjeto(p) || !esPortal(p.portal)) continue
    if (typeof p.error === 'string') {
      filas.push({ tipo: 'error', portal: p.portal, error: p.error })
      continue
    }
    if (!Array.isArray(p.diferencias) || !esAccion(p.accion)) continue
    filas.push({
      tipo: 'diferencias',
      portal: p.portal,
      diferencias: (p.diferencias as unknown[]).filter(esDiferencia),
      accion: p.accion,
      externalUrl: typeof p.externalUrl === 'string' ? p.externalUrl : null,
    })
  }
  return filas
}

/** Las filas que merecen aparecer: con algo para cambiar, o con un error que explicar. */
export function filasAMostrar(filas: readonly FilaPortal[]): FilaPortal[] {
  return filas.filter(f => f.tipo === 'error' || (f.accion !== 'nada' && f.diferencias.length > 0))
}

/** Filas que se pueden tildar y mandar. */
export function esAccionable(f: FilaPortal): f is Extract<FilaPortal, { tipo: 'diferencias' }> {
  return f.tipo === 'diferencias' && f.accion !== 'nada' && f.diferencias.length > 0
}

export function lineaDiferencia(d: Diferencia): string {
  return `${ETIQUETA_CAMPO[d.campo]}: ${d.antes} → ${d.despues}`
}

/** Qué le va a pasar al aviso, en simple. */
export function textoAccion(f: Extract<FilaPortal, { tipo: 'diferencias' }>): string {
  if (f.accion === 'republicar') {
    const tipo = f.diferencias.find(d => d.campo === 'tipo')?.despues ?? 'el tipo nuevo'
    return `Argenprop no deja cambiar el tipo de un aviso: lo vamos a eliminar y volver a publicar como ${tipo} con las mismas fotos y datos. El aviso cambia de número (el link viejo deja de andar).`
  }
  if (f.diferencias.every(d => d.campo === 'precio')) return 'Se actualiza el precio del aviso.'
  return f.portal === 'mercadolibre' ? 'Se actualiza el mismo aviso.' : 'Se actualiza el aviso.'
}

/** Una línea por portal con diferencias: la primera. */
export function lineasFranja(filas: readonly FilaPortal[]): { portal: PortalSincronizable; texto: string }[] {
  const out: { portal: PortalSincronizable; texto: string }[] = []
  for (const f of filas) {
    if (!esAccionable(f)) continue
    const d = f.diferencias[0]
    const campo = d.campo === 'precio' ? 'el precio' : d.campo === 'tipo' ? 'el tipo' : 'la operación'
    out.push({
      portal: f.portal,
      texto: d.campo === 'precio'
        ? `El aviso de ${NOMBRE_PORTAL[f.portal]} figura a ${d.antes} y la ficha dice ${d.despues}`
        : `El aviso de ${NOMBRE_PORTAL[f.portal]} figura como ${d.antes} y la ficha dice ${d.despues} (${campo})`,
    })
  }
  return out
}

export type RespuestaSincronizar =
  | { tipo: 'ok'; externalUrl: string | null; mensaje: string | null }
  | { tipo: 'planB'; mensaje: string }
  | { tipo: 'error'; mensaje: string }

/** Interpreta la respuesta del POST sincronizar (ya leída como JSON tolerante). */
export function interpretarRespuesta(status: number, cuerpo: unknown): RespuestaSincronizar {
  const c = esObjeto(cuerpo) ? cuerpo : {}
  const error = typeof c.error === 'string' && c.error ? c.error : `No se pudo actualizar (error ${status}).`
  if (status >= 200 && status < 300 && c.ok === true) {
    return {
      tipo: 'ok',
      externalUrl: typeof c.externalUrl === 'string' ? c.externalUrl : null,
      mensaje: typeof c.mensaje === 'string' ? c.mensaje : null,
    }
  }
  if (status === 409 && c.planBDisponible === true) return { tipo: 'planB', mensaje: error }
  return { tipo: 'error', mensaje: error }
}

/** Lee JSON sin explotar si el servidor devolvió HTML (504 de Netlify). */
export function leerCuerpo(status: number, texto: string): unknown {
  try { return JSON.parse(texto) } catch {
    return { error: status === 504 ? 'El portal tardó demasiado. Probá de nuevo.' : `Error ${status}` }
  }
}

/** M3: el cuadro posterior al guardado solo se abre si hay algo para actualizar (un error solo no alcanza). */
export function debeAbrirTrasGuardar(filas: readonly FilaPortal[]): boolean {
  return filas.some(esAccionable)
}

/** M2: qué portales se pueden (re)mandar: los que no están listos ni en curso. */
export function puedeMandarse(estado: 'idle' | 'enviando' | 'listo' | 'error' | 'planB'): boolean {
  return estado === 'idle' || estado === 'error'
}
