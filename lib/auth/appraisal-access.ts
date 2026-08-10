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
 * Los CUATRO alcances:
 *   - `todas`       → admin, dueño, coordinador. Es el mismo trío que ya usaba
 *                     `app/api/appraisals/[id]/contact/route.ts` (`OPS_ROLES`),
 *                     y el que nombra el comentario del DELETE. El coordinador
 *                     no tiene permisos `appraisal.*` en `roles.ts` pero SÍ
 *                     coordina tasaciones (`pipeline.create`/`pipeline.schedule`)
 *                     y tiene Historial en su menú: se conserva a propósito, no
 *                     por descuido.
 *   - `propias`     → asesor (y el legacy `agent`, que tiene `appraisal.create`):
 *                     solo las que creó o tiene asignadas.
 *   - `vinculadas`  → abogado. Lectura ACOTADA y de solo lectura: únicamente la
 *                     tasación que cuelga de una propiedad que él revisa, y en
 *                     versión resumida (ver `proyeccionDeTasacion`). Sin
 *                     listado, sin menú, sin editar, sin borrar. Ver el bloque
 *                     de abajo.
 *   - `ninguna`     → viewer y cualquier rol futuro.
 *
 * POR QUÉ EXISTE `vinculadas` (decisión del dueño, 2026-08-10): al cerrar D1 el
 * abogado dejó de ver TODAS las tasaciones, que es lo correcto, pero también
 * dejó de ver la de la propiedad que tiene sobre el escritorio para revisar.
 * El alcance nuevo devuelve exactamente eso y nada más. No es un cuarto permiso
 * en `roles.ts`: se apoya en los dos que el abogado YA tiene
 * (`properties.view_all` + `properties.review`), o sea "la tasación viaja con
 * la propiedad". Por eso el chequeo real de vínculo vive en
 * `lib/auth/entity-access.ts` (necesita la base) y acá quedan solo las reglas.
 *
 * REGLA AL AGREGAR UN ALCANCE NUEVO: las capacidades de abajo se enumeran por
 * lista blanca de alcances, NUNCA como `!== 'ninguna'`. Esa forma es la misma
 * que causó D1: un alcance nuevo heredaría de arrastre el listado, la edición y
 * el borrado sin que nadie lo decida.
 */

/** Alcance de un rol sobre las tasaciones. */
export type AlcanceTasaciones = 'todas' | 'propias' | 'vinculadas' | 'ninguna'

const ALCANCE_TOTAL: readonly string[] = ['admin', 'dueno', 'coordinador']
const ALCANCE_PROPIAS: readonly string[] = ['asesor', 'agent']
/**
 * Roles que solo alcanzan la tasación colgada de una propiedad que revisan.
 * Requisito de coherencia (lo verifica el test): todo rol de esta lista tiene
 * que tener `properties.view_all` en `roles.ts`, porque el vínculo se resuelve
 * por "existe una propiedad que apunta a esta tasación" — sin acceso amplio a
 * propiedades, ese chequeo estaría regalando de más.
 */
const ALCANCE_VINCULADAS: readonly string[] = ['abogado']

/**
 * Qué tasaciones alcanza este rol. Acepta `string` (no `Role`) porque del lado
 * del navegador el rol llega como texto suelto desde `/api/auth/me`.
 */
export function alcanceTasaciones(role: string | null | undefined): AlcanceTasaciones {
  if (!role) return 'ninguna'
  if (ALCANCE_TOTAL.includes(role)) return 'todas'
  if (ALCANCE_PROPIAS.includes(role)) return 'propias'
  if (ALCANCE_VINCULADAS.includes(role)) return 'vinculadas'
  return 'ninguna'
}

/**
 * Alcances que dan LISTADO: el Historial (`GET /api/appraisals`) y el ítem del
 * menú lateral. `vinculadas` NO está: el abogado llega a la tasación por la
 * ficha de la propiedad que revisa, nunca por una lista de todas.
 */
const ALCANCES_CON_LISTADO: readonly AlcanceTasaciones[] = ['todas', 'propias']

/** Alcances que ESCRIBEN: crear una tasación y modificar una existente. */
const ALCANCES_CON_ESCRITURA: readonly AlcanceTasaciones[] = ['todas', 'propias']

/** Alcances que BORRAN. */
const ALCANCES_CON_BORRADO: readonly AlcanceTasaciones[] = ['todas', 'propias']

/** ¿Este rol puede ver el Historial de Tasaciones (y su ítem del menú)? */
export function puedeVerTasaciones(role: string | null | undefined): boolean {
  return ALCANCES_CON_LISTADO.includes(alcanceTasaciones(role))
}

/**
 * ¿Este rol puede CREAR o MODIFICAR una tasación (dentro de su alcance)?
 *
 * Guarda el POST del listado y el PUT/PATCH de la ficha. Antes esas tres
 * puertas se conformaban con "el rol alcanza algo" (`!== 'ninguna'`), y con la
 * llegada de `vinculadas` eso habría convertido una lectura acotada en permiso
 * de escritura: el abogado podría reescribir la valuación de la propiedad que
 * está revisando. La pertenencia (¿ESTA tasación es suya?) la sigue resolviendo
 * `canAccessAppraisal`; esto responde lo otro: ¿este rol escribe tasaciones?
 */
export function puedeEditarTasacion(role: string | null | undefined): boolean {
  return ALCANCES_CON_ESCRITURA.includes(alcanceTasaciones(role))
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
  return ALCANCES_CON_BORRADO.includes(alcanceTasaciones(role))
}

/* ---------------------------- qué manda el server -------------------------- */

/**
 * Columnas de `appraisals` de la FICHA RESUMIDA: qué propiedad se tasó, cuándo,
 * y en cuánto se valuó. Es lo que recibe el alcance `vinculadas`.
 *
 * LA LÍNEA: entra el RESULTADO de la valuación, no la ECONOMÍA DE LA OPERACIÓN
 * ni el cliente. Hay una tensión real que conviene dejar escrita: la ficha de
 * propiedad le esconde al abogado el precio y los datos comerciales
 * (`showPrice={!isAbogado}`, la tarjeta "Datos comerciales" y la de estado
 * comercial), y acá le mostramos dos importes. No es un descuido: el dueño
 * pidió que vea "la tasación", y una tasación sin su valuación no es nada. Lo
 * que se sostiene es la otra mitad de esa regla — cuánto deja la operación
 * (comisión, dinero en mano) sigue sin ser asunto suyo.
 *
 * QUÉ QUEDA AFUERA, y por qué:
 *   - `money_in_hand` → lo que le queda al dueño DESPUÉS de la comisión. Es
 *     aritmética de la operación, no valuación de la propiedad; del mismo
 *     material que la comisión que la ficha ya le esconde.
 *   - `contact_id`, `notes` → el cliente y lo que se conversó con él.
 *   - `valuation_result`, `property_features` → la metodología completa
 *     (coeficientes Ross-Heidecke, depreciación, zona de no venta). Es el
 *     know-how de la tasación, no un dato del expediente.
 *   - los comparables (`appraisal_comparables`) → avisos de la competencia
 *     relevados a mano. Inteligencia comercial pura. Del bloque solo sobrevive
 *     `comparable_count`, que dice cuán respaldada está la tasación sin
 *     entregar el relevamiento.
 *   - `property_url`, `property_images`, `property_description` → la ficha del
 *     aviso de origen; la propiedad ya la tiene delante.
 *   - `report_edits` → ajustes de presentación del PDF. Ruido.
 *   - `user_id`, `assigned_to` → a quién pertenece comercialmente.
 *
 * NO es una lista de "campos que la pantalla esconde": es el `select` que
 * ejecuta el servidor. Lo que no está acá no sale de la base.
 */
export const COLUMNAS_TASACION_RESUMIDA =
  'id, property_title, property_location, publication_price, sale_value, currency, comparable_count, created_at'

/** Qué le manda el servidor a este alcance cuando lee UNA tasación. */
export interface ProyeccionTasacion {
  /** Lista de columnas para el `.select()` de Supabase. */
  columnas: string
  /** ¿Viaja también la lista de comparables? */
  comparables: boolean
  /**
   * ¿Es la ficha recortada? Viaja EN LA RESPUESTA de la API, no solo acá,
   * porque la pantalla `/appraisals/[id]` arma el informe (recalcula la
   * valuación, ofrece PDF y edición) con la tasación completa: sin este aviso
   * intentaría dibujarlo con la mitad de los datos y mostraría un informe vacío
   * con botones que van a dar 403.
   */
  resumida: boolean
}

/**
 * La proyección por alcance. Existe como función PURA —y no como un `if` suelto
 * dentro del handler— para que "el abogado recibe menos columnas" sea una
 * afirmación verificable sin levantar la ruta, y para que agregar un alcance
 * obligue a decidir qué ve.
 */
export function proyeccionDeTasacion(alcance: AlcanceTasaciones): ProyeccionTasacion {
  if (alcance === 'vinculadas') {
    return { columnas: COLUMNAS_TASACION_RESUMIDA, comparables: false, resumida: true }
  }
  return { columnas: '*', comparables: true, resumida: false }
}
