/**
 * Una corrida del publicador: toma los envíos que ya tienen que salir y avanza
 * UNA etapa de cada uno, sin pasarse del tiempo de Netlify.
 *
 * Todo lo que toca afuera (base, Meta, reloj) entra como dependencia: así se
 * prueba la orquestación —qué se guarda, qué se reintenta, qué se frena— sin
 * red. Las dependencias reales están en `servidor/publicador.ts`.
 */
import type { EnvioFila, Plataforma, VideoFila } from '../tipos'
import { esRutaPropia } from '../validacion'
import { clasificarError, esperaDeReintento, puedeSalir, type RedQuePublica } from './maquina'
import type { Contexto, EnvioEnCurso, Pieza, ResultadoEtapa } from './redes'

export interface Candidato {
  envio: EnvioFila
  video: VideoFila
  estadoTanda: 'borrador' | 'confirmada'
}

type Red = (envio: EnvioEnCurso, pieza: Pieza, ctx: Contexto) => Promise<ResultadoEtapa>

export interface DepsRunner {
  ahora: () => Date
  automatica: () => Promise<boolean>
  candidatos: (ahora: Date) => Promise<Candidato[]>
  /** Reserva atómica del envío (UPDATE condicional). `false` = otra corrida lo tomó. */
  reservar: (envio: EnvioFila, ahora: Date) => Promise<boolean>
  /** `false` si no escribió nada (el envío ya no está pendiente: lo cancelaron). */
  guardar: (envioId: string, cambios: Record<string, unknown>) => Promise<boolean | void>
  urlPublica: (path: string) => string
  redes: Partial<Record<Plataforma, Red>>
  presupuestoMs: number
  /**
   * Después de que un envío quedó guardado como publicado: conectar la
   * automatización de comentarios. Lo que falle acá NO toca el envío (el video
   * ya salió); lo anota quien lo implementa.
   */
  alPublicar?: (c: Candidato, r: ResultadoEtapa) => Promise<void>
  /**
   * Si la red no puede publicar todavía (YouTube o TikTok sin conectar), el
   * motivo. El envío ESPERA con ese motivo a la vista: no gasta intentos ni
   * se marca fallido, sale solo cuando la cuenta se conecta.
   */
  redPendiente?: (plataforma: Plataforma) => Promise<string | null>
}

/**
 * Un envío que nunca arrancó y está atrasado más que esto no sale solo: con el
 * interruptor apagado una semana, o YouTube conectado tarde, saldrían todos juntos
 * de golpe. Queda fallido con "Reintentar" para que alguien decida.
 */
const ATRASO_MAXIMO_MS = 24 * 3600_000
export const ATRASADO = 'Salía hace más de un día y no se publicó a tiempo. Tocá Reintentar para publicarlo igual.'

/** Cada cuánto se vuelve a mirar un envío que espera a que se conecte su red. */
const ESPERA_RED_PENDIENTE_MS = 10 * 60_000
/** Una etapa no trabaja después de esto, contado desde que arrancó la corrida (Netlify corta ~26 s). */
const PLAZO_ETAPA_MS = 20_000
const NOMBRE_RED: Record<Plataforma, RedQuePublica> = { instagram: 'Meta', facebook: 'Meta', youtube: 'YouTube', tiktok: 'TikTok' }

export interface ResumenPublicador {
  motivo?: 'apagado'
  mirados: number
  avanzados: number
  publicados: number
  reintentos: number
  fallidos: number
  detalle: string[]
}

export async function correrPublicador(d: DepsRunner): Promise<ResumenPublicador> {
  const resumen: ResumenPublicador = { mirados: 0, avanzados: 0, publicados: 0, reintentos: 0, fallidos: 0, detalle: [] }
  if (!(await d.automatica())) return { ...resumen, motivo: 'apagado' }

  const inicio = d.ahora().getTime()
  const lista = await d.candidatos(d.ahora())

  for (const c of lista) {
    if (d.ahora().getTime() - inicio > d.presupuestoMs) {
      resumen.detalle.push('sin tiempo: el resto sigue en la próxima corrida')
      break
    }
    resumen.mirados++
    const { envio, video } = c
    const ahora = d.ahora()
    if (!puedeSalir(envio, video, c.estadoTanda, true, ahora).sale) continue

    const red = d.redes[envio.plataforma]
    if (!red) continue // YouTube y TikTok llegan en las fases siguientes.

    if (!(await d.reservar(envio, ahora))) {
      resumen.detalle.push(`${envio.id}: lo tomó otra corrida`)
      continue
    }

    const atrasado =
      envio.etapa === null &&
      envio.ids_externos?.reintento !== true &&
      !!video.programado_para &&
      ahora.getTime() - Date.parse(video.programado_para) > ATRASO_MAXIMO_MS
    if (atrasado) {
      await guardarSinCortar(d, envio.id, { estado: 'fallido', proximo_intento: null, ultimo_error: ATRASADO }, resumen)
      resumen.fallidos++
      continue
    }

    const pendiente = d.redPendiente ? await d.redPendiente(envio.plataforma) : null
    if (pendiente) {
      await guardarSinCortar(d, envio.id, {
        ultimo_error: pendiente,
        proximo_intento: new Date(d.ahora().getTime() + ESPERA_RED_PENDIENTE_MS).toISOString(),
      }, resumen)
      resumen.detalle.push(`${envio.plataforma} ${envio.id}: espera — ${pendiente}`)
      continue
    }
    resumen.avanzados++

    // Nunca se le pasa a Meta un archivo que no sea el de este video, ni uno ya borrado.
    const problemaArchivo = !video.video_path || !esRutaPropia(video.video_path, video.tanda_id, video.id)
      ? 'El archivo del video no es válido. Volvé a subirlo.'
      : video.archivo_borrado_at
        ? 'El archivo del video ya se borró (pasaron 30 días desde que terminó). Subilo de nuevo en otra tanda.'
        : null
    if (problemaArchivo) {
      await guardarSinCortar(d, envio.id, { estado: 'fallido', proximo_intento: null, ultimo_error: problemaArchivo }, resumen)
      resumen.fallidos++
      continue
    }

    const pieza: Pieza = {
      videoUrl: d.urlPublica(video.video_path as string),
      descripcion: video.descripcion,
      duracionSeg: video.duracion_seg,
      titulo: video.titulo_youtube,
      tamanoBytes: Number(video.tamano_bytes),
    }
    const ctx: Contexto = {
      ahora,
      plazo: inicio + PLAZO_ETAPA_MS,
      anotarIds: async (etapa, ids) => {
        if ((await d.guardar(envio.id, { etapa, ids_externos: ids, estado: 'en_curso' })) === false) {
          throw new Error('El envío se canceló mientras se publicaba: no se mandó nada más.')
        }
      },
      // Anotación previa a un pedido que no se puede repetir. Si no se puede
      // guardar, tira: el pedido no se manda.
      antes: async (etapa) => {
        // `false` = no escribió nada: lo cancelaron en el medio. Entonces no se manda.
        if ((await d.guardar(envio.id, { etapa, estado: 'en_curso' })) === false) {
          throw new Error('El envío se canceló mientras se publicaba: no se mandó nada.')
        }
      },
    }

    let r: ResultadoEtapa
    try {
      r = await red({ etapa: envio.etapa, ids_externos: envio.ids_externos ?? {} }, pieza, ctx)
    } catch (e) {
      const clasificado = clasificarError(e, NOMBRE_RED[envio.plataforma])
      const intentos = (envio.intentos ?? 0) + 1
      const espera = clasificado.transitorio ? esperaDeReintento(intentos) : null
      console.error('[publicador]', envio.plataforma, envio.id, e)
      if (espera !== null) {
        await guardarSinCortar(d, envio.id, {
          intentos,
          ultimo_error: clasificado.mensaje,
          proximo_intento: new Date(d.ahora().getTime() + espera).toISOString(),
        }, resumen)
        resumen.reintentos++
      } else {
        // Ya no se reintenta: el mensaje no puede seguir prometiendo que sí.
        const mensaje = clasificado.transitorio
          ? `${clasificado.mensaje.replace(/\s*Se reintenta solo\.?$/, '')} Ya se probó varias veces: tocá Reintentar.`
          : clasificado.mensaje
        await guardarSinCortar(d, envio.id, { estado: 'fallido', intentos, ultimo_error: mensaje, proximo_intento: null }, resumen)
        resumen.fallidos++
      }
      resumen.detalle.push(`${envio.plataforma} ${envio.id}: error — ${clasificado.mensaje}`)
      continue
    }

    const cambios: Record<string, unknown> = {
      estado: r.estado,
      etapa: r.etapa,
      ids_externos: r.ids,
      ultimo_error: r.estado === 'fallido' ? (r.error ?? 'No se pudo publicar') : null,
      proximo_intento: r.estado === 'en_curso' ? new Date(d.ahora().getTime() + (r.esperarMs ?? 0)).toISOString() : null,
    }
    if (r.enlace !== undefined) cambios.enlace = r.enlace && r.enlace.startsWith('https://') ? r.enlace : null
    // Si esto falla, NO se clasifica como error de la publicación: lo de Meta ya
    // pasó. La reserva vence en 3 minutos y la corrida siguiente le pregunta a
    // Meta en qué quedó (las etapas siempre preguntan antes de publicar).
    if (!(await guardarSinCortar(d, envio.id, cambios, resumen))) continue
    if (r.estado === 'publicado') {
      resumen.publicados++
      if (d.alPublicar) {
        try {
          await d.alPublicar(c, r)
        } catch (e) {
          console.error('[publicador] no se pudo conectar la automatización', envio.id, e)
          resumen.detalle.push(`${envio.plataforma} ${envio.id}: publicado, sin conectar los comentarios`)
        }
      }
    }
    if (r.estado === 'fallido') resumen.fallidos++
    resumen.detalle.push(`${envio.plataforma} ${envio.id}: ${r.estado} (${r.etapa ?? 'inicio'})`)
  }
  return resumen
}

/** Un guardado que falla no corta la corrida: se anota y el resto de los envíos sigue. */
async function guardarSinCortar(
  d: DepsRunner,
  envioId: string,
  cambios: Record<string, unknown>,
  resumen: ResumenPublicador,
): Promise<boolean> {
  try {
    await d.guardar(envioId, cambios)
    return true
  } catch (e) {
    console.error('[publicador] no se pudo guardar', envioId, e)
    resumen.detalle.push(`${envioId}: no se pudo guardar (${e instanceof Error ? e.message : 'error'}); se retoma en 3 minutos`)
    return false
  }
}
