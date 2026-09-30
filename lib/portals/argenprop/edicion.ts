/**
 * Edición de un aviso YA publicado en Argenprop. Puro.
 * PUT /v1/avisos REEMPLAZA el aviso entero: por eso se parte del aviso vivo
 * (GET /v1/avisos/{Codigo}) y se devuelve completo, con solo los cambios
 * aplicados. Mandar la ficha, como hacía el worker, borraba AptoCredito y lo
 * corregido a mano en el portal.
 */
import { mismoValor, type CambiosDeValores, type Valores } from '../edicion-comun'
import type { ApField } from './field-schema'
import { AP_MAX_FOTOS_AVISO } from '../photo-limits'

export interface ApAvisoVivo {
  Codigo: string; IdAviso: number; Titulo: string; Descripcion: string
  AptoCredito?: boolean; AceptaPermuta?: boolean
  Categoria: { Tipo: string; SubTipo?: string }
  Publicacion: { EstadoPublicacion?: string; Visible: boolean }
  Precio: { Monto: number; Moneda: string; Operacion: string; Mostrar: boolean }
  Caracteristicas: { Id: string; Valor: string | number | boolean }[]
  Multimedia: { Tipo: string; Url: string }[]
  Localizacion: { Calle?: { Nombre: string; Numero: string }; Latitud?: number; Longitud?: number; Localidad: { Id: string }; Barrio?: { Id: string } }
  Contacto?: Record<string, unknown>
}
export interface CambiosAp { titulo?: string; descripcion?: string; valores: CambiosDeValores; precio?: number; fotos?: string[] }

const SI_NO = (b: boolean) => ({ value_name: b ? 'Sí' : 'No' })
const esSi = (s: string | undefined) => /^(s[ií]|true|1)$/i.test((s ?? '').normalize('NFC').trim())
// El GET devuelve "Muy_Bueno"/"Contra_Frente"; el catálogo y el PUT usan "MUY_BUENO".
const aId = (s: string) => (/^[A-Za-z_]+$/.test(s) ? s.toUpperCase() : s)

export function normalizarAp(_id: string, v: string): string {
  const n = Number(v.replace(/[^\d.-]/g, ''))
  return /^[\d.,\s]+(ars)?$/i.test(v.trim()) && !Number.isNaN(n) ? String(n) : v
}

export function valoresDesdeAviso(aviso: ApAvisoVivo, schema: readonly ApField[]): Valores {
  const porId = new Map(schema.map(f => [f.id, f]))
  const out: Valores = {
    TIPO_OPERACION: { value_id: aviso.Precio.Operacion },
    MONEDA: { value_id: aviso.Precio.Moneda },
    APTO_CREDITO: SI_NO(!!aviso.AptoCredito),
  }
  if (aviso.Categoria.SubTipo && porId.has('SUBTIPO')) out.SUBTIPO = { value_id: aId(aviso.Categoria.SubTipo) }
  for (const c of aviso.Caracteristicas) {
    const f = porId.get(c.Id)
    if (!f) continue
    if (f.valueType === 'boolean') out[c.Id] = SI_NO(c.Valor === true || esSi(String(c.Valor)))
    else if (f.valueType === 'list') out[c.Id] = { value_id: aId(String(c.Valor)) }
    else out[c.Id] = { value_name: String(c.Valor) } // 80.00 del JSON ya llega como el número 80
  }
  return out
}

function valorParaEnviar(f: ApField | undefined, v: { value_name?: string; value_id?: string }): string | number | boolean {
  const raw = v.value_id ?? v.value_name ?? ''
  if (f?.valueType === 'boolean') return esSi(raw)
  if (f?.valueType === 'number' || f?.valueType === 'number_unit') return Number(String(raw).replace(/[^\d.-]/g, ''))
  return aId(String(raw))
}

export function armarAvisoActualizado(aviso: ApAvisoVivo, cambios: CambiosAp, schema: readonly ApField[], idAnunciante: number) {
  const porId = new Map(schema.map(f => [f.id, f]))
  const actuales = valoresDesdeAviso(aviso, schema)
  const cambiados: string[] = []
  let aptoCredito = !!aviso.AptoCredito
  const caracteristicas = new Map<string, string | number | boolean>(
    aviso.Caracteristicas.map(c => [c.Id, typeof c.Valor === 'string' ? aId(c.Valor) : c.Valor]),
  )
  for (const [id, v] of Object.entries(cambios.valores)) {
    if (['TIPO_OPERACION', 'MONEDA', 'SUBTIPO'].includes(id)) continue // no se editan acá
    if (mismoValor(actuales[id], v ?? undefined, s => normalizarAp(id, s))) continue
    cambiados.push(id)
    if (id === 'APTO_CREDITO') { aptoCredito = v !== null && esSi(v.value_name); continue }
    if (v === null) caracteristicas.delete(id)
    else caracteristicas.set(id, valorParaEnviar(porId.get(id), v))
  }
  let titulo = aviso.Titulo, descripcion = aviso.Descripcion, monto = aviso.Precio.Monto, multimedia = aviso.Multimedia
  if (cambios.titulo !== undefined && cambios.titulo.trim() !== aviso.Titulo.trim()) { titulo = cambios.titulo.trim(); cambiados.push('titulo') }
  if (cambios.descripcion !== undefined && cambios.descripcion !== aviso.Descripcion) { descripcion = cambios.descripcion; cambiados.push('descripcion') }
  if (cambios.precio !== undefined && Math.round(cambios.precio) !== aviso.Precio.Monto) { monto = Math.round(cambios.precio); cambiados.push('precio') }
  if (cambios.fotos !== undefined) {
    // Conserva VIDEO/TOUR; reemplaza solo las FOTO.
    multimedia = [...cambios.fotos.slice(0, AP_MAX_FOTOS_AVISO).map(Url => ({ Tipo: 'FOTO', Url })), ...aviso.Multimedia.filter(m => m.Tipo !== 'FOTO')]
    cambiados.push('fotos')
  }
  const { Localizacion: L } = aviso
  const dto: Record<string, unknown> = {
    IdAnunciante: idAnunciante, Codigo: aviso.Codigo, Titulo: titulo, Descripcion: descripcion,
    AptoCredito: aptoCredito, AceptaPermuta: !!aviso.AceptaPermuta,
    Categoria: { Tipo: aviso.Categoria.Tipo, ...(aviso.Categoria.SubTipo ? { Subtipo: aId(aviso.Categoria.SubTipo) } : {}) },
    Publicacion: { Visible: aviso.Publicacion.Visible },
    Precio: { ...aviso.Precio, Monto: monto },
    Caracteristicas: [...caracteristicas].map(([Id, Valor]) => ({ Id, Valor })),
    Multimedia: multimedia,
    Localizacion: {
      ...(L.Calle ? { Calle: L.Calle } : {}), ...(L.Latitud != null ? { Latitud: L.Latitud } : {}),
      ...(L.Longitud != null ? { Longitud: L.Longitud } : {}), Localidad: { Id: L.Localidad.Id },
      ...(L.Barrio?.Id ? { Barrio: { Id: L.Barrio.Id } } : {}),
    },
    ...(aviso.Contacto ? { Contacto: aviso.Contacto } : {}),
  }
  return { dto, cambiados }
}
