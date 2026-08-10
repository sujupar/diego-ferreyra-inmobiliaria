/**
 * Quién alcanza las TASACIONES, por rol. Módulo puro (sin Supabase, sin
 * `process.env`) para que lo puedan importar las dos orillas: las rutas de
 * `/api/appraisals` y la pantalla de Historial, que es un componente de
 * cliente.
 *
 * POR QUÉ EXISTE (D1, crítico): `canAccessAppraisal` arrancaba con
 * `if (user.profile.role !== 'asesor') return true`. Esa forma —"todos menos
 * el asesor"— no enumera a nadie: cualquier rol que no sea `asesor` pasa,
 * incluso los que no tienen NINGÚN permiso de tasación. El `abogado` se colaba
 * ahí y podía BORRAR DEFINITIVAMENTE cualquier tasación del sistema (el DELETE
 * usa service role, así que la RLS tampoco lo frenaba), además de leerlas y
 * editarlas. El comentario de esa línea enumeraba "admin/dueno/coordinador",
 * o sea que el autor tenía otra lista en la cabeza que la que el código aplica.
 *
 * Por eso acá la lista es EXPLÍCITA y falla cerrado: un rol que no esté
 * nombrado no alcanza nada. Si mañana aparece un rol nuevo, lo peor que puede
 * pasar es que no vea tasaciones hasta que alguien lo agregue — no que borre
 * las 34 de la inmobiliaria.
 *
 * Los tres alcances:
 *   - `todas`   → admin, dueño, coordinador. Es el mismo trío que ya usaba
 *                 `app/api/appraisals/[id]/contact/route.ts` (`OPS_ROLES`), y
 *                 el que nombra el comentario del DELETE. El coordinador no
 *                 tiene permisos `appraisal.*` en `roles.ts` pero SÍ coordina
 *                 tasaciones (`pipeline.create`/`pipeline.schedule`) y tiene
 *                 Historial en su menú: se conserva a propósito, no por
 *                 descuido.
 *   - `propias` → asesor (y el legacy `agent`, que tiene `appraisal.create`):
 *                 solo las que creó o tiene asignadas.
 *   - `ninguna` → abogado, viewer y cualquier rol futuro. El abogado tiene
 *                 exactamente dos permisos, los dos de propiedades
 *                 (`properties.view_all`, `properties.review`).
 */

/** Alcance de un rol sobre las tasaciones. */
export type AlcanceTasaciones = 'todas' | 'propias' | 'ninguna'

const ALCANCE_TOTAL: readonly string[] = ['admin', 'dueno', 'coordinador']
const ALCANCE_PROPIAS: readonly string[] = ['asesor', 'agent']

/**
 * Qué tasaciones alcanza este rol. Acepta `string` (no `Role`) porque del lado
 * del navegador el rol llega como texto suelto desde `/api/auth/me`.
 */
export function alcanceTasaciones(role: string | null | undefined): AlcanceTasaciones {
  if (!role) return 'ninguna'
  if (ALCANCE_TOTAL.includes(role)) return 'todas'
  if (ALCANCE_PROPIAS.includes(role)) return 'propias'
  return 'ninguna'
}

/** ¿Este rol puede ver el Historial de Tasaciones? */
export function puedeVerTasaciones(role: string | null | undefined): boolean {
  return alcanceTasaciones(role) !== 'ninguna'
}

/**
 * ¿Este rol puede BORRAR una tasación (dentro de su alcance)?
 *
 * Hoy coincide con `puedeVerTasaciones`, y está separado a propósito: el
 * borrado es duro (no hay papelera ni `descartada` como en Propiedades) e
 * irreversible, así que si mañana se decide restringirlo —por ejemplo a
 * admin/dueño, como hace `canHardDelete` en Propiedades— se cambia ACÁ y vale
 * a la vez para el servidor y para los botones de la pantalla, sin que las dos
 * capas se desincronicen.
 *
 * No se restringió a admin/dueño ahora porque en Tasaciones el borrado no es
 * una acción "extra": es la ÚNICA forma de sacar una tasación equivocada, y el
 * asesor —que es quien las crea (`appraisal.create`)— perdería la capacidad de
 * limpiar las suyas.
 */
export function puedeBorrarTasacion(role: string | null | undefined): boolean {
  return alcanceTasaciones(role) !== 'ninguna'
}
