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
import { clasificarError, esperaDeReintento, puedeSalir } from './maquina'
import type { EnvioEnCurso, Pieza, ResultadoEtapa } from './redes'

export interface Candidato {
  envio: EnvioFila
  video: VideoFila
  estadoTanda: 'borrador' | 'confirmada'
}

type Red = (envio: EnvioEnCurso, pieza: Pieza) => Promise<ResultadoEtapa>

export interface DepsRunner {
  ahora: () => Date
  automatica: () => Promise<boolean>
  candidatos: (ahora: Date) => Promise<Candidato[]>
  /** Reserva atómica del envío (UPDATE condicional). `false` = otra corrida lo tomó. */
  reservar: (envio: EnvioFila, ahora: Date) => Promise<boolean>
  guardar: (envioId: string, cambios: Record<string, unknown>) => Promise<void>
  urlPublica: (path: string) => string
  redes: Partial<Record<Plataforma, Red>>
  presupuestoMs: number
}

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
    resumen.avanzados++

    // Nunca se le pasa a Meta un archivo que no sea el de este video.
    if (!video.video_path || !esRutaPropia(video.video_path, video.tanda_id, video.id)) {
      await d.guardar(envio.id, {
        estado: 'fallido',
        proximo_intento: null,
        ultimo_error: 'El archivo del video no es válido. Volvé a subirlo.',
      })
      resumen.fallidos++
      continue
    }

    const pieza: Pieza = {
      videoUrl: d.urlPublica(video.video_path),
      descripcion: video.descripcion,
      duracionSeg: video.duracion_seg,
    }

    try {
      const r = await red({ etapa: envio.etapa, ids_externos: envio.ids_externos ?? {} }, pieza)
      const cambios: Record<string, unknown> = {
        estado: r.estado,
        etapa: r.etapa,
        ids_externos: r.ids,
        ultimo_error: r.estado === 'fallido' ? (r.error ?? 'No se pudo publicar') : null,
        proximo_intento: r.estado === 'en_curso' ? new Date(d.ahora().getTime() + (r.esperarMs ?? 0)).toISOString() : null,
      }
      if (r.enlace !== undefined) cambios.enlace = r.enlace
      await d.guardar(envio.id, cambios)
      if (r.estado === 'publicado') resumen.publicados++
      if (r.estado === 'fallido') resumen.fallidos++
      resumen.detalle.push(`${envio.plataforma} ${envio.id}: ${r.estado} (${r.etapa ?? 'inicio'})`)
    } catch (e) {
      const clasificado = clasificarError(e)
      const intentos = (envio.intentos ?? 0) + 1
      const espera = clasificado.transitorio ? esperaDeReintento(intentos) : null
      console.error('[publicador]', envio.plataforma, envio.id, e)
      if (espera !== null) {
        await d.guardar(envio.id, {
          intentos,
          ultimo_error: clasificado.mensaje,
          proximo_intento: new Date(d.ahora().getTime() + espera).toISOString(),
        })
        resumen.reintentos++
      } else {
        await d.guardar(envio.id, { estado: 'fallido', intentos, ultimo_error: clasificado.mensaje, proximo_intento: null })
        resumen.fallidos++
      }
      resumen.detalle.push(`${envio.plataforma} ${envio.id}: error — ${clasificado.mensaje}`)
    }
  }
  return resumen
}
