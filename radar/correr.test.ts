import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CuentaARevisar } from './db'
import { candadoArchivo, correr, estadoTrasRevision, MAX_CLASIFICACIONES, MAX_CUENTAS_NUEVAS, MENSAJE_IA, MENSAJE_SESION, UMBRAL_FALLAS_IA, type ClienteIG, type DbRadar, type Deps } from './correr'
import { BloqueoInstagram, ErrorHttpInstagram } from './instagram/bloqueo'
import type { Analisis, Clasificacion, ConfigRadar, CuentaPerfil, ReelCrudo } from './tipos'

const AHORA = new Date('2026-11-28T12:00:00Z')
const CFG: ConfigRadar = {
  multiplicadorMin: 3,
  diasMax: 30,
  vistasMin: 20000,
  reelsBase: 24,
  diasMaduro: 3,
  puntajeMin: 6,
  topeDiario: 10,
  topeCuentas: 25,
  topeReels: 300,
}

const diasAtras = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString()

/** 8 reels maduros de 10.000 vistas (base 10.000) + los virales pedidos (×5 = 50.000). */
function reelsDe(usuario: string, virales: string[]): ReelCrudo[] {
  const r = (shortcode: string, vistas: number, dias: number): ReelCrudo => ({
    shortcode,
    pk: String(1000 + shortcode.length),
    cuenta: usuario,
    publicadoAt: diasAtras(dias),
    vistas,
    likes: 10,
    comentarios: 3,
    caption: 'texto',
    duracionSeg: 30,
    urlPortada: null,
    esReel: true,
  })
  return [
    ...virales.map((s, i) => r(s, 50000 + i * 1000, 1)), // jóvenes: no entran a la base
    ...Array.from({ length: 8 }, (_, i) => r(`${usuario}base${i}`, 10000, 6 + i)),
  ]
}

const cuenta = (usuario: string, extra: Partial<CuentaARevisar> = {}): CuentaARevisar => ({
  usuario,
  origen: 'semilla',
  rubro: 'inmobiliario',
  vecesRevisada: 0,
  destacados: 0,
  ultimaRevisionAt: null,
  creadaAt: null,
  ...extra,
})

const CLAS_OK: Clasificacion = { categoria: 'inmobiliario_ar', tema: 'creditos', puntaje: 8, razon: 'sirve' }
const AN: Analisis = { tema: 't', gancho: 'g', formato: 'f', por_que: 'p', comentarios_analisis: 'c', adaptacion_diego: 'a', transcripcion: '' }

function armar(o: {
  cuentas?: CuentaARevisar[]
  reels?: Record<string, string[]>
  vistos?: string[]
  existentes?: string[]
  yaCorrio?: boolean
} = {}) {
  const reels = o.reels ?? { ana: ['V1', 'V2'], beto: ['V3'] }
  const cliente = {
    perfil: vi.fn(async (u: string): Promise<CuentaPerfil> => ({ usuario: u, igUserId: `id-${u}`, seguidores: 1000 })),
    reelsDeCuenta: vi.fn(async (p: CuentaPerfil) => reelsDe(p.usuario, reels[p.usuario] ?? [])),
    buscarCuentas: vi.fn(async () => [] as string[]),
    explorar: vi.fn(async () => [] as ReelCrudo[]),
    comentarios: vi.fn(async () => ['un comentario']),
    cookiesNetscape: vi.fn(async () => undefined),
    cerrar: vi.fn(async () => undefined),
  } satisfies ClienteIG
  const db = {
    leerConfig: vi.fn<DbRadar['leerConfig']>(async () => CFG),
    crearCorrida: vi.fn<DbRadar['crearCorrida']>(async () => 'run-1'),
    cerrarCorrida: vi.fn<DbRadar['cerrarCorrida']>(async () => undefined),
    yaCorrioHoy: vi.fn<DbRadar['yaCorrioHoy']>(async () => o.yaCorrio ?? false),
    cuentasParaRevisar: vi.fn<DbRadar['cuentasParaRevisar']>(async () => o.cuentas ?? [cuenta('ana'), cuenta('beto')]),
    cuentasConocidas: vi.fn<DbRadar['cuentasConocidas']>(async () => new Set<string>()),
    registrarCuentas: vi.fn<DbRadar['registrarCuentas']>(async () => undefined),
    actualizarCuenta: vi.fn<DbRadar['actualizarCuenta']>(async () => undefined),
    anotarFalloCuenta: vi.fn<DbRadar['anotarFalloCuenta']>(async () => undefined),
    marcarCuentaInmobiliaria: vi.fn<DbRadar['marcarCuentaInmobiliaria']>(async () => undefined),
    busquedasDeHoy: vi.fn<DbRadar['busquedasDeHoy']>(async () => [] as string[]),
    vistos: vi.fn<DbRadar['vistos']>(async () => new Set(o.vistos ?? [])),
    marcarVisto: vi.fn<DbRadar['marcarVisto']>(async () => undefined),
    semanaPublicada: vi.fn<DbRadar['semanaPublicada']>(async () => ({ inmobiliarias: 0, otras: 0 })),
    ejemplosNoSirve: vi.fn<DbRadar['ejemplosNoSirve']>(async () => [] as string[]),
    refsExistentes: vi.fn<DbRadar['refsExistentes']>(async () => new Set(o.existentes ?? [])),
    upsertVideoRef: vi.fn<DbRadar['upsertVideoRef']>(async () => 'insertada'),
  }
  const borrados: string[] = []
  const candado = { tomar: vi.fn(() => true), soltar: vi.fn() }
  const deps = {
    db,
    abrirCliente: vi.fn(async () => cliente),
    pausaEntreCuentas: vi.fn(async () => undefined),
    clasificar: vi.fn<Deps['clasificar']>(async () => CLAS_OK),
    analizar: vi.fn<Deps['analizar']>(async () => AN),
    extraerFrames: vi.fn<Deps['extraerFrames']>(async () => ['/f/1.jpg']),
    transcribir: vi.fn<Deps['transcribir']>(async () => 'hola'),
    bajarYSubir: vi.fn<Deps['bajarYSubir']>(async (codigo) => ({
      videoPath: `radar/${codigo}.mp4`,
      portadaPath: null,
      mp4Local: `/tmp-radar/medios-${codigo}/video.mp4`,
    })),
    limpiarRetencion: vi.fn<Deps['limpiarRetencion']>(async () => 0),
    candado,
    rutaTmp: mkdtempSync(join(tmpdir(), 'radar-correr-')),
    ahora: () => AHORA,
    log: vi.fn(),
    borrar: vi.fn((r: string) => void borrados.push(r)),
  }
  return { deps: deps as unknown as Deps, d: deps, db, cliente, borrados }
}

const OPTS = { seco: false, forzar: false, version: 'abc123' }

describe('correr', () => {
  it('camino feliz: publica los candidatos, cierra ok y limpia', async () => {
    const { deps, db, d } = armar()
    const r = await correr(OPTS, deps)
    expect(r).toEqual({ estado: 'ok', publicadas: 3 })
    expect(db.crearCorrida).toHaveBeenCalledWith('abc123')
    expect(db.upsertVideoRef).toHaveBeenCalledTimes(3)
    expect(db.marcarVisto).toHaveBeenCalledTimes(3)
    expect(db.marcarVisto.mock.calls.every((c) => c[0].resultado === 'publicado')).toBe(true)
    expect(d.limpiarRetencion).toHaveBeenCalled()
    expect(db.cerrarCorrida).toHaveBeenCalledWith('run-1', 'ok', null, expect.objectContaining({ cuentas_revisadas: 2, publicadas: 3, candidatos: 3 }), null)
    expect(d.candado.soltar).toHaveBeenCalled()
  })

  it('(a) un freno de Instagram en reelsDeCuenta cierra frenada_por_instagram y no clasifica', async () => {
    const { deps, db, d, cliente } = armar()
    cliente.reelsDeCuenta.mockImplementationOnce(async () => {
      throw new BloqueoInstagram('desafio', 'challenge')
    })
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('frenada_por_instagram')
    expect(d.clasificar).not.toHaveBeenCalled()
    expect(cliente.perfil).toHaveBeenCalledTimes(1) // no siguió con la segunda cuenta
    expect(db.cerrarCorrida).toHaveBeenCalledWith('run-1', 'frenada_por_instagram', 'medir', expect.anything(), 'challenge')
    expect(cliente.cerrar).toHaveBeenCalled()
  })

  it('sesión vencida → error en el paso "sesion" con el mensaje para correr login', async () => {
    const { deps, db, d } = armar()
    d.abrirCliente.mockRejectedValueOnce(new BloqueoInstagram('login', 'sin sesión'))
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('error')
    expect(db.cerrarCorrida).toHaveBeenCalledWith('run-1', 'error', 'sesion', expect.anything(), MENSAJE_SESION)
  })

  it('(b) un error de IA en un reel lo marca error y la corrida queda parcial con los demás publicados', async () => {
    const { deps, db, d } = armar()
    d.analizar.mockImplementation(async (_i, reel) => {
      if (reel.shortcode === 'V2') throw new Error('La respuesta no es JSON')
      return AN
    })
    const r = await correr(OPTS, deps)
    expect(r).toEqual({ estado: 'parcial', publicadas: 2 })
    const v2 = db.marcarVisto.mock.calls.map((c) => c[0]).find((v) => v.shortcode === 'V2')
    expect(v2?.resultado).toBe('error')
    expect(v2?.motivo).toContain('JSON')
    expect(db.cerrarCorrida).toHaveBeenCalledWith('run-1', 'parcial', 'publicar', expect.anything(), expect.stringContaining('V2'))
  })

  it('un error de IA al clasificar marca el reel error y sigue', async () => {
    const { deps, db, d } = armar()
    d.clasificar.mockImplementation(async (reel) => {
      if (reel.shortcode === 'V1') throw new Error('Categoría inválida')
      return CLAS_OK
    })
    const r = await correr(OPTS, deps)
    expect(r).toEqual({ estado: 'parcial', publicadas: 2 })
    expect(db.marcarVisto).toHaveBeenCalledWith(expect.objectContaining({ shortcode: 'V1', resultado: 'error' }))
  })

  it('si analizar falla, igual se borran los cuadros y el video local', async () => {
    const { deps, d, borrados } = armar({ reels: { ana: ['V1'] }, cuentas: [cuenta('ana')] })
    d.analizar.mockRejectedValue(new Error('timeout'))
    await correr(OPTS, deps)
    expect(borrados).toContain(join(d.rutaTmp, 'frames-V1'))
    expect(borrados).toContain('/tmp-radar/medios-V1')
    expect(borrados.some((b) => b.includes('cookies-'))).toBe(true) // y el archivo de cookies al final
  })

  it('(c) si ya corrió hoy y no se fuerza, no abre el navegador', async () => {
    const { deps, d, db } = armar({ yaCorrio: true })
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('ya_corrio_hoy')
    expect(d.abrirCliente).not.toHaveBeenCalled()
    expect(db.crearCorrida).not.toHaveBeenCalled()
    expect(d.candado.soltar).toHaveBeenCalled()
  })

  it('con --forzar corre aunque ya haya corrido hoy', async () => {
    const { deps, d } = armar({ yaCorrio: true })
    await correr({ ...OPTS, forzar: true }, deps)
    expect(d.abrirCliente).toHaveBeenCalled()
  })

  it('candado tomado por otra corrida viva → sale sin hacer nada', async () => {
    const { deps, d, db } = armar()
    d.candado.tomar.mockReturnValue(false)
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('ocupado')
    expect(db.yaCorrioHoy).not.toHaveBeenCalled()
    expect(d.candado.soltar).not.toHaveBeenCalled()
  })

  it('(d) un reel ya visto no se clasifica', async () => {
    const { deps, d } = armar({ vistos: ['V2'] })
    await correr(OPTS, deps)
    const clasificados = d.clasificar.mock.calls.map((c) => c[0].shortcode)
    expect(clasificados).toEqual(expect.arrayContaining(['V1', 'V3']))
    expect(clasificados).not.toContain('V2')
  })

  it('un reel que ya está en Referencias solo refresca métricas, sin IA', async () => {
    const { deps, d, db } = armar({ existentes: ['V1'] })
    await correr(OPTS, deps)
    expect(d.clasificar.mock.calls.map((c) => c[0].shortcode)).not.toContain('V1')
    const filaV1 = db.upsertVideoRef.mock.calls.map((c) => c[0]).find((f) => f.ig_shortcode === 'V1')
    expect(filaV1).toBeDefined()
    expect(Object.keys(filaV1!).sort()).toEqual(['baseline_cuenta', 'comentarios', 'ig_shortcode', 'likes', 'multiplicador', 'seguidores', 'vistas'])
    expect(d.bajarYSubir).not.toHaveBeenCalledWith('V1', expect.anything())
  })

  it(`respeta el tope de ${MAX_CLASIFICACIONES} clasificaciones y no marca vistos los que quedan afuera`, async () => {
    const virales = Array.from({ length: 50 }, (_, i) => `X${i}`)
    const { deps, d, db } = armar({ reels: { ana: virales }, cuentas: [cuenta('ana')] })
    d.clasificar.mockResolvedValue({ categoria: 'no_sirve', tema: 'otro', puntaje: 1, razon: 'no' } as Clasificacion)
    await correr(OPTS, deps)
    expect(d.clasificar).toHaveBeenCalledTimes(MAX_CLASIFICACIONES)
    expect(db.marcarVisto).toHaveBeenCalledTimes(MAX_CLASIFICACIONES)
    // Se clasifican primero los de mayor multiplicador.
    expect(d.clasificar.mock.calls[0][0].shortcode).toBe('X49')
  })

  it('topes de prueba: 2 cuentas y 3 clasificaciones', async () => {
    const { deps, d, cliente } = armar({
      cuentas: [cuenta('ana'), cuenta('beto'), cuenta('caro')],
      reels: { ana: ['A1', 'A2', 'A3'], beto: ['B1'], caro: ['C1'] },
    })
    await correr({ ...OPTS, prueba: { cuentas: 2, clasificaciones: 3, terminos: 2 } }, deps)
    expect(cliente.perfil).toHaveBeenCalledTimes(2)
    expect(d.clasificar).toHaveBeenCalledTimes(3)
  })

  it('no_sirve y puntaje bajo quedan vistos con su motivo y no se publican', async () => {
    const { deps, d, db } = armar()
    d.clasificar.mockImplementation(async (reel) =>
      reel.shortcode === 'V1'
        ? ({ categoria: 'no_sirve', tema: 'otro', puntaje: 2, razon: 'baile' }) as Clasificacion
        : reel.shortcode === 'V2'
          ? { ...CLAS_OK, puntaje: 4 }
          : CLAS_OK,
    )
    const r = await correr(OPTS, deps)
    expect(r.publicadas).toBe(1)
    expect(db.marcarVisto).toHaveBeenCalledWith(expect.objectContaining({ shortcode: 'V1', resultado: 'descartado_relevancia', motivo: 'baile' }))
    expect(db.marcarVisto).toHaveBeenCalledWith(expect.objectContaining({ shortcode: 'V2', resultado: 'bajo_umbral' }))
  })

  it('(e) en seco no escribe en Supabase ni sube nada', async () => {
    const { deps, d, db } = armar()
    const r = await correr({ ...OPTS, seco: true }, deps)
    expect(r.estado).toBe('ok')
    expect(db.upsertVideoRef).not.toHaveBeenCalled()
    expect(d.bajarYSubir).not.toHaveBeenCalled()
    for (const f of ['crearCorrida', 'cerrarCorrida', 'registrarCuentas', 'actualizarCuenta', 'marcarVisto', 'marcarCuentaInmobiliaria'] as const) {
      expect(db[f]).not.toHaveBeenCalled()
    }
    expect(d.limpiarRetencion).not.toHaveBeenCalled()
    expect(db.busquedasDeHoy).toHaveBeenCalledWith(expect.any(Number), false) // no avanza el cursor
    expect(d.log.mock.calls.some((c) => String(c[0]).includes('PUBLICARÍA V1'))).toBe(true)
  })

  it('en seco mide las cuentas descubiertas aunque no estén en la base', async () => {
    const { deps, db, cliente } = armar({ cuentas: [], reels: { nueva: ['N1'] } })
    db.busquedasDeHoy.mockResolvedValue(['alquileres'])
    cliente.buscarCuentas.mockResolvedValue(['@Nueva'])
    await correr({ ...OPTS, seco: true }, deps)
    expect(cliente.perfil).toHaveBeenCalledWith('nueva')
  })

  it('descubre: hasta 5 cuentas nuevas por término y los autores de explorar', async () => {
    const { deps, db, cliente } = armar()
    db.busquedasDeHoy.mockResolvedValue(['alquileres'])
    cliente.buscarCuentas.mockResolvedValue(['a1', 'a2', 'conocida', 'a3', 'a4', 'a5', 'a6'])
    db.cuentasConocidas.mockResolvedValue(new Set(['conocida']))
    const [fuerte, flojo] = reelsDe('expl', ['E1']).slice(0, 2) // 51.000 y 10.000 vistas
    cliente.explorar.mockResolvedValue([fuerte, { ...flojo, cuenta: 'floja' }])
    await correr(OPTS, deps)
    expect(db.busquedasDeHoy).toHaveBeenCalledWith(6, true)
    expect(db.registrarCuentas).toHaveBeenCalledWith(['a1', 'a2', 'a3', 'a4', 'a5'], 'busqueda')
    // De explorar solo el autor con un reel de ≥ vistasMin (20.000).
    expect(db.registrarCuentas).toHaveBeenCalledWith(['expl'], 'explorar')
  })

  it(`registra como mucho ${MAX_CUENTAS_NUEVAS} cuentas nuevas por corrida (búsquedas + explorar)`, async () => {
    const { deps, db, cliente } = armar()
    db.busquedasDeHoy.mockResolvedValue(['t1', 't2', 't3', 't4', 't5', 't6'])
    let n = 0
    cliente.buscarCuentas.mockImplementation(async () => Array.from({ length: 15 }, () => `u${n++}`))
    cliente.explorar.mockResolvedValue(reelsDe('expl', ['E1']).slice(0, 1))
    await correr(OPTS, deps)
    const registradas = db.registrarCuentas.mock.calls.flatMap((c) => c[0])
    expect(registradas).toHaveLength(MAX_CUENTAS_NUEVAS)
    expect(cliente.buscarCuentas).toHaveBeenCalledTimes(3) // 5 + 5 + 5: corta ahí
    expect(cliente.explorar).not.toHaveBeenCalled()
    expect(db.registrarCuentas).not.toHaveBeenCalledWith(expect.anything(), 'explorar')
  })

  it('una cuenta descubierta clasificada como inmobiliaria pasa a rubro inmobiliario', async () => {
    const { deps, db } = armar({ cuentas: [cuenta('ana', { origen: 'explorar', rubro: 'otro' })], reels: { ana: ['V1'] } })
    await correr(OPTS, deps)
    expect(db.marcarCuentaInmobiliaria).toHaveBeenCalledWith('ana')
  })

  it('(f) el navegador se cierra y el candado se suelta aunque falle algo inesperado', async () => {
    const { deps, db, d, cliente } = armar()
    db.semanaPublicada.mockRejectedValue(new Error('se cayó Supabase'))
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('error')
    expect(db.cerrarCorrida).toHaveBeenCalledWith('run-1', 'error', 'mezcla', expect.anything(), 'se cayó Supabase')
    expect(cliente.cerrar).toHaveBeenCalled()
    expect(d.candado.soltar).toHaveBeenCalled()
  })

  it('(g) la cuarta revisión sin destacados de una cuenta descubierta la desactiva', async () => {
    const { deps, db } = armar({
      cuentas: [cuenta('ana', { origen: 'busqueda', rubro: 'otro', vecesRevisada: 3, destacados: 0 })],
      reels: { ana: [] },
    })
    await correr(OPTS, deps)
    expect(db.actualizarCuenta).toHaveBeenCalledWith('ana', expect.anything(), expect.anything(), { vecesRevisada: 4, destacados: 0, activa: false })
  })
})

describe('correr: fallas de la IA y de cuentas', () => {
  const muchos = { ana: ['V1', 'V2', 'V3'], beto: ['V4', 'V5'] }

  it(`cortacircuito: ${UMBRAL_FALLAS_IA} fallas seguidas de clasificar cortan la clasificación y no se publica nada`, async () => {
    const { deps, db, d } = armar({ reels: muchos })
    d.clasificar.mockRejectedValue(new Error('claude: exit 1'))
    await correr(OPTS, deps)
    expect(d.clasificar).toHaveBeenCalledTimes(UMBRAL_FALLAS_IA)
    expect(db.upsertVideoRef).not.toHaveBeenCalled()
    // Solo se marcan error los que fallaron; los demás quedan para la próxima corrida.
    expect(db.marcarVisto).toHaveBeenCalledTimes(UMBRAL_FALLAS_IA)
  })

  it('si hubo candidatos y TODAS las llamadas a la IA fallaron, cierra error en el paso "ia" (avisa el vigilante)', async () => {
    const { deps, db, d } = armar({ reels: muchos })
    d.clasificar.mockRejectedValue(new Error('claude: exit 1'))
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('error')
    expect(db.cerrarCorrida).toHaveBeenCalledWith('run-1', 'error', 'ia', expect.anything(), expect.stringContaining(MENSAJE_IA))
  })

  it('una falla pasajera de la IA no corta nada: parcial con el resto publicado', async () => {
    const { deps, db, d } = armar({ reels: muchos })
    d.clasificar.mockRejectedValueOnce(new Error('timeout'))
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('parcial')
    expect(d.clasificar).toHaveBeenCalledTimes(5)
    expect(db.upsertVideoRef).toHaveBeenCalledTimes(4)
  })

  it('analizar falla 3 veces seguidas: la publicación se corta (los demás quedan para mañana)', async () => {
    const { deps, db, d } = armar({ reels: muchos })
    d.analizar.mockRejectedValue(new Error('claude: límite'))
    const r = await correr(OPTS, deps)
    expect(d.analizar).toHaveBeenCalledTimes(UMBRAL_FALLAS_IA)
    expect(d.bajarYSubir).toHaveBeenCalledTimes(UMBRAL_FALLAS_IA)
    expect(db.upsertVideoRef).not.toHaveBeenCalled()
    // clasificar sí anduvo: no es "IA muerta", es parcial.
    expect(r.estado).toBe('parcial')
  })

  it('si marcarCuentaInmobiliaria falla, el reel se publica igual', async () => {
    const { deps, db } = armar({ cuentas: [cuenta('ana', { origen: 'explorar', rubro: 'otro' })], reels: { ana: ['V1'] } })
    db.marcarCuentaInmobiliaria.mockRejectedValue(new Error('se cayó Supabase'))
    const r = await correr(OPTS, deps)
    expect(r).toEqual({ estado: 'ok', publicadas: 1 })
  })

  it('3 cuentas seguidas con 401/403 → error en paso "sesion" y no se anota la falla de esas cuentas', async () => {
    const { deps, db, cliente } = armar({ cuentas: [cuenta('a'), cuenta('b'), cuenta('c'), cuenta('d')] })
    cliente.perfil.mockRejectedValue(new ErrorHttpInstagram(401, 'forma inesperada: perfil (HTTP 401)'))
    const r = await correr(OPTS, deps)
    expect(r.estado).toBe('error')
    expect(db.cerrarCorrida).toHaveBeenCalledWith('run-1', 'error', 'sesion', expect.anything(), MENSAJE_SESION)
    expect(db.anotarFalloCuenta).not.toHaveBeenCalled()
    expect(cliente.perfil).toHaveBeenCalledTimes(3)
  })

  it('2 × 401, un éxito y otro 401 → no escala (el éxito reinicia la cuenta)', async () => {
    const { deps, db, cliente } = armar({ cuentas: [cuenta('a'), cuenta('b'), cuenta('c'), cuenta('d')] })
    const perfilOk = cliente.perfil.getMockImplementation()!
    cliente.perfil
      .mockRejectedValueOnce(new ErrorHttpInstagram(401, 'x'))
      .mockRejectedValueOnce(new ErrorHttpInstagram(403, 'x'))
      .mockImplementationOnce(perfilOk)
      .mockRejectedValueOnce(new ErrorHttpInstagram(401, 'x'))
    const r = await correr(OPTS, deps)
    expect(r.estado).not.toBe('error')
    expect(cliente.perfil).toHaveBeenCalledTimes(4)
  })

  it('una cuenta que falla igual cuenta como revisada (no queda primera en la cola)', async () => {
    const { deps, db, cliente } = armar({ cuentas: [cuenta('ana', { origen: 'busqueda', rubro: 'otro', vecesRevisada: 1 })] })
    cliente.perfil.mockRejectedValueOnce(new Error('forma inesperada'))
    await correr(OPTS, deps)
    expect(db.anotarFalloCuenta).toHaveBeenCalledWith('ana', { vecesRevisada: 2, destacados: 0, activa: true })
  })

  it('una descubierta que falla por cuarta vez sin destacados se desactiva; una semilla nunca', async () => {
    const { deps, db, cliente } = armar({
      cuentas: [cuenta('ana', { origen: 'explorar', rubro: 'otro', vecesRevisada: 3 }), cuenta('semi', { vecesRevisada: 9 })],
    })
    cliente.perfil.mockRejectedValue(new Error('forma inesperada'))
    await correr(OPTS, deps)
    expect(db.anotarFalloCuenta).toHaveBeenCalledWith('ana', { vecesRevisada: 4, destacados: 0, activa: false })
    expect(db.anotarFalloCuenta).toHaveBeenCalledWith('semi', { vecesRevisada: 10, destacados: 0, activa: true })
  })

  it('en seco una cuenta que falla no escribe nada', async () => {
    const { deps, db, cliente } = armar({ cuentas: [cuenta('ana')] })
    cliente.perfil.mockRejectedValueOnce(new Error('x'))
    await correr({ ...OPTS, seco: true }, deps)
    expect(db.anotarFalloCuenta).not.toHaveBeenCalled()
  })
})

describe('estadoTrasRevision', () => {
  const med = (n: number) => ({ base: 1, baseN: 6, candidatos: Array(n).fill({}), descartados: [] }) as never
  it('una semilla nunca se desactiva sola', () => {
    expect(estadoTrasRevision(cuenta('s', { vecesRevisada: 10 }), med(0)).activa).toBe(true)
  })
  it('una descubierta con algún destacado sigue activa', () => {
    expect(estadoTrasRevision(cuenta('d', { origen: 'explorar', vecesRevisada: 5, destacados: 1 }), med(0)).activa).toBe(true)
  })
  it('a la tercera revisión todavía no se desactiva', () => {
    expect(estadoTrasRevision(cuenta('d', { origen: 'busqueda', vecesRevisada: 2 }), med(0))).toEqual({ vecesRevisada: 3, destacados: 0, activa: true })
  })
})

describe('candadoArchivo', () => {
  it('toma, rechaza un segundo dueño vivo, y toma un candado de un pid muerto', () => {
    const ruta = join(mkdtempSync(join(tmpdir(), 'radar-lock-')), 'radar.lock')
    const c = candadoArchivo(ruta)
    expect(c.tomar()).toBe(true)
    expect(readFileSync(ruta, 'utf8')).toBe(String(process.pid))
    c.soltar()
    expect(existsSync(ruta)).toBe(false)

    writeFileSync(ruta, String(process.ppid)) // el padre de este proceso vive
    expect(c.tomar()).toBe(false)

    writeFileSync(ruta, '999999') // pid que no existe
    expect(c.tomar()).toBe(true)
    expect(readFileSync(ruta, 'utf8')).toBe(String(process.pid))
  })
})
