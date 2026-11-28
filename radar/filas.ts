import type { Analisis, Clasificacion, CuentaPerfil, ReelCrudo } from './tipos'

const fmtAR = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
// en-CA da YYYY-MM-DD; la zona evita que un reel de las 22h salga con la fecha del día siguiente (UTC).
const fmtFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Arma la fila de `video_refs` para un reel del radar.
 * NO incluye `estado_uso`: si la fila ya existe (upsert por ficha_slug) no hay que pisar
 * el estado en que la dejó el equipo; si es nueva, toma el default de la tabla.
 * Una métrica faltante queda null, nunca 0.
 */
export function armarFilaVideoRef(
  reel: ReelCrudo & { multiplicador: number },
  base: number,
  baseN: number,
  perfil: CuentaPerfil,
  clas: Clasificacion,
  an: Analisis,
  medios: { videoPath: string | null; portadaPath: string | null },
  runId: string,
): Record<string, unknown> {
  return {
    fuente: 'radar',
    plataforma: 'instagram',
    tipo: 'video_cuenta',
    ficha_slug: `ig-${reel.shortcode}`,
    ig_shortcode: reel.shortcode,
    url_video: `https://www.instagram.com/reel/${reel.shortcode}/`,
    cuenta: `@${perfil.usuario.replace(/^@/, '')}`,
    fecha_video: fmtFecha.format(new Date(reel.publicadoAt)),
    vistas: reel.vistas ?? null,
    likes: reel.likes ?? null,
    comentarios: reel.comentarios ?? null,
    seguidores: perfil.seguidores ?? null,
    multiplicador: Math.round(reel.multiplicador * 10) / 10,
    baseline_cuenta: `mediana de ${baseN} reels: ${fmtAR.format(Math.round(base))} vistas`,
    tema: an.tema,
    gancho: an.gancho,
    formato: an.formato,
    por_que: an.por_que,
    comentarios_analisis: an.comentarios_analisis,
    adaptacion_diego: an.adaptacion_diego,
    transcripcion: an.transcripcion,
    categoria: clas.categoria,
    tema_categoria: clas.tema,
    puntaje: clas.puntaje,
    video_storage_path: medios.videoPath,
    portada_storage_path: medios.portadaPath,
    oculta: false,
    radar_run_id: runId,
  }
}
