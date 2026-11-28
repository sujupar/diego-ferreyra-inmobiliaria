// Mezcla 80/20: al menos 80 % del contenido semanal tiene que ser inmobiliario ARGENTINO.
// `inmobiliario_otro_pais` y `formato_otro_rubro` comparten el 20 % (decisión del spec:
// "80 % argentino"). `db.semanaPublicada` cuenta con la misma regla.
import type { Clasificacion, ConfigRadar } from './tipos'

export type Aprobado = { shortcode: string; multiplicador: number; clas: Clasificacion }

const PROPORCION_MAX_OTRAS = 0.2

/** El grupo del 80 %: solo inmobiliario argentino. */
const esInmobiliario = (a: Aprobado) => a.clas.categoria === 'inmobiliario_ar'

const score = (a: Aprobado) => a.multiplicador * a.clas.puntaje

function ordenar(lista: Aprobado[]): Aprobado[] {
  return [...lista].sort((a, b) => {
    const d = score(b) - score(a)
    if (d !== 0) return d
    // Empate: el inmobiliario argentino va primero.
    const pa = a.clas.categoria === 'inmobiliario_ar' ? 0 : 1
    const pb = b.clas.categoria === 'inmobiliario_ar' ? 0 : 1
    return pa - pb
  })
}

export function elegirPublicables(
  aprobados: Aprobado[],
  semana: { inmobiliarias: number; otras: number },
  cfg: ConfigRadar,
): Aprobado[] {
  const validos = aprobados.filter((a) => a.clas.categoria !== 'no_sirve' && a.clas.puntaje >= cfg.puntajeMin)
  const inmob = ordenar(validos.filter(esInmobiliario))
  const otros = ordenar(validos.filter((a) => !esInmobiliario(a)))

  const inmobHoy = Math.min(inmob.length, cfg.topeDiario)
  if (inmobHoy === 0) return [] // sin inmobiliario argentino no se publica nada

  // Mayor k (con el tope diario ya aplicado al total real del día) tal que
  // (otras + k) / (total semana + inmobiliarios que realmente entran + k) <= 20 %.
  const kMax = Math.min(otros.length, cfg.topeDiario - 1)
  let k = 0
  for (let c = 1; c <= kMax; c++) {
    const inmobReal = Math.min(inmobHoy, cfg.topeDiario - c)
    if ((semana.otras + c) / (semana.inmobiliarias + semana.otras + inmobReal + c) <= PROPORCION_MAX_OTRAS) k = c
  }
  // Mínimo diario: si hay inmobiliario publicable, entra al menos 1 otro (si hay).
  k = Math.min(Math.max(k, 1), kMax)

  // Tope diario: se reservan los lugares de otros y se recortan los inmobiliarios.
  const nInmob = Math.min(inmobHoy, cfg.topeDiario - k)
  return [...inmob.slice(0, nInmob), ...otros.slice(0, k)]
}
