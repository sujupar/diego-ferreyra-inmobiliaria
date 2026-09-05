/**
 * Quién puede DIFUNDIR una propiedad: la landing, los portales y la campaña.
 *
 * POR QUÉ EXISTE: la regla estaba copiada a mano en más de veinte archivos —
 * cada ruta de landing, de MercadoLibre, de Argenprop y de Meta tenía su propia
 * versión de "si sos asesor, solo las tuyas". Cambiar la política significaba
 * editar veinte archivos y confiar en no olvidarse ninguno. Cuando el dueño
 * pidió que los asesores pudieran difundir CUALQUIER propiedad, eso dejó de ser
 * una molestia y pasó a ser el problema.
 *
 * Acá la política vive en UNA tabla. Cambiarla es cambiar una celda.
 *
 * ## Por qué NO se tocó `lib/auth/entity-access.ts`
 *
 * Esa función (`canAccessProperty`) parecía el lugar obvio, y ensancharla era
 * una línea. Pero guarda otra cosa: el `PUT /api/properties/[id]`, que acepta el
 * cuerpo entero sin lista blanca de columnas. Abrirla habría permitido que un
 * asesor mandara `{ "assigned_to": "<su propio id>" }` y se REASIGNARA la
 * propiedad de otro — y con ella los leads, la bandeja de WhatsApp y el permiso
 * de escribirle a los clientes ajenos. Nada de eso se pidió.
 *
 * Por eso lo que se abre es una CAPACIDAD con nombre ("difundir"), no un
 * alcance global. Editar la ficha, el precio, el estado comercial y el circuito
 * legal siguen exactamente como estaban.
 *
 * ## Listas blancas explícitas, nunca negaciones
 *
 * Cada capacidad enumera los roles que la tienen. Un rol que no figura no
 * alcanza nada. Esto NO es estilo: el proyecto ya se quemó con
 * `if (role !== 'asesor') return true`, que le daba acceso al abogado a
 * borrar tasaciones sin que nadie lo hubiera decidido. Una lista blanca falla
 * cerrada ante un rol nuevo; una negación falla abierta.
 */

/** Las tres cosas distintas que se pueden querer hacer con la difusión. */
export type CapacidadDifusion =
  /** Mirar el estado: avisos publicados, métricas, estado de la campaña. */
  | 'ver_difusion'
  /** Crear y publicar: landing, avisos en portales, lanzar la campaña. */
  | 'difundir'
  /** Encender y apagar el gasto: pausar y reactivar una campaña. */
  | 'gestionar_campana'

/** Sobre qué propiedades alcanza una capacidad. */
export type AlcanceDifusion = 'todas' | 'propias' | 'ninguna'

/**
 * LA TABLA DE POLÍTICA. Es lo único que hay que editar para cambiar quién puede
 * qué.
 *
 * El abogado está en `ver_difusion` porque hoy ya entra a la ficha y ve el
 * estado; lo que nunca tuvo —ni gana acá— es publicar o gastar. Está fuera de
 * las otras dos a propósito.
 *
 * `agent` y `viewer` son roles heredados del esquema original que siguen
 * declarados en `types/auth.types.ts`. No figuran en ninguna lista: no alcanzan
 * nada, que es el comportamiento que ya tenían.
 */
const POLITICA: Record<CapacidadDifusion, Partial<Record<string, AlcanceDifusion>>> = {
  ver_difusion: {
    admin: 'todas',
    dueno: 'todas',
    coordinador: 'todas',
    asesor: 'todas',
    abogado: 'todas',
  },
  difundir: {
    admin: 'todas',
    dueno: 'todas',
    coordinador: 'todas',
    // DECISIÓN DEL DUEÑO (5 de septiembre de 2026): el asesor difunde CUALQUIER
    // propiedad, no solo las asignadas. Antes decía 'propias' y era la causa del
    // "forbidden" al crear una landing de una ficha ajena.
    //
    // Volver atrás es cambiar esta palabra por 'propias'. La rama que compara
    // `assigned_to` sigue existiendo y testeada justamente para eso.
    asesor: 'todas',
  },
  gestionar_campana: {
    admin: 'todas',
    dueno: 'todas',
    coordinador: 'todas',
    // DECISIÓN DEL DUEÑO (5 de septiembre de 2026): el asesor maneja la campaña
    // de punta a punta. Antes pausar y reactivar era solo del manager.
    asesor: 'todas',
  },
}

/**
 * Sobre qué propiedades puede este rol ejercer esta capacidad.
 *
 * Puro: sin base de datos y sin `process.env`, así que lo pueden importar tanto
 * las rutas del servidor como los componentes del navegador — que es lo que
 * evita que la pantalla y el servidor terminen opinando distinto.
 */
export function alcanceDifusion(
  capacidad: CapacidadDifusion,
  role: string | null | undefined,
): AlcanceDifusion {
  if (!role) return 'ninguna'
  return POLITICA[capacidad]?.[role] ?? 'ninguna'
}

/**
 * Atajo para la interfaz: ¿tiene sentido mostrarle el botón a este rol?
 *
 * Devuelve `true` también cuando el alcance es `'propias'`, porque la pantalla
 * no siempre sabe de quién es la propiedad. El permiso REAL lo decide siempre el
 * servidor; esto solo evita ofrecer botones a quien no puede usarlos nunca.
 */
export function puedeVerBotonDifusion(
  capacidad: CapacidadDifusion,
  role: string | null | undefined,
): boolean {
  return alcanceDifusion(capacidad, role) !== 'ninguna'
}
