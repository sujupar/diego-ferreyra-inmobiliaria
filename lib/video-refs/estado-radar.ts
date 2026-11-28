// Estado del radar para el cartel de la pantalla Referencias. Lógica pura.

export type FilaCorrida = {
  inicio: string
  estado: string
  cuentas_revisadas: number | null
  reels_mirados: number | null
  publicadas: number | null
  mensaje: string | null
}

export type EstadoRadar = {
  ultima: {
    inicio: string
    estado: string
    cuentas: number
    reels: number
    publicadas: number
    mensaje: string | null
  } | null
  alerta: null | 'sin_corridas' | 'atrasado' | 'frenado' | 'error'
}

const LIMITE_ATRASO_MS = 36 * 3_600_000
const ZONA = 'America/Argentina/Buenos_Aires'

export function calcularEstadoRadar(ultimaOk: FilaCorrida | null, ultima: FilaCorrida | null, ahora: Date): EstadoRadar {
  if (!ultimaOk && !ultima) return { ultima: null, alerta: 'sin_corridas' }
  const ref = ultima ?? ultimaOk!
  const resumen = {
    inicio: ref.inicio,
    estado: ref.estado,
    cuentas: ref.cuentas_revisadas ?? 0,
    reels: ref.reels_mirados ?? 0,
    publicadas: ref.publicadas ?? 0,
    mensaje: ref.mensaje,
  }
  let alerta: EstadoRadar['alerta'] = null
  if (ref.estado === 'frenada_por_instagram') alerta = 'frenado'
  else if (ref.estado === 'error') alerta = 'error'
  else {
    // Última corrida buena (o, si todavía no hay ninguna, la más reciente que haya).
    const base = ultimaOk ?? ref
    if (ahora.getTime() - new Date(base.inicio).getTime() > LIMITE_ATRASO_MS) alerta = 'atrasado'
  }
  return { ultima: resumen, alerta }
}

function partes(d: Date) {
  const f = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => f.find((p) => p.type === t)!.value
  return `${g('year')}-${g('month')}-${g('day')}`
}

/** "hoy 08:12", "ayer 08:05", "el martes 08:10" (misma semana) o "el 10 de nov 08:10". */
export function cuandoCorrio(iso: string, ahora: Date): string {
  const d = new Date(iso)
  const hora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  const dia = partes(d)
  if (dia === partes(ahora)) return `hoy ${hora}`
  if (dia === partes(new Date(ahora.getTime() - 86_400_000))) return `ayer ${hora}`
  if (ahora.getTime() - d.getTime() < 6 * 86_400_000) {
    const nombre = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'long' }).format(d)
    return `el ${nombre} ${hora}`
  }
  const fecha = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: 'numeric', month: 'short' }).format(d).replace(/\./g, '')
  return `el ${fecha.replace(' ', ' de ')} ${hora}`
}

export function textoAlerta(e: EstadoRadar, ahora: Date): string | null {
  switch (e.alerta) {
    case 'sin_corridas': return 'El radar todavía no corrió'
    case 'atrasado': return e.ultima
      ? `El radar no corre desde ${cuandoCorrio(e.ultima.inicio, ahora).replace(/ \d{2}:\d{2}$/, '')}`
      : 'El radar no corre hace tiempo'
    case 'frenado': return 'Instagram frenó la búsqueda de hoy'
    case 'error': return `La búsqueda de hoy falló: ${e.ultima?.mensaje ?? 'sin detalle'}`
    default: return null
  }
}

export function textoUltima(e: EstadoRadar, ahora: Date): string | null {
  if (!e.ultima) return null
  const u = e.ultima
  return `Última búsqueda: ${cuandoCorrio(u.inicio, ahora)} · ${u.reels} reels de ${u.cuentas} cuentas · ${u.publicadas} ${u.publicadas === 1 ? 'nueva' : 'nuevas'}`
}
