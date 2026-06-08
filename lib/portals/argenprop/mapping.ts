import type { Property } from '../types'
import type { ApCredentials } from '../credentials'
import { apTipoPropiedad } from './field-schema'
import type { AttributeOverride } from './field-schema'

export interface ApFormOptions {
  creds: ApCredentials
  idOrigen: string
  /** 'Activo' (default) | 'Baja' | 'Suspendido' | 'Reservado'. */
  estado?: string
  /** Overrides del wizard (claves = ApField.id). */
  attributeOverrides?: Record<string, AttributeOverride>
}

type FormValue = string | number | boolean | null | undefined | FormObject | FormArray
interface FormObject { [k: string]: FormValue }
type FormArray = FormValue[]

/**
 * Aplana un objeto anidado a un Record<string,string> con la convención de
 * PublicarIntranet: objetos → claves con punto (`aviso.Precio`), arrays → claves
 * indexadas (`imagenes[0].url`). Omite null/undefined. Todo se stringifica.
 */
export function flattenForm(obj: FormObject, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    const key = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const idxKey = `${key}[${i}]`
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          Object.assign(out, flattenForm(item as FormObject, idxKey))
        } else if (item !== null && item !== undefined) {
          out[idxKey] = String(item)
        }
      })
    } else if (typeof v === 'object') {
      Object.assign(out, flattenForm(v as FormObject, key))
    } else {
      out[key] = String(v)
    }
  }
  return out
}

function ov(overrides: Record<string, AttributeOverride> | undefined, id: string): string | undefined {
  const o = overrides?.[id]
  if (!o) return undefined
  return o.value_id ?? o.value_name
}

function buildTitle(property: Property): string {
  if (property.title) return property.title
  return `${property.property_type || 'Propiedad'} en ${property.neighborhood}`
}

/**
 * Construye el body form-urlencoded (aplanado) para PublicarIntranet.
 * CONTRACT ASSUMPTION: nombres de campos `aviso.*`/`propiedad.*` del spec v4.0.
 * El probe (Fase 4/5) corrige los nombres exactos en UN solo lugar (acá).
 */
export function propertyToApForm(property: Property, opts: ApFormOptions): Record<string, string> {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToApForm: lat/lng requeridos (corré validate antes)')
  }
  const { creds, idOrigen, estado = 'Activo', attributeOverrides: o } = opts

  const tree: FormObject = {
    // Auth (per-request, en el body)
    usr: creds.usr,
    psd: creds.psd,
    // Tipo de propiedad (top-level según spec)
    tipoPropiedad: apTipoPropiedad(property),
    aviso: {
      IdOrigen: idOrigen, // clave de idempotencia que generamos nosotros
      Estado: estado,
      TipoOperacion: ov(o, 'TIPO_OPERACION') ?? property.operation_type ?? 'venta',
      Titulo: buildTitle(property),
      Descripcion: property.description || buildTitle(property),
      Precio: property.asking_price,
      Moneda: ov(o, 'MONEDA') ?? property.currency ?? 'USD',
      Vendedor: {
        SistemaOrigen: { Id: creds.idSistema }, // IdSistema
        IdOrigen: creds.idVendedor,             // IdVendedor
        OrigenCuenta: creds.idOrigen,           // ARGENPROP_ID_ORIGEN (60U6_) — CONTRACT ASSUMPTION
      },
    },
    propiedad: {
      Ambientes: ov(o, 'AMBIENTES') ?? property.rooms ?? undefined,
      Dormitorios: ov(o, 'DORMITORIOS') ?? property.bedrooms ?? undefined,
      Banos: ov(o, 'BANOS') ?? property.bathrooms ?? undefined,
      Cocheras: ov(o, 'COCHERAS') ?? property.garages ?? undefined,
      SuperficieCubierta: ov(o, 'SUP_CUBIERTA') ?? property.covered_area ?? undefined,
      SuperficieTotal: ov(o, 'SUP_TOTAL') ?? property.total_area ?? undefined,
      Antiguedad: ov(o, 'ANTIGUEDAD') ?? (property.age != null ? property.age : undefined),
      Expensas: ov(o, 'EXPENSAS') ?? property.expensas ?? undefined,
      Orientacion: ov(o, 'ORIENTACION') ?? undefined,
      Disposicion: ov(o, 'DISPOSICION') ?? undefined,
      Direccion: property.address,
      Localidad: property.neighborhood,
      Ciudad: property.city || 'CABA',
      Latitud: property.latitude,
      Longitud: property.longitude,
      CodigoPostal: property.postal_code ?? undefined,
    },
    // Fotos por URL (Argenprop las descarga). CONTRACT ASSUMPTION: `imagenes[i].url`.
    imagenes: (property.photos ?? []).slice(0, 20).map((url, i) => ({ url, orden: i, principal: i === 0 })),
  }

  return flattenForm(tree)
}
