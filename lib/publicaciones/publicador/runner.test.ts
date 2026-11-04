import { describe, expect, it, vi } from 'vitest'
import type { EnvioFila, VideoFila } from '../tipos'
import { correrPublicador, type Candidato, type DepsRunner } from './runner'

const T = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'
const AHORA = new Date('2026-10-30T15:00:00Z')

function candidato(plataforma: 'instagram' | 'facebook', id = plataforma): Candidato {
  const video = {
    id: V, tanda_id: T, pausado: false, programado_para: '2026-10-30T14:00:00Z', video_path: `tandas/${T}/${V}/video.mp4`,
    descripcion: 'Hola', duracion_seg: 30,
  } as VideoFila
  const envio = {
    id, video_id: V, plataforma, estado: 'programado', etapa: null, ids_externos: {}, intentos: 0,
    proximo_intento: null, ultimo_error: null, updated_at: 'u1',
  } as unknown as EnvioFila
  return { envio, video, estadoTanda: 'confirmada' }
}

function deps(over: Partial<DepsRunner> = {}): DepsRunner & { guardados: { id: string; cambios: Record<string, unknown> }[] } {
  const guardados: { id: string; cambios: Record<string, unknown> }[] = []
  return {
    guardados,
    ahora: () => AHORA,
    automatica: async () => true,
    candidatos: async () => [candidato('instagram'), candidato('facebook')],
    reservar: async () => true,
    guardar: async (id, cambios) => {
      guardados.push({ id, cambios })
    },
    urlPublica: (p) => `https://x.supabase.co/storage/v1/object/public/contenido-videos/${p}`,
    redes: {
      instagram: async () => ({ etapa: 'contenedor', ids: { creation_id: 'c1' }, estado: 'en_curso', esperarMs: 60_000 }),
      facebook: async () => ({ etapa: 'iniciado', ids: { video_id: 'f1' }, estado: 'en_curso', esperarMs: 0 }),
    },
    presupuestoMs: 18_000,
    ...over,
  }
}

describe('correrPublicador', () => {
  it('con la publicación automática apagada no toca nada', async () => {
    const d = deps({ automatica: async () => false })
    const candidatos = vi.fn(d.candidatos)
    const r = await correrPublicador({ ...d, candidatos })
    expect(r.motivo).toBe('apagado')
    expect(candidatos).not.toHaveBeenCalled()
    expect(d.guardados).toEqual([])
  })

  it('avanza una etapa de cada envío y guarda el resultado', async () => {
    const d = deps()
    const r = await correrPublicador(d)
    expect(r.avanzados).toBe(2)
    expect(d.guardados.find((g) => g.id === 'instagram')!.cambios).toMatchObject({
      estado: 'en_curso', etapa: 'contenedor', ids_externos: { creation_id: 'c1' },
      proximo_intento: new Date(AHORA.getTime() + 60_000).toISOString(),
    })
  })

  it('un envío que tira un error no frena a los demás', async () => {
    const d = deps({
      redes: {
        instagram: async () => {
          throw Object.assign(new Error('Instagram 503: caído'), { httpStatus: 503 })
        },
        facebook: async () => ({ etapa: null, ids: {}, estado: 'publicado', enlace: 'https://www.facebook.com/reel/1/' }),
      },
    })
    const r = await correrPublicador(d)
    expect(r.reintentos).toBe(1)
    expect(r.publicados).toBe(1)
    const ig = d.guardados.find((g) => g.id === 'instagram')!.cambios
    expect(ig).toMatchObject({ intentos: 1, ultimo_error: 'Meta no respondió bien. Se reintenta solo.' })
    expect(ig.proximo_intento).toBe(new Date(AHORA.getTime() + 60_000).toISOString())
  })

  it('un error definitivo marca el envío como fallido con el motivo', async () => {
    const d = deps({
      candidatos: async () => [candidato('instagram')],
      redes: {
        instagram: async () => {
          throw Object.assign(new Error('Instagram 400: video inválido'), { httpStatus: 400, code: 100 })
        },
        facebook: async () => ({ etapa: null, ids: {}, estado: 'en_curso' }),
      },
    })
    const r = await correrPublicador(d)
    expect(r.fallidos).toBe(1)
    expect(d.guardados[0].cambios).toMatchObject({ estado: 'fallido', proximo_intento: null })
    expect(String(d.guardados[0].cambios.ultimo_error)).toMatch(/^Meta rechazó la publicación/)
  })

  it('después del quinto reintento deja de reintentar', async () => {
    const c = candidato('instagram')
    c.envio.intentos = 5
    const d = deps({
      candidatos: async () => [c],
      redes: {
        instagram: async () => {
          throw Object.assign(new Error('x'), { httpStatus: 503 })
        },
        facebook: async () => ({ etapa: null, ids: {}, estado: 'en_curso' }),
      },
    })
    await correrPublicador(d)
    expect(d.guardados[0].cambios).toMatchObject({ estado: 'fallido', intentos: 6 })
  })

  it('si otra corrida ya lo reservó, no lo toca', async () => {
    const d = deps({ reservar: async () => false })
    const r = await correrPublicador(d)
    expect(r.avanzados).toBe(0)
    expect(d.guardados).toEqual([])
  })

  it('un video con una ruta que no es suya no se manda a Meta', async () => {
    const c = candidato('instagram')
    c.video.video_path = 'tandas/otra/cosa/video.mp4'
    const ig = vi.fn()
    const d = deps({ candidatos: async () => [c], redes: { instagram: ig, facebook: vi.fn() } })
    await correrPublicador(d)
    expect(ig).not.toHaveBeenCalled()
    expect(d.guardados[0].cambios).toMatchObject({ estado: 'fallido' })
  })

  it('un video pausado no sale aunque venga en la lista', async () => {
    const c = candidato('instagram')
    c.video.pausado = true
    const ig = vi.fn()
    const d = deps({ candidatos: async () => [c], redes: { instagram: ig, facebook: vi.fn() } })
    await correrPublicador(d)
    expect(ig).not.toHaveBeenCalled()
  })

  it('si falla el guardado DESPUÉS de publicar, no lo marca fallido (la corrida siguiente lo reconoce en Meta)', async () => {
    let llamadas = 0
    const d = deps({
      candidatos: async () => [candidato('facebook')],
      guardar: async () => {
        llamadas++
        throw new Error('DB: se cortó')
      },
      redes: {
        instagram: vi.fn(),
        facebook: async () => ({ etapa: 'publicando', ids: { video_id: 'f1' }, estado: 'publicado', enlace: 'https://www.facebook.com/reel/1/' }),
      },
    })
    const r = await correrPublicador(d)
    expect(llamadas).toBe(1)
    expect(r.fallidos).toBe(0)
    expect(r.detalle.join(' ')).toMatch(/no se pudo guardar/)
  })

  it('la anotación previa se guarda con la etapa y sin tocar el estado', async () => {
    const d = deps({
      candidatos: async () => [candidato('facebook')],
      redes: {
        instagram: vi.fn(),
        facebook: async (_e, _p, ctx) => {
          await ctx.antes('video_comun_enviado')
          return { etapa: 'publicando', ids: { video_id: 'v' }, estado: 'en_curso' }
        },
      },
    })
    await correrPublicador(d)
    expect(d.guardados[0].cambios).toEqual({ etapa: 'video_comun_enviado', estado: 'en_curso' })
  })

  it('si lo cancelaron justo antes del pedido que publica, no se manda nada', async () => {
    const enviado = vi.fn()
    const d = deps({
      candidatos: async () => [candidato('facebook')],
      guardar: async () => false,
      redes: {
        instagram: vi.fn(),
        facebook: async (_e, _p, ctx) => {
          await ctx.antes('video_comun_enviado')
          enviado()
          return { etapa: 'publicando', ids: {}, estado: 'en_curso' }
        },
      },
    })
    await correrPublicador(d)
    expect(enviado).not.toHaveBeenCalled()
  })

  it('no se publica un video cuyo archivo ya se borró', async () => {
    const c = candidato('instagram')
    c.video.archivo_borrado_at = '2026-10-01T00:00:00Z'
    const ig = vi.fn()
    const d = deps({ candidatos: async () => [c], redes: { instagram: ig, facebook: vi.fn() } })
    await correrPublicador(d)
    expect(ig).not.toHaveBeenCalled()
    expect(String(d.guardados[0].cambios.ultimo_error)).toMatch(/se borró/)
  })

  it('un enlace que no es https no se guarda', async () => {
    const d = deps({
      candidatos: async () => [candidato('instagram')],
      redes: {
        instagram: async () => ({ etapa: 'contenedor', ids: {}, estado: 'publicado', enlace: 'javascript:alert(1)' }),
        facebook: vi.fn(),
      },
    })
    await correrPublicador(d)
    expect(d.guardados[0].cambios.enlace).toBeNull()
  })

  it('al quedarse sin tiempo deja el resto para la corrida siguiente', async () => {
    let t = AHORA.getTime()
    const d = deps({
      ahora: () => new Date(t),
      redes: {
        instagram: async () => {
          t += 20_000
          return { etapa: 'contenedor', ids: { creation_id: 'c' }, estado: 'en_curso' }
        },
        facebook: vi.fn(),
      },
    })
    const r = await correrPublicador(d)
    expect(r.avanzados).toBe(1)
    expect(d.redes.facebook).not.toHaveBeenCalled()
  })
})

describe('correrPublicador — cuidados de la revisión', () => {
  it('lo que la red anota durante la etapa (la sesión abierta) se guarda en el envío aunque después tire', async () => {
    const d = deps({
      candidatos: async () => [candidato('instagram')],
      redes: {
        instagram: async (_e, _p, ctx) => {
          await ctx.anotarIds?.('subiendo', { upload_url: 'U1' })
          throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
        },
      },
    })
    await correrPublicador(d)
    expect(d.guardados[0].cambios).toEqual({ etapa: 'subiendo', ids_externos: { upload_url: 'U1' }, estado: 'en_curso' })
  })

  it('un video que nunca arrancó y está atrasado más de un día no sale de golpe: queda para confirmar', async () => {
    const red = vi.fn()
    const c = candidato('instagram')
    c.video = { ...c.video, programado_para: new Date(AHORA.getTime() - 26 * 3600_000).toISOString() }
    const d = deps({ candidatos: async () => [c], redes: { instagram: red } })
    await correrPublicador(d)
    expect(red).not.toHaveBeenCalled()
    expect(d.guardados[0].cambios).toMatchObject({ estado: 'fallido', ultimo_error: expect.stringMatching(/más de un día.*Reintentar/) })
  })

  it('con Reintentar, el atrasado sale igual', async () => {
    const red = vi.fn(async () => ({ etapa: 'contenedor', ids: {}, estado: 'en_curso' as const, esperarMs: 0 }))
    const c = candidato('instagram')
    c.video = { ...c.video, programado_para: new Date(AHORA.getTime() - 26 * 3600_000).toISOString() }
    c.envio = { ...c.envio, ids_externos: { reintento: true } }
    await correrPublicador(deps({ candidatos: async () => [c], redes: { instagram: red } }))
    expect(red).toHaveBeenCalled()
  })

  it('cuando se acaban los reintentos, el mensaje no promete que se reintenta solo', async () => {
    const c = candidato('instagram')
    c.envio = { ...c.envio, intentos: 5 }
    const d = deps({
      candidatos: async () => [c],
      redes: {
        instagram: async () => {
          throw Object.assign(new Error('Instagram 503'), { httpStatus: 503 })
        },
      },
    })
    await correrPublicador(d)
    const g = d.guardados.at(-1)!.cambios
    expect(g.estado).toBe('fallido')
    expect(String(g.ultimo_error)).not.toMatch(/Se reintenta solo/)
    expect(String(g.ultimo_error)).toMatch(/Reintentar/)
  })
})

describe('correrPublicador — red sin conectar', () => {
  it('el envío espera con el motivo a la vista, sin gastar intentos ni llamar a la red', async () => {
    const youtube = vi.fn()
    const yt = candidato('instagram', 'yt1')
    yt.envio = { ...yt.envio, plataforma: 'youtube' }
    const d = deps({
      candidatos: async () => [yt],
      redes: { youtube },
      redPendiente: async (p) => (p === 'youtube' ? 'YouTube no está conectado. Conectalo en Ajustes de Publicaciones.' : null),
    })
    const r = await correrPublicador(d)
    expect(youtube).not.toHaveBeenCalled()
    expect(r.fallidos).toBe(0)
    const g = d.guardados.find((x) => x.id === 'yt1')!
    expect(g.cambios).toEqual({
      ultimo_error: 'YouTube no está conectado. Conectalo en Ajustes de Publicaciones.',
      proximo_intento: new Date(AHORA.getTime() + 10 * 60_000).toISOString(),
    })
  })

  it('YouTube recibe el título, el peso del archivo y un plazo para cortar a tiempo', async () => {
    const youtube = vi.fn(async () => ({ etapa: 'subiendo', ids: {}, estado: 'en_curso' as const, esperarMs: 0 }))
    const yt = candidato('instagram', 'yt2')
    yt.envio = { ...yt.envio, plataforma: 'youtube' }
    yt.video = { ...yt.video, titulo_youtube: 'Título', tamano_bytes: 1234 }
    await correrPublicador(deps({ candidatos: async () => [yt], redes: { youtube } }))
    const [, pieza, ctx] = youtube.mock.calls[0] as unknown as [unknown, { titulo: string; tamanoBytes: number }, { plazo: number }]
    expect(pieza).toMatchObject({ titulo: 'Título', tamanoBytes: 1234 })
    expect(ctx.plazo).toBeGreaterThan(AHORA.getTime())
  })
})

describe('correrPublicador — al publicar', () => {
  const publicado = async () => ({ etapa: 'contenedor', ids: { media_id: 'm1' }, estado: 'publicado' as const, enlace: null })
  const enCurso = async () => ({ etapa: 'iniciado', ids: {}, estado: 'en_curso' as const, esperarMs: 0 })

  it('avisa lo que salió (para conectar los comentarios), y solo eso', async () => {
    const alPublicar = vi.fn(async () => undefined)
    await correrPublicador(deps({ alPublicar, redes: { instagram: publicado, facebook: enCurso } }))
    expect(alPublicar).toHaveBeenCalledTimes(1)
    expect(alPublicar).toHaveBeenCalledWith(
      expect.objectContaining({ envio: expect.objectContaining({ plataforma: 'instagram' }) }),
      expect.objectContaining({ ids: { media_id: 'm1' } }),
    )
  })

  it('si conectar falla, el envío igual queda publicado y la corrida sigue', async () => {
    const d = deps({
      alPublicar: async () => {
        throw new Error('base caída')
      },
      redes: { instagram: publicado, facebook: publicado },
    })
    const r = await correrPublicador(d)
    expect(r.publicados).toBe(2)
    expect(d.guardados.filter((g) => g.cambios.estado === 'publicado')).toHaveLength(2)
  })

  it('si el guardado de "publicado" no se pudo escribir, no conecta todavía (la corrida siguiente lo reconoce)', async () => {
    const alPublicar = vi.fn(async () => undefined)
    await correrPublicador(
      deps({
        alPublicar,
        guardar: async () => {
          throw new Error('DB: caída')
        },
        redes: { instagram: publicado },
        candidatos: async () => [candidato('instagram')],
      }),
    )
    expect(alPublicar).not.toHaveBeenCalled()
  })
})
