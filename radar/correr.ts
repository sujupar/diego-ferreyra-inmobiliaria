// La corrida diaria del radar, de punta a punta:
// candado → ¿ya corrió hoy? → corrida → Instagram → descubrir cuentas → medir cada cuenta
// contra su mediana → clasificar candidatos con IA → mezcla 80/20 → bajar/subir + análisis
// a fondo → video_refs → limpieza de retención → cerrar la corrida.
//
// Reglas que manda este archivo (no los módulos de abajo):
// - Un freno de Instagram (BloqueoInstagram) para TODO, en cualquier paso. No se reintenta.
// - Un reel que falla (descarga, JSON de la IA, subida) queda `error` en radar_vistos y la
//   corrida sigue; al final queda `parcial`.
// - Presupuesto de IA del plan de Julian: como mucho MAX_CLASIFICACIONES por corrida; los
//   candidatos que no entran NO se marcan vistos (los mira la corrida siguiente).
// - En seco no se escribe NADA en Supabase ni se sube nada: solo se imprime lo que haría.
// - Siempre se cierra el navegador, se borra el archivo de cookies y se suelta el candado.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import * as dbReal from './db'
import type { CuentaARevisar, EstadoCuenta } from './db'
import { COLUMNAS_METRICAS } from './db'
import { armarFilaVideoRef } from './filas'
import { BloqueoInstagram } from './instagram/bloqueo'
import { medirCuenta } from './medicion'
import { elegirPublicables, type Aprobado } from './mezcla'
import type { Analisis, Clasificacion, CuentaPerfil, MedicionCuenta, ReelCrudo } from './tipos'

/** Tope de llamadas a `clasificar` por corrida (presupuesto del plan de Claude de Julian). */
export const MAX_CLASIFICACIONES = 40
/** Términos de búsqueda por corrida (rotan día a día). */
export const MAX_TERMINOS = 6
/** Cuentas nuevas que se toman de cada término. */
export const CUENTAS_POR_TERMINO = 5
/**
 * Tope de cuentas NUEVAS registradas por corrida (búsquedas + explorar). Sin esto entraban
 * ~45–60 por día contra 25 revisadas: la cola crecía sin fin y nunca se vaciaba.
 */
export const MAX_CUENTAS_NUEVAS = 15
/** Cuántos resultados se piden a la búsqueda para quedarse con 5 que no conozcamos. */
const RESULTADOS_BUSQUEDA = 15
const REELS_EXPLORAR = 30
const COMENTARIOS_POR_REEL = 20
const FRAMES_POR_REEL = 8
/** Una cuenta descubierta que en estas revisiones no dio ningún destacado deja de revisarse. */
export const REVISIONES_SIN_DESTACADOS = 4

export const MENSAJE_SESION = 'La sesión de Instagram venció: corré `radar login`'
/** run_id de mentira para la corrida en seco (nunca se escribe). */
const RUN_SECO = '00000000-0000-0000-0000-000000000000'

// ---------- dependencias (inyectables para las pruebas) ----------

/** Lo que la corrida usa del cliente de Instagram. */
export interface ClienteIG {
  perfil(usuario: string): Promise<CuentaPerfil>
  reelsDeCuenta(perfil: CuentaPerfil, n: number): Promise<ReelCrudo[]>
  buscarCuentas(termino: string, n: number): Promise<string[]>
  explorar(n: number): Promise<ReelCrudo[]>
  comentarios(pk: string, n: number): Promise<string[]>
  cookiesNetscape(destino: string): Promise<void>
  cerrar(): Promise<void>
}

export type DbRadar = Pick<
  typeof dbReal,
  | 'leerConfig'
  | 'crearCorrida'
  | 'cerrarCorrida'
  | 'yaCorrioHoy'
  | 'cuentasParaRevisar'
  | 'cuentasConocidas'
  | 'registrarCuentas'
  | 'actualizarCuenta'
  | 'marcarCuentaInmobiliaria'
  | 'busquedasDeHoy'
  | 'vistos'
  | 'marcarVisto'
  | 'semanaPublicada'
  | 'ejemplosNoSirve'
  | 'refsExistentes'
  | 'upsertVideoRef'
>

export interface Candado {
  /** true si se tomó; false si otra corrida viva lo tiene. */
  tomar(): boolean
  soltar(): void
}

export interface Deps {
  db: DbRadar
  abrirCliente(): Promise<ClienteIG>
  pausaEntreCuentas(): Promise<void>
  clasificar(reel: ReelCrudo, perfil: CuentaPerfil, comentarios: string[], ejemplosNoSirve: string[]): Promise<Clasificacion>
  analizar(
    insumos: { frames: string[]; transcripcion: string },
    reel: ReelCrudo & { multiplicador: number },
    base: number,
    perfil: CuentaPerfil,
    comentarios: string[],
  ): Promise<Analisis>
  extraerFrames(mp4: string, destino: string, n?: number): Promise<string[]>
  transcribir(mp4: string, destino: string): Promise<string>
  bajarYSubir(shortcode: string, cookiesPath: string): Promise<{ videoPath: string; portadaPath: string | null; mp4Local: string }>
  limpiarRetencion(): Promise<number>
  candado: Candado
  /** Carpeta de temporales del radar (~/.radar-referencias/tmp). */
  rutaTmp: string
  ahora(): Date
  log(msg: string): void
  borrar(ruta: string): void
}

export interface OpcionesCorrida {
  seco: boolean
  forzar: boolean
  /** git short sha de la versión que corre ('?' si no se pudo leer). */
  version?: string
  /** Topes chicos para probar en vivo sin gastar la cuenta ni el plan (RADAR_TOPE_CUENTAS_PRUEBA). */
  prueba?: { cuentas: number; clasificaciones: number; terminos: number }
}

export type EstadoCorrida = 'ok' | 'parcial' | 'frenada_por_instagram' | 'error' | 'ya_corrio_hoy' | 'ocupado'

// ---------- helpers puros ----------

const sinArroba = (u: string) => u.replace(/^@/, '').trim().toLowerCase()
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const esInmobiliario = (c: Clasificacion) => c.categoria === 'inmobiliario_ar' || c.categoria === 'inmobiliario_otro_pais'

/**
 * Cómo queda la cuenta después de esta revisión. Una DESCUBIERTA (búsqueda/explorar) que
 * en 4 revisiones no dio ni un destacado se desactiva; las semillas nunca se apagan solas.
 */
export function estadoTrasRevision(c: CuentaARevisar, med: MedicionCuenta): EstadoCuenta {
  const vecesRevisada = c.vecesRevisada + 1
  const destacados = c.destacados + med.candidatos.length
  const descubierta = c.origen === 'busqueda' || c.origen === 'explorar'
  const activa = !(descubierta && vecesRevisada >= REVISIONES_SIN_DESTACADOS && destacados === 0)
  return { vecesRevisada, destacados, activa }
}

/** Fila con SOLO las métricas (mismo formato que la fila completa) para refrescar una referencia existente. */
export function filaMetricas(
  reel: ReelCrudo & { multiplicador: number },
  base: number,
  baseN: number,
  perfil: CuentaPerfil,
): Record<string, unknown> {
  const clasVacia: Clasificacion = { categoria: 'formato_otro_rubro', tema: 'otro', puntaje: 0, razon: '' }
  const anVacio: Analisis = { tema: '', gancho: '', formato: '', por_que: '', comentarios_analisis: '', adaptacion_diego: '', transcripcion: '' }
  const completa = armarFilaVideoRef(reel, base, baseN, perfil, clasVacia, anVacio, { videoPath: null, portadaPath: null }, RUN_SECO)
  const out: Record<string, unknown> = { ig_shortcode: completa.ig_shortcode }
  for (const c of COLUMNAS_METRICAS) out[c] = completa[c]
  return out
}

/** Candado con pid: si el archivo existe pero ese proceso ya no vive, se toma igual. */
export function candadoArchivo(ruta: string): Candado {
  const vive = (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === 'EPERM'
    }
  }
  return {
    tomar() {
      mkdirSync(dirname(ruta), { recursive: true })
      try {
        writeFileSync(ruta, String(process.pid), { flag: 'wx' })
        return true
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        const pid = Number(readFileSync(ruta, 'utf8').trim())
        if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && vive(pid)) return false
        writeFileSync(ruta, String(process.pid)) // candado viejo de una corrida muerta
        return true
      }
    },
    soltar() {
      try {
        if (existsSync(ruta) && readFileSync(ruta, 'utf8').trim() === String(process.pid)) rmSync(ruta, { force: true })
      } catch {
        // soltar nunca tira: está en el finally
      }
    },
  }
}

// ---------- la corrida ----------

type Candidato = {
  reel: ReelCrudo & { multiplicador: number }
  base: number
  baseN: number
  perfil: CuentaPerfil
  cuenta: CuentaARevisar
}

type AprobadoCompleto = Candidato & { clas: Clasificacion; comentarios: string[] }

export async function correr(
  opts: OpcionesCorrida,
  deps: Deps = depsReales(),
): Promise<{ estado: EstadoCorrida; publicadas: number }> {
  const { db, log } = deps
  const seco = opts.seco
  if (!deps.candado.tomar()) {
    log('Hay otra corrida del radar en curso: salgo sin hacer nada.')
    return { estado: 'ocupado', publicadas: 0 }
  }

  const cont: dbReal.Contadores = { cuentas_revisadas: 0, reels_mirados: 0, candidatos: 0, publicadas: 0 }
  const errores: string[] = []
  /** Paso del primer error de reel/cuenta: es el que queda anotado en una corrida parcial. */
  let pasoError: string | null = null
  const anotar = (texto: string) => {
    errores.push(texto)
    pasoError ??= paso
  }
  let paso = 'inicio'
  let runId = RUN_SECO
  let corridaAbierta = false
  let cliente: ClienteIG | null = null
  let cookies: string | null = null

  try {
    if (!opts.forzar && (await db.yaCorrioHoy())) {
      log('El radar ya corrió hoy: salgo (usá --forzar para correr igual).')
      return { estado: 'ya_corrio_hoy', publicadas: 0 }
    }
    if (!seco) {
      runId = await db.crearCorrida(opts.version ?? '?')
      corridaAbierta = true
    }
    paso = 'config'
    const cfg = await db.leerConfig()
    const topeCuentas = Math.min(cfg.topeCuentas, opts.prueba?.cuentas ?? Infinity)
    const topeClasif = Math.min(MAX_CLASIFICACIONES, opts.prueba?.clasificaciones ?? Infinity)
    const topeTerminos = Math.min(MAX_TERMINOS, opts.prueba?.terminos ?? Infinity)
    if (seco) log('— CORRIDA EN SECO: no se escribe nada en Supabase ni se sube nada —')

    paso = 'sesion'
    cliente = await deps.abrirCliente()

    // ---- descubrir ----
    paso = 'descubrir'
    const nuevas: Array<{ usuario: string; origen: 'busqueda' | 'explorar' }> = []
    const sumarNuevas = async (usuarios: string[], origen: 'busqueda' | 'explorar', max: number) => {
      const limpios = [...new Set(usuarios.map(sinArroba).filter(Boolean))]
      const conocidas = await db.cuentasConocidas(limpios)
      const cupo = Math.max(0, MAX_CUENTAS_NUEVAS - nuevas.length)
      const libres = limpios.filter((u) => !conocidas.has(u) && !nuevas.some((n) => n.usuario === u)).slice(0, Math.min(max, cupo))
      nuevas.push(...libres.map((usuario) => ({ usuario, origen })))
      return libres
    }
    const terminos = await db.busquedasDeHoy(topeTerminos, !seco)
    for (const [i, termino] of terminos.entries()) {
      if (nuevas.length >= MAX_CUENTAS_NUEVAS) break
      if (i > 0) await deps.pausaEntreCuentas()
      try {
        const libres = await sumarNuevas(await cliente.buscarCuentas(termino, RESULTADOS_BUSQUEDA), 'busqueda', CUENTAS_POR_TERMINO)
        log(`búsqueda "${termino}": ${libres.length} cuentas nuevas${libres.length ? ` (${libres.join(', ')})` : ''}`)
      } catch (e) {
        if (e instanceof BloqueoInstagram) throw e
        anotar(`búsqueda "${termino}": ${msg(e)}`)
        log(`búsqueda "${termino}" falló: ${msg(e)}`)
      }
    }
    if (nuevas.length < MAX_CUENTAS_NUEVAS) {
      try {
        await deps.pausaEntreCuentas()
        const reels = await cliente.explorar(REELS_EXPLORAR)
        // De explorar solo interesan autores cuyo reel ya juega en la liga de los candidatos.
        const fuertes = reels.filter((r) => (r.vistas ?? 0) >= cfg.vistasMin)
        const libres = await sumarNuevas(fuertes.map((r) => r.cuenta), 'explorar', REELS_EXPLORAR)
        log(`explorar: ${reels.length} reels (${fuertes.length} con ≥ ${cfg.vistasMin} vistas), ${libres.length} cuentas nuevas`)
      } catch (e) {
        if (e instanceof BloqueoInstagram) throw e
        anotar(`explorar: ${msg(e)}`)
        log(`explorar falló: ${msg(e)}`)
      }
    }
    if (!seco) {
      for (const origen of ['busqueda', 'explorar'] as const) {
        const us = nuevas.filter((n) => n.origen === origen).map((n) => n.usuario)
        if (us.length) await db.registrarCuentas(us, origen)
      }
    }

    // ---- medir ----
    paso = 'medir'
    let cuentas = (await db.cuentasParaRevisar(topeCuentas)).slice(0, topeCuentas)
    if (seco) {
      // En seco las descubiertas no se registraron: se suman a mano, detrás de las de la base.
      const enLista = new Set(cuentas.map((c) => c.usuario))
      const extra: CuentaARevisar[] = nuevas
        .filter((n) => !enLista.has(n.usuario))
        .map((n) => ({ usuario: n.usuario, origen: n.origen, rubro: 'otro', vecesRevisada: 0, destacados: 0, ultimaRevisionAt: null, creadaAt: null }))
      cuentas = [...cuentas, ...extra].slice(0, topeCuentas)
    }
    const candidatos: Candidato[] = []
    for (const [i, c] of cuentas.entries()) {
      if (cont.reels_mirados >= cfg.topeReels) {
        log(`tope de ${cfg.topeReels} reels alcanzado: no se miran más cuentas`)
        break
      }
      if (i > 0) await deps.pausaEntreCuentas()
      try {
        const perfil = await cliente.perfil(c.usuario)
        const reels = await cliente.reelsDeCuenta(perfil, cfg.reelsBase)
        cont.cuentas_revisadas++
        cont.reels_mirados += reels.length
        const med = medirCuenta(reels, cfg, deps.ahora())
        const estado = estadoTrasRevision(c, med)
        if (!seco) await db.actualizarCuenta(c.usuario, perfil, med, estado)
        log(
          `@${c.usuario}: ${reels.length} reels, base ${med.base == null ? 'insuficiente' : `${Math.round(med.base)} (n=${med.baseN})`}, ${med.candidatos.length} candidatos${estado.activa ? '' : ' → se desactiva'}`,
        )
        if (med.base != null) {
          for (const reel of med.candidatos) candidatos.push({ reel, base: med.base, baseN: med.baseN, perfil, cuenta: c })
        }
      } catch (e) {
        if (e instanceof BloqueoInstagram) throw e
        anotar(`@${c.usuario}: ${msg(e)}`)
        log(`@${c.usuario} falló: ${msg(e)}`)
      }
    }
    cont.candidatos = candidatos.length

    // ---- clasificar ----
    paso = 'clasificar'
    const codigos = candidatos.map((c) => c.reel.shortcode)
    const existentes = codigos.length ? await db.refsExistentes(codigos) : new Set<string>()
    for (const c of candidatos.filter((x) => existentes.has(x.reel.shortcode))) {
      // Ya publicada: solo se refrescan las métricas, sin gastar IA.
      if (!seco) await db.upsertVideoRef(filaMetricas(c.reel, c.base, c.baseN, c.perfil))
      log(`${c.reel.shortcode} ya está en Referencias: métricas al día (${c.reel.vistas} vistas)`)
    }
    const resto = candidatos.filter((x) => !existentes.has(x.reel.shortcode))
    const yaVistos = resto.length ? await db.vistos(resto.map((c) => c.reel.shortcode)) : new Set<string>()
    const pendientes = resto
      .filter((c) => !yaVistos.has(c.reel.shortcode))
      .sort((a, b) => b.reel.multiplicador - a.reel.multiplicador)
    const ejemplos = pendientes.length ? await db.ejemplosNoSirve(20) : []
    const aprobados: AprobadoCompleto[] = []
    const marcar = async (c: Candidato, resultado: dbReal.ResultadoVisto, motivo: string | null) => {
      if (seco) return
      try {
        await db.marcarVisto({ shortcode: c.reel.shortcode, cuenta: c.perfil.usuario, multiplicador: c.reel.multiplicador, resultado, motivo, runId })
      } catch (e) {
        anotar(`${c.reel.shortcode}: no se pudo marcar visto (${msg(e)})`)
      }
    }
    let usadas = 0
    for (const c of pendientes) {
      if (usadas >= topeClasif) {
        log(`tope de ${topeClasif} clasificaciones: ${pendientes.length - usadas} candidatos quedan para la próxima corrida`)
        break
      }
      usadas++
      let comentarios: string[] = []
      if ((c.reel.comentarios ?? 0) > 0) {
        try {
          comentarios = await cliente.comentarios(c.reel.pk, COMENTARIOS_POR_REEL)
        } catch (e) {
          if (e instanceof BloqueoInstagram) throw e
          log(`${c.reel.shortcode}: sin comentarios (${msg(e)})`) // se clasifica igual
        }
      }
      try {
        const clas = await deps.clasificar(c.reel, c.perfil, comentarios, ejemplos)
        if (esInmobiliario(clas) && c.cuenta.rubro !== 'inmobiliario' && !seco) {
          await db.marcarCuentaInmobiliaria(c.cuenta.usuario)
          c.cuenta.rubro = 'inmobiliario'
        }
        log(`${c.reel.shortcode} (@${c.perfil.usuario}, ×${c.reel.multiplicador.toFixed(1)}): ${clas.categoria} / ${clas.tema} / ${clas.puntaje} — ${clas.razon}`)
        if (clas.categoria === 'no_sirve') await marcar(c, 'descartado_relevancia', clas.razon)
        else if (clas.puntaje < cfg.puntajeMin) await marcar(c, 'bajo_umbral', `puntaje ${clas.puntaje}: ${clas.razon}`)
        else aprobados.push({ ...c, clas, comentarios })
      } catch (e) {
        if (e instanceof BloqueoInstagram) throw e
        anotar(`${c.reel.shortcode}: clasificación (${msg(e)})`)
        log(`${c.reel.shortcode}: la clasificación falló: ${msg(e)}`)
        await marcar(c, 'error', `clasificación: ${msg(e)}`)
      }
    }

    // ---- mezcla 80/20 ----
    paso = 'mezcla'
    const porCodigo = new Map(aprobados.map((a) => [a.reel.shortcode, a]))
    const semana = await db.semanaPublicada()
    const publicables = elegirPublicables(
      aprobados.map((a): Aprobado => ({ shortcode: a.reel.shortcode, multiplicador: a.reel.multiplicador, clas: a.clas })),
      semana,
      cfg,
    )
      .map((p) => porCodigo.get(p.shortcode))
      .filter((a): a is AprobadoCompleto => !!a)
    log(`aprobados: ${aprobados.length}; semana: ${semana.inmobiliarias} inmobiliarias / ${semana.otras} otras; se publicarían: ${publicables.length}`)

    // ---- publicar ----
    paso = 'publicar'
    if (seco) {
      for (const a of publicables) {
        log(
          `  PUBLICARÍA ${a.reel.shortcode} @${a.perfil.usuario} ×${a.reel.multiplicador.toFixed(1)} ${a.reel.vistas} vistas — ${a.clas.categoria}/${a.clas.tema}/${a.clas.puntaje}: ${a.clas.razon}`,
        )
      }
    } else {
      for (const a of publicables) {
        const codigo = a.reel.shortcode
        const dirFrames = join(deps.rutaTmp, `frames-${codigo}`)
        let mp4Local: string | null = null
        try {
          if (!cookies) {
            mkdirSync(deps.rutaTmp, { recursive: true, mode: 0o700 })
            const ruta = join(deps.rutaTmp, `cookies-${process.pid}.txt`)
            cookies = ruta // se anota antes de escribir: si falla a medias, el finally igual lo borra
            await cliente.cookiesNetscape(ruta)
          }
          const medios = await deps.bajarYSubir(codigo, cookies)
          mp4Local = medios.mp4Local
          const frames = await deps.extraerFrames(medios.mp4Local, dirFrames, FRAMES_POR_REEL)
          const transcripcion = await deps.transcribir(medios.mp4Local, dirFrames)
          const an = await deps.analizar({ frames, transcripcion }, a.reel, a.base, a.perfil, a.comentarios)
          const fila = armarFilaVideoRef(a.reel, a.base, a.baseN, a.perfil, a.clas, an, medios, runId)
          await db.upsertVideoRef(fila)
          await marcar(a, 'publicado', null)
          cont.publicadas++
          log(`publicada ${codigo} (@${a.perfil.usuario})`)
        } catch (e) {
          if (e instanceof BloqueoInstagram) throw e
          anotar(`${codigo}: ${msg(e)}`)
          log(`${codigo} no se pudo publicar: ${msg(e)}`)
          await marcar(a, 'error', msg(e))
        } finally {
          // Cuadros y video local se borran pase lo que pase: el análisis ya los usó o falló.
          deps.borrar(dirFrames)
          if (mp4Local) deps.borrar(dirname(mp4Local))
        }
      }
    }

    // ---- retención ----
    paso = 'limpiar'
    if (!seco) {
      try {
        const n = await deps.limpiarRetencion()
        if (n) log(`retención: ${n} videos borrados del Storage`)
      } catch (e) {
        anotar(`retención: ${msg(e)}`)
      }
    }

    const estado = errores.length ? 'parcial' : 'ok'
    const mensaje = errores.length ? errores.slice(0, 10).join(' · ') : null
    if (corridaAbierta) await db.cerrarCorrida(runId, estado, pasoError, cont, mensaje)
    log(`corrida ${estado}: ${cont.cuentas_revisadas} cuentas, ${cont.reels_mirados} reels, ${cont.candidatos} candidatos, ${cont.publicadas} publicadas${mensaje ? ` — ${mensaje}` : ''}`)
    return { estado, publicadas: cont.publicadas }
  } catch (e) {
    let estado: 'frenada_por_instagram' | 'error' = 'error'
    let mensaje = msg(e)
    if (e instanceof BloqueoInstagram) {
      if (e.tipo === 'login') {
        paso = 'sesion'
        mensaje = MENSAJE_SESION
      } else {
        estado = 'frenada_por_instagram'
      }
    }
    log(`corrida ${estado} en el paso "${paso}": ${mensaje}`)
    if (corridaAbierta) {
      try {
        await db.cerrarCorrida(runId, estado, paso, cont, mensaje)
      } catch (e2) {
        log(`no se pudo cerrar la corrida: ${msg(e2)}`)
      }
    }
    return { estado, publicadas: cont.publicadas }
  } finally {
    if (cliente) {
      try {
        await cliente.cerrar()
      } catch (e) {
        log(`no se pudo cerrar el navegador: ${msg(e)}`)
      }
    }
    if (cookies) deps.borrar(cookies)
    deps.candado.soltar()
  }
}

// ---------- dependencias reales ----------

export function depsReales(): Deps {
  // Imports perezosos: las pruebas inyectan dobles y no cargan Playwright ni la CLI de Claude.
  const base = join(homedir(), '.radar-referencias')
  return {
    db: dbReal,
    abrirCliente: async () => {
      const { InstagramCliente } = await import('./instagram/cliente')
      return InstagramCliente.abrir({ headless: true })
    },
    pausaEntreCuentas: async () => {
      const { InstagramCliente } = await import('./instagram/cliente')
      return InstagramCliente.pausaEntreCuentas()
    },
    clasificar: async (...a) => (await import('./ia/clasificar')).clasificar(...a),
    analizar: async (...a) => (await import('./ia/analizar')).analizar(...a),
    extraerFrames: async (mp4, destino, n) => (await import('./ia/insumos-video')).extraerFrames(mp4, destino, n),
    transcribir: async (mp4, destino) => (await import('./ia/insumos-video')).transcribir(mp4, destino),
    bajarYSubir: async (codigo, cookies) => (await import('./medios')).bajarYSubir(codigo, cookies),
    limpiarRetencion: async () => (await import('./medios')).limpiarRetencion(),
    candado: candadoArchivo(join(base, 'radar.lock')),
    rutaTmp: join(base, 'tmp'),
    ahora: () => new Date(),
    log: (m) => console.log(`[radar] ${m}`),
    borrar: (ruta) => rmSync(ruta, { recursive: true, force: true }),
  }
}
