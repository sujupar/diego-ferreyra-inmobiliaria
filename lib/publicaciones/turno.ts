/**
 * Un turno exclusivo: los trabajos que se le pasan corren de a uno, en orden.
 *
 * Lo usa la extracción de audio en el navegador: cada video se carga entero en
 * memoria y su audio decodificado pesa otro tanto (un video de 200 MB son ~400 MB
 * en total). Dos a la vez en un celular hacen caer la pestaña, y al recargar se
 * vuelve a caer, porque el video retoma desde la misma etapa.
 */
export function crearTurno() {
  let cola: Promise<unknown> = Promise.resolve()
  return function enTurno<T>(trabajo: () => Promise<T>): Promise<T> {
    const resultado = cola.then(trabajo, trabajo)
    cola = resultado.catch(() => undefined)
    return resultado
  }
}
