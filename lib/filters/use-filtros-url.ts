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
  // Acá va la ráfaga completa: el valor del que se partió más cada valor
  // escrito. Un commit que pertenece a la ráfaga es nuestro (o es la URL que
  // todavía no se movió) y NO suelta nada; uno que no pertenece es una
  // navegación genuinamente externa (un link, un replace de otra pantalla) y
  // ahí sí corresponde soltar y resincronizar. Cero temporizadores.
  const rafagaRef = useRef<T[]>([])

  const soltarEspejo = useCallback(() => {
    rafagaRef.current = []
    setEspejo(null)
  }, [])

  // Ciclo de vida del espejo + resincronización de los refs, en UN solo efecto
  // para que no haya un render intermedio donde uno ya se soltó y el otro no.
  //
  // La URL que acaba de llegar RETIENE el espejo cuando es un commit intermedio
  // de la ráfaga (o la URL vieja que todavía no se movió): si se soltara ahí,
  // los controles parpadearían a un estado viejo y el ref retrocedería, que es
  // exactamente lo que hacía la red de seguridad por tiempo.
  useEffect(() => {
    const retiene =
      espejo !== null && !igual(espejo, aplicados) && rafagaRef.current.some(v => igual(v, aplicados))
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
  useEffect(() => {
    const alNavegar = () => soltarEspejo()
    window.addEventListener('popstate', alNavegar)
    return () => window.removeEventListener('popstate', alNavegar)
  }, [soltarEspejo])

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
    // NUNCA partir de `aplicados` (la foto de ESTE render): el ref es lo único
    // que ya tiene la escritura anterior aunque haya pasado un instante.
    const previos = ultimoFiltroRef.current
    const crudos = { ...previos, ...patch } as T
    // Lo que devolvería una LECTURA de lo que se está por escribir.
    const validados = leerDe(escribirFiltros(crudos, defectos))

    const rechazadas = (Object.keys(patch) as (keyof T & string)[])
      .filter(c => propias.includes(c) && validados[c] !== crudos[c])

    if (igual(validados, previos)) {
      // Nada para escribir. Distinguir POR QUÉ es lo que evita el botón muerto:
      // "ya estaba así" es un no-op legítimo y silencioso; "lo rechacé" tiene
      // que llegarle al usuario.
      return { estado: rechazadas.length > 0 ? 'rechazado' : 'sin-cambios', rechazadas }
    }

    const busqueda = construirBusqueda(validados)
    if (rafagaRef.current.length === 0) rafagaRef.current.push(previos)
    rafagaRef.current.push(validados)
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
