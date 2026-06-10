import type { Property } from '../types'
import { apCategoria, derivedPrefill, getApSchema, type ApField, type AttributeOverride } from './field-schema'

/** AvisoPublicacionDto — body de POST/PUT /v1/avisos (sección 6 doc). */
export interface AvisoPublicacionDto {
  IdAnunciante: number
  Titulo: string
  Descripcion: string
  Codigo: string
  AptoCredito?: boolean
  Categoria: { Tipo: string; Subtipo?: string }
  Publicacion: { Visible: boolean }
  Precio: { Monto: number; Moneda: string; Operacion: string; Mostrar: boolean }
  Caracteristicas: { Id: string; Valor: string | number | boolean }[]
  Multimedia: { Tipo: string; Url: string }[]
  Localizacion: {
    Calle?: { Nombre: string; Numero: string }
    Latitud?: number
    Longitud?: number
    Localidad: { Id: string }
    Barrio?: { Id: string }
  }
}

export interface ApMappingOptions {
  idAnunciante: number
  codigo: string
  /** Id de localidad (LOCALIDAD_2102 para CABA). */
  localidadId: string
  /** Id de barrio (obligatorio en CABA). null si no se pudo resolver. */
  barrioId?: string | null
  /** Overrides del wizard (claves = ApField.id). Pisan el prellenado derivado. */
  attributeOverrides?: Record<string, AttributeOverride>
}

// Campos del schema que NO son Caracteristicas (van a Precio/Categoria).
const SPECIAL_FIELDS = new Set(['TIPO_OPERACION', 'MONEDA', 'SUBTIPO'])

function buildTitulo(property: Property): string {
  if (property.title) return property.title.slice(0, 80)
  const tipo = property.property_type || 'Propiedad'
  const amb = property.rooms ? `${property.rooms} amb` : ''
  return [tipo.charAt(0).toUpperCase() + tipo.slice(1), amb, 'en', property.neighborhood].filter(Boolean).join(' ').slice(0, 80)
}

/** Separa "Av. Cabildo 1234" → { Nombre: "Av. Cabildo", Numero: "1234" }. */
function parseCalle(address: string): { Nombre: string; Numero: string } {
  const m = address.trim().match(/^(.*?)[\s,]+(\d+)\s*$/)
  if (m) return { Nombre: m[1].trim().replace(/,$/, ''), Numero: m[2] }
  return { Nombre: address.trim(), Numero: 'S/N' }
}

export function propertyToAvisoDto(property: Property, opts: ApMappingOptions): AvisoPublicacionDto {
  const { tipo, subtipo: defaultSubtipo } = apCategoria(property)
  const eff: Record<string, AttributeOverride> = { ...derivedPrefill(property), ...(opts.attributeOverrides ?? {}) }

  const operacion = eff.TIPO_OPERACION?.value_id ?? 'VENTA'
  const moneda = eff.MONEDA?.value_id ?? (property.currency || 'USD').toUpperCase()
  const subtipo = eff.SUBTIPO?.value_id ?? defaultSubtipo

  // Caracteristicas: el resto de los campos del schema, tipados según su valueType.
  const fieldById = new Map<string, ApField>()
  const schema = getApSchema(property)
  for (const f of [...schema.required, ...schema.recommended]) fieldById.set(f.id, f)

  const caracteristicas: { Id: string; Valor: string | number | boolean }[] = []
  for (const [id, ov] of Object.entries(eff)) {
    if (SPECIAL_FIELDS.has(id)) continue
    const field = fieldById.get(id)
    const raw = ov.value_id ?? ov.value_name
    if (raw == null || raw === '') continue
    if (field && (field.valueType === 'number' || field.valueType === 'number_unit')) {
      const n = Number(String(raw).replace(/[^\d.-]/g, ''))
      if (!Number.isNaN(n)) caracteristicas.push({ Id: id, Valor: n })
    } else if (field && field.valueType === 'boolean') {
      caracteristicas.push({ Id: id, Valor: /^(s[ií]|true|1)$/i.test(String(raw)) })
    } else {
      caracteristicas.push({ Id: id, Valor: String(raw) })
    }
  }

  const multimedia: { Tipo: string; Url: string }[] = []
  for (const url of (property.photos ?? []).slice(0, 30)) multimedia.push({ Tipo: 'FOTO', Url: url })
  if (property.video_url) multimedia.push({ Tipo: 'VIDEO', Url: property.video_url })
  if (property.tour_3d_url) multimedia.push({ Tipo: 'TOUR', Url: property.tour_3d_url })

  return {
    IdAnunciante: opts.idAnunciante,
    Titulo: buildTitulo(property),
    Descripcion: property.description || buildTitulo(property),
    Codigo: opts.codigo,
    Categoria: { Tipo: tipo, ...(subtipo ? { Subtipo: subtipo } : {}) },
    Publicacion: { Visible: true },
    Precio: { Monto: Math.round(property.asking_price), Moneda: moneda, Operacion: operacion, Mostrar: true },
    Caracteristicas: caracteristicas,
    Multimedia: multimedia,
    Localizacion: {
      Calle: parseCalle(property.address),
      Latitud: property.latitude ?? undefined,
      Longitud: property.longitude ?? undefined,
      Localidad: { Id: opts.localidadId },
      ...(opts.barrioId ? { Barrio: { Id: opts.barrioId } } : {}),
    },
  }
}
