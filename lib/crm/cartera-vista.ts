// Qué vista del CRM corresponde a quién y qué procesos abarca (crm-cartera-por-rol,
// design.md D5, D6 y D7). Puro. Lo decide el SERVIDOR: el menú y la pantalla no son la
// barrera, y las rutas leen con service role (la RLS no frena nada).
import type { EtapaCRM } from './etapas'

export type Vista =
  | { tipo: 'coordinacion'; personaId: string }
  | { tipo: 'asesor'; personaId: string }
  | { tipo: 'dueno' }

export type MotivoVista = 'sin_vista' | 'ver_como_prohibido' | 'persona_invalida'

// Lista EXPLÍCITA, que falla cerrado: un rol nuevo, o los viejos `agent`/`viewer`, no
// reciben ningún proceso hasta que alguien decida qué vista les toca.
const VISTA_DE_ROL: Record<string, 'coordinacion' | 'asesor' | 'dueno'> = {
  coordinador: 'coordinacion',
  asesor: 'asesor',
  admin: 'dueno',
  dueno: 'dueno',
}

const PUEDEN_VER_COMO = ['admin', 'dueno']

type Perfil = { id: string; role: string; is_active: boolean | null }

function vistaDe(tipo: 'coordinacion' | 'asesor' | 'dueno', personaId: string): Vista {
  return tipo === 'dueno' ? { tipo } : { tipo, personaId }
}

/**
 * La vista de quien pide, o la de la persona elegida en "Ver como". El orden de los
 * motivos importa: un rol sin vista recibe `sin_vista` aunque mande `verComo` (no se le
 * confirma nada de la otra persona), y un asesor o coordinador recibe
 * `ver_como_prohibido` aunque se pida a sí mismo (la puerta es el rol, no la persona).
 * Solo se puede mirar a un coordinador o asesor ACTIVO: un `is_active` nulo falla cerrado,
 * y un dueño o admin no tiene una vista propia que revisar.
 */
export function vistaPara(
  quien: { id: string; role: string },
  verComo: string | null,
  perfiles: Perfil[],
): { ok: true; vista: Vista; mirando: { id: string; role: string } | null } | { ok: false; motivo: MotivoVista } {
  const propia = VISTA_DE_ROL[quien.role]
  if (!propia) return { ok: false, motivo: 'sin_vista' }
  if (!verComo) return { ok: true, vista: vistaDe(propia, quien.id), mirando: null }
  if (!PUEDEN_VER_COMO.includes(quien.role)) return { ok: false, motivo: 'ver_como_prohibido' }
  const elegido = perfiles.find((p) => p.id === verComo)
  if (!elegido || elegido.is_active !== true) return { ok: false, motivo: 'persona_invalida' }
  const suya = VISTA_DE_ROL[elegido.role]
  if (suya !== 'coordinacion' && suya !== 'asesor') return { ok: false, motivo: 'persona_invalida' }
  return { ok: true, vista: vistaDe(suya, elegido.id), mirando: { id: elegido.id, role: elegido.role } }
}

const ETAPAS_ABIERTAS_COORDINACION: readonly EtapaCRM[] = ['solicitud', 'coordinada', 'no_realizada']

/**
 * La regla de la spec ("Qué procesos ve la coordinación", "Vista del asesor"). La usan las
 * DOS puntas: la consulta a la base filtra lo grueso y esto vuelve a filtrar en el servidor
 * antes de mandar. Si la consulta se ensancha por error, igual no sale nada ajeno.
 * Coordinación: Solicitud, Coordinada y No realizada, más los descartados sin asesor;
 * nunca la clase gratuita, ni por etapa ni por origen (respuesta 3 del dueño).
 */
export function procesoEnVista(
  d: { etapa: EtapaCRM; origin: string | null; assigned_to: string | null },
  v: Vista,
): boolean {
  if (v.tipo === 'dueno') return true
  if (v.tipo === 'asesor') return !!d.assigned_to && d.assigned_to === v.personaId
  if (d.etapa === 'clase_gratuita' || d.origin === 'clase_gratuita') return false
  if (ETAPAS_ABIERTAS_COORDINACION.includes(d.etapa)) return true
  return d.etapa === 'descartado' && !d.assigned_to
}

/**
 * Las personas del selector "Ver como" (D7): coordinadores y asesores ACTIVOS (las mismas
 * que `vistaPara` acepta), por nombre. "asesor" para todos: la plataforma no guarda el
 * género (Diferencias, 1). La usan la lectura de la cartera y la página cuando abre ya
 * mirando a otra persona (la respuesta de esa vista no trae opciones, 5.1).
 */
export function opcionesVerComo(
  perfiles: Map<string, { nombre: string; role: string; activo: boolean }>,
): { id: string; etiqueta: string }[] {
  return [...perfiles.entries()]
    .filter(([, p]) => p.activo && (p.role === 'coordinador' || p.role === 'asesor'))
    .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(([id, p]) => ({ id, etiqueta: `${p.nombre} · ${p.role === 'coordinador' ? 'coordinación' : 'asesor'}` }))
}

/** "Mi vista (dueño)" o "Mi vista (admin)" (Diferencias, 2). */
export function etiquetaMiVista(rol: string): string {
  return `Mi vista (${rol === 'admin' ? 'admin' : 'dueño'})`
}
