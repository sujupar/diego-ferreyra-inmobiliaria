/**
 * La Bandeja con los filtros puestos, calculada EN LA PANTALLA sobre el período
 * que ya viajó (spec Entrega 2 §3.1). Por qué en la pantalla: cada pedido a la
 * plataforma cuesta ~1 s de piso; con el período en memoria, filtrar, buscar y
 * "Ver más" responden al instante.
 *
 * Las reglas de conteo son las de la Entrega 1 y viven en ./bandeja.ts:
 *  - cada selector (portal, propiedad) se cuenta SIN su propio filtro, para que
 *    al elegir ZonaProp el selector siga diciendo cuántas hay de Argenprop;
 *  - las tarjetas se cuentan ANTES del filtro de estado y de teléfono.
 * Módulo puro y seguro para el navegador.
 */
import { armarBandeja, contarPorPortal, contarPorPropiedad } from './bandeja'
import type { FiltrosConsultas } from './filtros'
import type { ConsultaEnBandeja, VistaBandeja } from './tipos'

export type FiltrosVista = Pick<FiltrosConsultas, 'portal' | 'propiedad' | 'asesor' | 'estado' | 'telefonoRevisar' | 'q'>

export const SIN_FILTROS: FiltrosVista = {
  portal: null, propiedad: null, asesor: null, estado: null, telefonoRevisar: false, q: '',
}

/** Minúsculas y sin tildes, venga la tilde compuesta o descompuesta (NFD de macOS). */
function plano(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

const soloDigitos = (t: string) => t.replace(/\D/g, '')

/**
 * Texto donde se busca, armado una vez por consulta (con 3.000 consultas y una
 * búsqueda por tecla, rearmarlo en cada comparación se nota). WeakMap: si la
 * consulta deja de existir, su texto se va con ella.
 */
const textoDe = new WeakMap<ConsultaEnBandeja, { texto: string; digitos: string }>()

function indice(c: ConsultaEnBandeja): { texto: string; digitos: string } {
  let i = textoDe.get(c)
  if (!i) {
    const partes = [c.nombre, c.telefono, c.email, c.aviso_direccion, c.propiedad?.address, c.propiedad?.neighborhood, c.mensaje]
    // El teléfono se guarda también en su forma de WhatsApp: "1161400496" tiene
    // que encontrar a quien lo dejó como "011 15 6140-0496".
    const digitos = [soloDigitos(c.telefono ?? ''), c.tel.ok ? c.tel.whatsapp : ''].join(' ')
    i = { texto: plano(partes.filter((p): p is string => !!p).join(' \n ')), digitos }
    textoDe.set(c, i)
  }
  return i
}

/**
 * Todas las palabras tienen que aparecer, cada una en cualquier campo. Se
 * compara texto contra texto (`includes`), así que `2*D` o un paréntesis son
 * caracteres comunes, no una expresión regular. Una palabra de solo números
 * también se busca en los dígitos del teléfono, escrito como se haya escrito.
 */
export function coincideBusqueda(c: ConsultaEnBandeja, q: string): boolean {
  const palabras = plano(q.normalize('NFC')).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const { texto, digitos } = indice(c)
  return palabras.every((p) => texto.includes(p) || (/^\d+$/.test(p) && digitos.includes(p)))
}

/** El asesor que se muestra: el de la propiedad; el de la consulta solo si la propiedad no tiene. */
function asesorDe(c: ConsultaEnBandeja): string | null {
  return c.asesor_propiedad ?? c.assigned_to
}

/**
 * Portal, propiedad, asesor y búsqueda (NO estado ni teléfono: esos van después,
 * para que las tarjetas no cambien al tocarlas). El filtro de asesor solo vale
 * para quien ve todo: un asesor recibe de por sí únicamente lo suyo.
 */
export function filtrarConsultas(
  consultas: readonly ConsultaEnBandeja[],
  f: FiltrosVista,
  verTodo: boolean,
  ignorar: 'portal' | 'propiedad' | null = null,
): ConsultaEnBandeja[] {
  return consultas.filter((c) => {
    if (ignorar !== 'portal' && f.portal && c.portal !== f.portal) return false
    if (ignorar !== 'propiedad' && f.propiedad) {
      if (f.propiedad === 'sin' ? c.property_id !== null : c.property_id !== f.propiedad) return false
    }
    if (verTodo && f.asesor) {
      const asesor = asesorDe(c)
      if (f.asesor === 'sin' ? asesor !== null : asesor !== f.asesor) return false
    }
    return coincideBusqueda(c, f.q)
  })
}

export function vistaBandeja(
  consultas: readonly ConsultaEnBandeja[],
  f: FiltrosVista,
  opciones: { verTodo: boolean; visibles: number; direccionElegida?: string | null },
): VistaBandeja {
  const base = filtrarConsultas(consultas, f, opciones.verTodo)
  const bandeja = armarBandeja(base, { estado: f.estado, telefonoRevisar: f.telefonoRevisar, visibles: opciones.visibles })
  return {
    ...bandeja,
    porPortal: contarPorPortal(f.portal ? filtrarConsultas(consultas, f, opciones.verTodo, 'portal') : base, f.portal),
    porPropiedad: contarPorPropiedad(
      f.propiedad ? filtrarConsultas(consultas, f, opciones.verTodo, 'propiedad') : base,
      f.propiedad,
      opciones.direccionElegida ?? null,
    ),
  }
}
