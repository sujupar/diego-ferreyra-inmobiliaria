'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { escribirFiltros, leerFiltros } from './url-state'

/**
 * Filtros de pantalla viviendo en la barra de direcciones, con el espejo
 * optimista y la carrera de escritura ya resueltos.
 *
 * Nació inline en `/properties` y se extrajo acá porque lo van a usar cuatro
 * pantallas (Propiedades, Contactos, CRM, Visitas). Las tres piezas son
 * inseparables — cada una tapa el agujero que abre la anterior:
 *
 * 1. **Ref escrito sincrónicamente** en cada escritura. `router.replace` tarda
 *    200-700 ms en commitear la URL (medido en dev, Next 16): dos clicks
 *    seguidos partiendo de `searchParams` (o de `window.location`) pierden el
 *    primero. El ref se escribe en el mismo tick del click, sin depender de
 *    que React, el navegador o Next terminen nada.
 * 2. **Espejo optimista con el valor VALIDADO**, no el crudo. Todo valor que
 *    sobreviva a la escritura pero no a la lectura (una fecha imposible, un
 *    texto que la normalización recorta) dejaría el espejo clavado para
 *    siempre, porque se suelta comparando contra la lectura.
 * 3. **El espejo como bandera de escritura pendiente** (`escribiendo`): la
 *    pantalla lo usa para poner la lista en carga, así los controles nunca
 *    dicen "filtrado" sobre un listado viejo.
 *
 * Y dos reglas de URL: se sobrescriben SOLO las claves propias (los deep links
 * `?utm_source=`, `?id=`, `?tab=` tienen que sobrevivir), y las claves salen
 * ordenadas y sin los valores por defecto (misma selección = misma URL).
 */

/** Qué pasó con un `aplicar`. Ver `ResultadoAplicar`. */
export type EstadoEscritura = 'escrito' | 'sin-cambios' | 'rechazado'

export interface ResultadoAplicar<T> {
  /**
   * - `escrito`: la URL cambió.
   * - `sin-cambios`: el parche no cambia nada porque ya estaba así.
   * - `rechazado`: el parche SÍ traía valores nuevos, pero ninguno sobrevivió a
   *   la validación. Sin este caso el botón "Aplicar" es un botón muerto: el
   *   usuario ve el valor cargado en el control y no pasa absolutamente nada.
   */
  estado: EstadoEscritura
  /**
   * Claves del parche cuyo valor NO sobrevivió a la lectura. Puede haber
   * rechazadas con estado `escrito` (parche a medias: una clave entró y otra
   * no) — la pantalla debería avisar igual.
   */
  rechazadas: (keyof T & string)[]
}

export interface OpcionesFiltrosUrl<T extends Record<string, string>> {
  /**
   * Valores por defecto = "sin filtrar". Definen también CUÁLES son las claves
   * propias de esta pantalla: las demás de la URL no se tocan nunca.
   * Debe ser un objeto literal sin anotar (`interface` no trae el index
   * signature que pide `Record<string, string>` y no compila).
   */
  defectos: T
  /** Lista cerrada por clave. Un valor fuera de la lista cae al defecto. */
  permitidos?: { [K in keyof T]?: readonly string[] }
  /**
   * Validación que `permitidos` no puede expresar (formatos, `trim`, largo
   * máximo). Corre DESPUÉS de `leerFiltros`, tanto al leer la URL como al
   * validar una escritura, así nunca hay dos criterios distintos sobre qué es
   * un valor válido.
   *
   * DEBE ser pura e idempotente (`n(n(x)) === n(x)`): el espejo se suelta
   * comparando el valor escrito contra el leído, y una normalización que
   * cambia en cada pasada nunca converge.
   */
  normalizar?: (filtros: T) => T
}

export interface FiltrosUrl<T extends Record<string, string>> {
  /**
   * Lo que la pantalla debe MOSTRAR en los controles: el espejo si hay una
   * escritura pendiente, la URL confirmada si no.
   */
  filtros: T
  /**
   * Lo que hay REALMENTE en la URL. Es lo que se le pidió al servidor, así que
   * es lo que tiene que alimentar el fetch del listado y el "¿hay filtros
   * puestos?" — usar el espejo ahí pediría dos veces cada cambio.
   */
  aplicados: T
  /** Aplica un parche. Devuelve qué pasó (ver `ResultadoAplicar`). */
  aplicar: (patch: Partial<T>) => ResultadoAplicar<T>
  /** Todas las claves propias a su valor por defecto, por el mismo camino. */
  limpiar: () => ResultadoAplicar<T>
  /** Hay una escritura pendiente de commitear (la lista debería ir en carga). */
  escribiendo: boolean
}

/** Compara dos juegos de filtros por las claves propias (las de `defectos`). */
export function mismosFiltros<T extends Record<string, string>>(
  a: T,
  b: T,
  claves: readonly (keyof T & string)[],
): boolean {
  return claves.every(c => a[c] === b[c])
}

/**
 * Querystring en forma canónica: el mismo juego de claves y valores da siempre
 * la misma cadena, sin importar el orden ni la codificación con que llegó.
 *
 * Hace falta porque la ráfaga compara lo que ESCRIBIMOS contra lo que el router
 * CONFIRMA, y esas dos cadenas pasan por manos distintas (nosotros armamos una,
 * Next devuelve la otra). Sin canonizar, una diferencia de orden se leería como
 * "navegación externa" y soltaría el espejo en medio de una ráfaga.
 */
export function busquedaCanonica(search: string): string {
  const entradas = [...new URLSearchParams(search).entries()]
  entradas.sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  )
  return new URLSearchParams(entradas).toString()
}

/**
 * Un paso de la ráfaga. Van los DOS datos a propósito, y cada mitad tapa un
 * agujero distinto:
 *
 * - `busqueda`: el querystring COMPLETO y canónico. Es lo único que distingue
 *   "la URL que escribimos" de "esa misma URL más un `?id=abc` que puso otro
 *   componente". Sin él, una navegación ajena que no toca ningún filtro parece
 *   un commit nuestro: el espejo se retiene esperando algo que nunca va a
 *   llegar y la lista gira para siempre con los datos en la mano.
 *
 * - `valores`: los filtros ya validados. Bajo el contrato del hook —`normalizar`
 *   pura e IDEMPOTENTE— esta mitad es redundante: el querystring determina los
 *   valores. Pero **ese contrato no lo verifica nadie**, y las cuatro pantallas
 *   van a traer su propia `normalizar`. Si una no es idempotente, releer la URL
 *   que acabamos de escribir devuelve algo distinto de lo que muestra el espejo;
 *   comparando solo el querystring, ese commit "pertenece" a la ráfaga y el
 *   espejo queda pegado para siempre con la URL ya en su lugar — H-A otra vez,
 *   por otra puerta. Con esta mitad, una `normalizar` mal escrita degrada en "el
 *   espejo se suelta un poco antes" (un parpadeo) en lugar de "la lista no carga
 *   nunca más". Está fijado por test: no es redundancia decorativa.
 */
interface PasoRafaga<T> {
  valores: T
  busqueda: string
}

export function useFiltrosUrl<T extends Record<string, string>>({
  defectos,
  permitidos,
  normalizar,
}: OpcionesFiltrosUrl<T>): FiltrosUrl<T> {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Clave PRIMITIVA. Nunca usar `searchParams` como dependencia: es un objeto
  // nuevo en cada render, y un `filtros` con identidad nueva por render mete al
  // efecto de datos de la pantalla en un loop infinito de fetch.
  const searchParamsKey = searchParams.toString()

  const igual = useCallback(
    (a: T, b: T) => mismosFiltros(a, b, Object.keys(defectos) as (keyof T & string)[]),
    [defectos],
  )

  /** Única puerta URL → filtros validados. La usan la lectura y la escritura. */
  const leerDe = useCallback((search: string): T => {
    const base = leerFiltros(new URLSearchParams(search), defectos, permitidos)
    return normalizar ? normalizar(base) : base
  }, [defectos, permitidos, normalizar])

  // `aplicados` tiene que cambiar de IDENTIDAD solo cuando el querystring
  // cambió de verdad: las pantallas lo usan como dependencia del efecto que
  // trae los datos, y un objeto nuevo por render las mete en un loop infinito
  // de fetch (verificado render por render en la primera versión de
  // Propiedades). De ahí la exigencia de que las opciones sean estables.
  const aplicados = useMemo(() => leerDe(searchParamsKey), [leerDe, searchParamsKey])

  // Guarda de desarrollo: si alguien pasa `{ status: [...] }` o una `normalizar`
  // declarada dentro del componente, `leerDe` cambia de identidad en cada render
  // y la pantalla entra en ese loop. Es un fallo que se manifiesta como "la app
  // se colgó", sin ninguna pista — así que se nombra.
  const anterioresRef = useRef<[unknown, unknown, unknown] | null>(null)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const previas = anterioresRef.current
    anterioresRef.current = [defectos, permitidos, normalizar]
    if (previas && (previas[0] !== defectos || previas[1] !== permitidos || previas[2] !== normalizar)) {
      console.warn(
        '[useFiltrosUrl] las opciones (defectos/permitidos/normalizar) cambiaron de identidad entre renders. ' +
        'Tienen que ser constantes de módulo: si no, el listado se re-pide sin parar.',
      )
    }
  }, [defectos, permitidos, normalizar])

  const [espejo, setEspejo] = useState<T | null>(null)
  const filtros = espejo ?? aplicados

  // Último valor escrito (o la URL, si no hay escritura pendiente) y su
  // querystring COMPLETO — el segundo incluye los parámetros ajenos.
  const ultimoFiltroRef = useRef<T>(aplicados)
  const ultimaBusquedaRef = useRef<string>(searchParamsKey)

  // N1 — reemplazo del temporizador de 3 s. Guardar SOLO la última escritura no
  // alcanza: mientras dos escrituras seguidas se resuelven, Next puede
  // commitear una URL INTERMEDIA, que no es la última pero tampoco viene de
  // afuera. La red de seguridad por tiempo soltaba el espejo en medio de esa
  // ventana y, peor, re-disparaba el resync que pisaba el ref con la URL vieja:
  // el control se destildaba solo y la escritura siguiente perdía el filtro.
  //
  // Acá va la ráfaga completa: el punto del que se partió más cada punto
  // escrito. Un commit que pertenece a la ráfaga es nuestro (o es la URL que
  // todavía no se movió) y NO suelta nada; uno que no pertenece es una
  // navegación genuinamente externa (un link, un replace de otra pantalla) y
  // ahí sí corresponde soltar y resincronizar. Cero temporizadores.
  //
  // "Pertenecer" exige las DOS cosas: los mismos filtros Y el mismo
  // querystring completo (ver `PasoRafaga`). Con los valores solos, un
  // `pushState('?id=abc')` disparado a mitad de ráfaga por otro componente
  // —el patrón que esta app ya usa para su `?tab=`— coincidía con el punto de
  // partida y retenía el espejo PARA SIEMPRE: lista girando con los datos ya
  // recibidos, el control afirmando un filtro que la URL no tiene, y el `?id=`
  // borrado en la escritura siguiente porque el ref del querystring tampoco se
  // resincronizaba.
  const rafagaRef = useRef<PasoRafaga<T>[]>([])

  // Ciclo de vida del espejo + resincronización de los refs, en UN solo efecto
  // para que no haya un render intermedio donde uno ya se soltó y el otro no.
  // Es también el ÚNICO lugar que vacía la ráfaga: dejarla llena de una ronda
  // ya cerrada hace que un commit externo posterior "pertenezca" a una ráfaga
  // que terminó hace rato, con el mismo espejo pegado de arriba.
  //
  // INVARIANTE que sostiene todo esto — `rafaga.length > 0 ⟹ espejo !== null`:
  // todo push a la ráfaga (en `aplicar`) va acompañado de un `setEspejo(validados)`
  // no nulo, y el único punto que la vacía (este efecto) anula el espejo en la
  // misma pasada. De ahí se sigue que `popstate`, que solo anula el espejo,
  // alcanza para que este efecto corra y limpie. Si alguna vez se empuja a la
  // ráfaga sin poner espejo, ese camino deja de limpiarse y NINGÚN test avisa:
  // los tests entran por `aplicar`, que respeta el invariante por construcción.
  //
  // La URL que acaba de llegar RETIENE el espejo cuando es un commit intermedio
  // de la ráfaga (o la URL vieja que todavía no se movió): si se soltara ahí,
  // los controles parpadearían a un estado viejo y el ref retrocedería, que es
  // exactamente lo que hacía la red de seguridad por tiempo.
  useEffect(() => {
    const busquedaActual = busquedaCanonica(searchParamsKey)
    const retiene =
      espejo !== null &&
      !igual(espejo, aplicados) &&
      rafagaRef.current.some(p => p.busqueda === busquedaActual && igual(p.valores, aplicados))
    if (retiene) return
    // La URL es un sistema EXTERNO (el router de Next) cuyos commits solo se
    // pueden observar acá — el caso que la propia regla describe como
    // "suscribirse a un sistema externo y avisarle a React". El render de más
    // ocurre UNA vez por ráfaga terminada, no por cada cambio de estado.
    // La alternativa —derivar el espejo en el render— exige leer la ráfaga
    // durante el render (lo prohíbe `react-hooks/refs`) y, si se guarda en
    // estado para poder leerla, un espejo viejo puede "revivir" cuando la URL
    // vuelve a un valor intermedio de una ráfaga ya cerrada. Entre un render de
    // más y un espejo zombi, el render de más.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (espejo) setEspejo(null)
    rafagaRef.current = []
    ultimoFiltroRef.current = aplicados
    ultimaBusquedaRef.current = searchParamsKey
  }, [espejo, aplicados, searchParamsKey, igual])

  // Atrás/Adelante del navegador. `history.replaceState` (lo que usa el router)
  // NO dispara `popstate`, así que este evento significa siempre navegación del
  // usuario. Hace falta además de la ráfaga porque el Atrás puede caer JUSTO en
  // la URL de la que partimos, que sí está en la ráfaga: sin esto el espejo
  // quedaría puesto esperando un commit que ya no va a llegar.
  // Soltar el espejo alcanza: el efecto de arriba corre a continuación y es el
  // que vacía la ráfaga y resincroniza los refs.
  useEffect(() => {
    const alNavegar = () => setEspejo(null)
    window.addEventListener('popstate', alNavegar)
    return () => window.removeEventListener('popstate', alNavegar)
  }, [])

  // La URL puede traer parámetros que no son filtros de esta pantalla
  // (`utm_source` de una campaña; `id`, `tab`, `highlight` en los deep links de
  // CRM/Contactos/Visitas). Se parte de lo que ya hay y se sobrescriben SOLO
  // las claves propias — reconstruir el querystring desde cero los borraría.
  const construirBusqueda = useCallback((nuevos: T) => {
    const params = new URLSearchParams(ultimaBusquedaRef.current)
    for (const clave of Object.keys(defectos)) params.delete(clave)
    // `escribirFiltros` ordena las claves y omite las que están en su defecto:
    // el resultado sigue siendo estable e idempotente.
    new URLSearchParams(escribirFiltros(nuevos, defectos))
      .forEach((valor, clave) => params.set(clave, valor))
    return params.toString()
  }, [defectos])

  const aplicar = useCallback((patch: Partial<T>): ResultadoAplicar<T> => {
    const propias = Object.keys(defectos) as (keyof T & string)[]

    // Una clave que no está en `defectos` no se escribe, no se lee y no cuenta
    // como rechazada: es un no-op perfectamente mudo, o sea el botón muerto que
    // este hook vino a matar. Con cuatro pantallas por seis claves, el typo va
    // a pasar; que al menos lo diga la consola en desarrollo.
    if (process.env.NODE_ENV !== 'production') {
      const desconocidas = Object.keys(patch).filter(c => !propias.includes(c as keyof T & string))
      if (desconocidas.length > 0) {
        console.warn(
          `[useFiltrosUrl] aplicar() recibió claves que no son de esta pantalla: ${desconocidas.join(', ')}. ` +
          `Las claves propias son: ${propias.join(', ')}. Se ignoran (¿un typo?).`,
        )
      }
    }

    // NUNCA partir de `aplicados` (la foto de ESTE render): el ref es lo único
    // que ya tiene la escritura anterior aunque haya pasado un instante.
    const previos = ultimoFiltroRef.current
    const crudos = { ...previos, ...patch } as T
    // Lo que devolvería una LECTURA de lo que se está por escribir.
    const validados = leerDe(escribirFiltros(crudos, defectos))

    // Rechazo = la clave CAYÓ AL VALOR POR DEFECTO pidiendo otra cosa; o sea,
    // el filtro no se aplicó. Comparar crudo contra validado marcaba como
    // rechazo cualquier AJUSTE — un `trim`, un recorte de largo— aunque el
    // filtro SÍ se hubiera aplicado: en Contactos y CRM, con campos de texto,
    // "casa " habría pintado en rojo "No se aplicó Búsqueda" mientras la
    // pantalla mostraba los resultados de `q=casa`. Un aviso que salta cuando
    // no pasó nada malo enseña a ignorar todos los avisos.
    const rechazadas = (Object.keys(patch) as (keyof T & string)[])
      .filter(c => propias.includes(c) && validados[c] === defectos[c] && crudos[c] !== defectos[c])

    if (igual(validados, previos)) {
      // Nada para escribir. Distinguir POR QUÉ es lo que evita el botón muerto:
      // "ya estaba así" es un no-op legítimo y silencioso; "lo rechacé" tiene
      // que llegarle al usuario.
      return { estado: rechazadas.length > 0 ? 'rechazado' : 'sin-cambios', rechazadas }
    }

    const busqueda = construirBusqueda(validados)
    if (rafagaRef.current.length === 0) {
      rafagaRef.current.push({
        valores: previos,
        busqueda: busquedaCanonica(ultimaBusquedaRef.current),
      })
    }
    rafagaRef.current.push({ valores: validados, busqueda: busquedaCanonica(busqueda) })
    ultimoFiltroRef.current = validados
    ultimaBusquedaRef.current = busqueda
    setEspejo(validados)
    // `replace` y no `push`: con push, cada ajuste del rango de fechas deja una
    // entrada en el historial y el botón Atrás se vuelve inusable.
    router.replace(busqueda ? `${pathname}?${busqueda}` : pathname, { scroll: false })
    return { estado: 'escrito', rechazadas }
  }, [construirBusqueda, defectos, igual, leerDe, pathname, router])

  const limpiar = useCallback(() => aplicar(defectos as Partial<T>), [aplicar, defectos])

  return { filtros, aplicados, aplicar, limpiar, escribiendo: espejo !== null }
}
