// Diferencias entre la ficha de la propiedad y el aviso VIVO en un portal.
// Módulo puro: no habla con ningún portal, solo compara lo que ya se leyó.
// Cubre los tres datos comerciales que la ficha puede cambiar y que el aviso
// no se entera solo: tipo, operación y precio (con su moneda).
import { resolveCategory, todasLasCategorias } from '@/lib/portals/mercadolibre/mapping'
import { apCategoria } from '@/lib/portals/argenprop/field-schema'
import { PROPERTY_TYPE_LABELS, isPropertyType } from '@/lib/properties/property-type'
import { formatMoney } from '@/lib/properties/detail-view'

export type PortalSincronizable = 'mercadolibre' | 'argenprop'
export type CampoSincronizable = 'tipo' | 'operacion' | 'precio'

export interface FichaComercial {
  property_type: string | null
  operation_type: string | null
  asking_price: number
  currency: string | null
}
/** `currency_id: null` = ML no la informó: el precio se compara solo por monto. */
export interface EstadoMl { category_id: string; price: number; currency_id: string | null }
export interface EstadoAp { tipo: string; subtipo?: string | null; operacion: string; monto: number; moneda: string }

/** `antes`/`despues` son textos legibles para mostrar al asesor ("Departamento", "USD 79.000"). */
export interface Diferencia { campo: CampoSincronizable; antes: string; despues: string }
export interface DiferenciasPortal {
  portal: PortalSincronizable
  diferencias: Diferencia[]
  accion: 'actualizar' | 'republicar' | 'nada'
}

type Operacion = 'venta' | 'alquiler' | 'temporario'

const ETIQUETA_OPERACION: Record<Operacion, string> = {
  venta: 'Venta',
  alquiler: 'Alquiler',
  temporario: 'Alquiler temporario',
}

// Misma normalización que usa resolveCategory (no se exporta de allá): la
// operación se escribe de varias formas en el sistema.
function normalizarOperacion(raw: string | null | undefined): Operacion | string {
  const s = (raw || 'venta').trim().toLowerCase().replace(/[\s_-]+/g, ' ')
  if (s === 'alquiler temporario' || s === 'temporal' || s === 'temporaria') return 'temporario'
  return s
}

function etiquetaOperacion(op: string): string {
  return op === 'venta' || op === 'alquiler' || op === 'temporario' ? ETIQUETA_OPERACION[op] : op
}

function tipoDeFicha(ficha: FichaComercial): string {
  return (ficha.property_type || 'departamento').trim().toLowerCase()
}

function etiquetaTipo(tipo: string): string {
  const t = tipo.trim().toLowerCase()
  if (isPropertyType(t)) return PROPERTY_TYPE_LABELS[t]
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

/** "USD 79.000" / "ARS 75.000" — formatMoney trae el símbolo ("US$", "$") y un espacio duro. */
function etiquetaPrecio(monto: number, moneda: string): string {
  const codigo = moneda === 'ARS' ? 'ARS' : 'USD'
  return formatMoney(monto, codigo).replace(/^US\$|^\$/, codigo).replace(/\s/g, ' ')
}

const normalizarMoneda = (m: string | null | undefined) => (m ?? '').trim().toUpperCase()

/**
 * `moneda` vacía o null = desconocida (ML a veces no manda currency_id): sin
 * saberla no se puede afirmar que "cambió la moneda", así que solo cuenta el monto.
 */
function diferenciaPrecio(ficha: FichaComercial, monto: number, moneda: string | null): Diferencia | null {
  const monedaFicha = normalizarMoneda(ficha.currency) || 'USD'
  const monedaAviso = normalizarMoneda(moneda)
  const mismaMoneda = monedaAviso === '' || monedaAviso === monedaFicha
  if (Math.round(ficha.asking_price) === Math.round(monto) && mismaMoneda) return null
  return {
    campo: 'precio',
    antes: etiquetaPrecio(monto, monedaAviso || monedaFicha),
    despues: etiquetaPrecio(ficha.asking_price, monedaFicha),
  }
}

export function diferenciasMl(ficha: FichaComercial, aviso: EstadoMl): DiferenciasPortal {
  const diferencias: Diferencia[] = []
  const tipoFicha = tipoDeFicha(ficha)
  const opFicha = normalizarOperacion(ficha.operation_type)

  if (resolveCategory({ property_type: tipoFicha, operation_type: opFicha }) !== aviso.category_id) {
    // Una misma categoría puede servir a varios tipos (temporario de
    // terreno/local/oficina): si alguna coincide con la ficha, ese dato no cambió.
    const vivas = todasLasCategorias().filter(c => c.categoria === aviso.category_id)
    if (vivas.length === 0) {
      diferencias.push({ campo: 'tipo', antes: 'Otra categoría', despues: etiquetaTipo(tipoFicha) })
    } else {
      if (!vivas.some(c => c.tipo === tipoFicha)) {
        diferencias.push({ campo: 'tipo', antes: etiquetaTipo(vivas[0].tipo), despues: etiquetaTipo(tipoFicha) })
      }
      if (!vivas.some(c => c.operacion === opFicha)) {
        diferencias.push({ campo: 'operacion', antes: etiquetaOperacion(vivas[0].operacion), despues: etiquetaOperacion(opFicha) })
      }
    }
  }

  const precio = diferenciaPrecio(ficha, aviso.price, aviso.currency_id)
  if (precio) diferencias.push(precio)

  // El cambio de categoría también se hace en el lugar (PUT del item).
  return { portal: 'mercadolibre', diferencias, accion: diferencias.length ? 'actualizar' : 'nada' }
}

const OPERACION_AP: Record<string, Operacion> = {
  VENTA: 'venta',
  ALQUILER: 'alquiler',
  ALQUILER_TEMPORAL: 'temporario',
}

export function diferenciasAp(ficha: FichaComercial, aviso: EstadoAp): DiferenciasPortal {
  const diferencias: Diferencia[] = []
  const cat = apCategoria({ property_type: tipoDeFicha(ficha) })
  const tipoVivo = aviso.tipo.trim().toUpperCase()
  const subtipoVivo = (aviso.subtipo ?? '').trim().toUpperCase()
  const subtipoFicha = (cat.subtipo ?? '').toUpperCase()

  // PH es Departamento + subtipo PH: ese subtipo lo define la ficha, así que
  // comparte la decisión de tipo. Los demás subtipos (dúplex, loft…) los elige
  // el asesor en el wizard y no se derivan de la ficha: no cuentan.
  const cambiaPh = (subtipoFicha === 'PH') !== (subtipoVivo === 'PH')
  if (cat.tipo.toUpperCase() !== tipoVivo || cambiaPh) {
    const antes = subtipoVivo === 'PH' && tipoVivo === 'DEPARTAMENTO' ? 'PH' : etiquetaTipo(tipoVivo)
    diferencias.push({ campo: 'tipo', antes, despues: etiquetaTipo(tipoDeFicha(ficha)) })
  }
  const republicar = diferencias.length > 0

  const opVivo = OPERACION_AP[aviso.operacion.trim().toUpperCase()]
  const opFicha = normalizarOperacion(ficha.operation_type)
  if (opVivo !== opFicha) {
    diferencias.push({
      campo: 'operacion',
      antes: opVivo ? etiquetaOperacion(opVivo) : aviso.operacion,
      despues: etiquetaOperacion(opFicha),
    })
  }

  const precio = diferenciaPrecio(ficha, aviso.monto, aviso.moneda)
  if (precio) diferencias.push(precio)

  const accion = diferencias.length === 0 ? 'nada' : republicar ? 'republicar' : 'actualizar'
  return { portal: 'argenprop', diferencias, accion }
}
