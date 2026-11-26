/**
 * Lista de Meta "DF · EXCLUIR Pidieron tasación": quién entra y cuándo se puede reemplazar.
 *
 * Módulo puro (sin red ni base). Lo usa la ruta `app/api/cron/meta-exclusion-sync`, que la
 * reemplaza entera todos los días para que quien ya pidió tasación deje de ver los anuncios de
 * "pedí tu tasación" (antes la lista se subía a mano y quedaba congelada).
 *
 * El formato de cada fila (email en minúsculas, teléfono 549 + 10 dígitos, ambos SHA-256) es
 * EXACTAMENTE el de la carga manual del 2026-11-25: si cambia, Meta deja de reconocer a las
 * personas que ya estaban y el reemplazo las saca de la lista.
 */
import { createHash } from 'node:crypto'

/** Público de Meta que se reemplaza (cuenta act_853173985153585). */
export const PUBLICO_EXCLUIR_PIDIERON_TASACION = '120248925449950656'

/** Etapa con que se anota cada corrida en `funnel_meta_sync_log`. */
export const ETAPA_LOG = 'excluir_pidieron_tasacion'

/** Esquema de columnas que se manda a Meta; el orden tiene que coincidir con `filaParaMeta`. */
export const ESQUEMA_META = ['EMAIL', 'PHONE'] as const

/** Etapas que significan "ya tuvo (o tiene coordinada) una tasación", de cualquier origen. */
export const ETAPAS_CON_TASACION = ['scheduled', 'not_visited', 'visited', 'appraisal_sent', 'followup', 'captured'] as const

/** Por debajo de esta fracción de la corrida anterior no se reemplaza: una consulta rota no vacía la exclusión. */
export const FRACCION_MINIMA = 0.8

export interface ContactoDeProceso {
  fullName: string | null
  email: string | null
  /** `contacts.phone_norm`: últimos 10 dígitos del teléfono. */
  phoneNorm: string | null
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const TELEFONO_10 = /^\d{10}$/

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

function sinTildes(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Contactos de prueba que no son clientes: Julián, `[TEST`, y las cuentas @passmail.com del dueño. */
export function esContactoDePrueba(c: ContactoDeProceso): boolean {
  const nombre = sinTildes(c.fullName ?? '')
  const email = (c.email ?? '').toLowerCase()
  return (
    nombre.includes('julian parra') ||
    nombre.includes('[test') ||
    email.includes('julianparra') ||
    email.endsWith('@passmail.com')
  )
}

/** Fila cifrada `[EMAIL, PHONE]` para Meta, o null si el contacto no tiene ningún dato usable. */
export function filaParaMeta(c: ContactoDeProceso): [string, string] | null {
  const email = (c.email ?? '').trim().toLowerCase()
  const tel = (c.phoneNorm ?? '').trim()
  const emailCifrado = EMAIL_VALIDO.test(email) ? sha256(email) : ''
  const telCifrado = TELEFONO_10.test(tel) ? sha256('549' + tel) : ''
  if (!emailCifrado && !telCifrado) return null
  return [emailCifrado, telCifrado]
}

/** Lista final: sin pruebas, sin contactos vacíos y sin filas repetidas (una persona con varios procesos). */
export function armarListaDeExclusion(contactos: ContactoDeProceso[]): [string, string][] {
  const vistas = new Set<string>()
  const lista: [string, string][] = []
  for (const c of contactos) {
    if (esContactoDePrueba(c)) continue
    const fila = filaParaMeta(c)
    if (!fila) continue
    const clave = fila.join('|')
    if (vistas.has(clave)) continue
    vistas.add(clave)
    lista.push(fila)
  }
  return lista
}

export type DecisionReemplazo = { reemplazar: true } | { reemplazar: false; motivo: string }

/**
 * Freno: con 0 personas o con menos del 80 % de las que mandó la corrida anterior NO se reemplaza.
 * La lista solo crece en la práctica (nadie deja de haber pedido tasación); una caída brusca casi
 * seguro es una consulta rota, y reemplazar con ella volvería a mostrarle los anuncios a cientos.
 */
export function decidirReemplazo(cantidad: number, anterior: number | null): DecisionReemplazo {
  if (cantidad <= 0) return { reemplazar: false, motivo: 'La lista calculada tiene 0 personas.' }
  if (anterior !== null && anterior > 0 && cantidad < anterior * FRACCION_MINIMA) {
    return {
      reemplazar: false,
      motivo: `La lista calculada tiene ${cantidad} personas y la corrida anterior mandó ${anterior}: cae más del ${Math.round((1 - FRACCION_MINIMA) * 100)} %.`,
    }
  }
  return { reemplazar: true }
}
