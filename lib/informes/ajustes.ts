/**
 * Datos automáticos corregidos a mano (pedido del dueño, 2026-10-29). Puro. Se aplica en UN lugar —al leer el
 * informe (`datos.ts`)— y desde ahí lo usan el resumen, los textos que escribe la plataforma, los faltantes y el PDF:
 * así ninguno se queda con el cero viejo. Lo automático original no se pisa nunca (la base guarda las dos cosas).
 */
import type { Ajustes, DatosConsultas, DatosInstagram, DatosMercadoLibre, DatosMeta, DatosReserva, DatosVisitas, FuenteGuardada, Fuentes, NombreFuente, Redaccion } from './tipos'

const FICHA_VACIA: DatosVisitas['ficha'] = {
  respuestas: 0, leGusto: { si: 0, no: 0 }, precio: { correcto: 0, alto: 0, bajo: 0 }, ofertas: [], moneda: null,
  masGusto: [], menosGusto: [], comentariosMenosGusto: [],
}

/** ¿La fuente tiene algún dato cargado a mano? (un objeto con todos los campos vacíos = "volver al automático") */
export function hayAjustes(a: Ajustes | undefined, fuente: NombreFuente): boolean {
  const x = a?.[fuente] as Record<string, unknown> | undefined
  return !!x && Object.values(x).some(v => v !== undefined && v !== null && v !== '')
}

const conDato = <T,>(f: FuenteGuardada<T> | undefined): T | null => (f?.estado === 'ok' ? f.datos ?? null : null)
const n = (v: number | undefined, def: number) => (typeof v === 'number' ? v : def)

function aMano<T>(original: FuenteGuardada<T> | undefined, datos: T): FuenteGuardada<T> {
  return { estado: 'ok', actualizadoEn: original?.actualizadoEn ?? null, datos, error: null, aMano: true }
}

export function aplicarAjustes(fuentes: Fuentes, a: Ajustes | undefined): Fuentes {
  if (!a) return fuentes
  const f: Fuentes = { ...fuentes }

  if (hayAjustes(a, 'consultas')) {
    const base = conDato(fuentes.consultas)?.porPortal ?? { zonaprop: 0, argenprop: 0, mercadolibre: 0, redes: 0, otros: 0 }
    const x = a.consultas ?? {}
    const porPortal: DatosConsultas['porPortal'] = {
      zonaprop: n(x.zonaprop, base.zonaprop), argenprop: n(x.argenprop, base.argenprop), mercadolibre: n(x.mercadolibre, base.mercadolibre),
      redes: n(x.redes, base.redes), otros: n(x.otros, base.otros),
    }
    f.consultas = aMano(fuentes.consultas, { total: Object.values(porPortal).reduce((s, v) => s + v, 0), porPortal })
  }

  if (hayAjustes(a, 'visitas')) {
    const base = conDato(fuentes.visitas)
    f.visitas = aMano<DatosVisitas>(fuentes.visitas, { realizadas: n(a.visitas?.realizadas, base?.realizadas ?? 0), ficha: base?.ficha ?? FICHA_VACIA })
  }

  if (hayAjustes(a, 'reserva')) {
    const base = conDato(fuentes.reserva)
    const reservada = typeof a.reserva?.reservada === 'boolean' ? a.reserva.reservada : base?.reservada ?? false
    f.reserva = aMano<DatosReserva>(fuentes.reserva, { reservada, fecha: reservada ? a.reserva?.fecha ?? base?.fecha ?? null : null })
  }

  if (hayAjustes(a, 'mercadolibre')) {
    const base = conDato(fuentes.mercadolibre)
    const x = a.mercadolibre ?? {}
    const c = base?.contactos ?? { interesados: 0, preguntas: 0, whatsapp: 0, llamadas: 0, otros: 0 }
    f.mercadolibre = aMano<DatosMercadoLibre>(fuentes.mercadolibre, {
      avisos: base?.avisos ?? [],
      visitas: n(x.visitas, base?.visitas ?? 0),
      contactos: {
        interesados: n(x.interesados, c.interesados), preguntas: n(x.preguntas, c.preguntas), whatsapp: n(x.whatsapp, c.whatsapp),
        llamadas: n(x.llamadas, c.llamadas), otros: c.otros,
      },
      vistasTelefono: typeof x.vistasTelefono === 'number' ? x.vistasTelefono : base?.vistasTelefono ?? null,
    })
  }

  if (hayAjustes(a, 'meta')) {
    const base = conDato(fuentes.meta)
    const x = a.meta ?? {}
    f.meta = aMano<DatosMeta>(fuentes.meta, {
      // Si hubo que cargar Meta a mano es porque hubo campaña: al menos una.
      campanas: Math.max(base?.campanas ?? 0, 1),
      alcance: n(x.alcance, base?.alcance ?? 0), impresiones: n(x.impresiones, base?.impresiones ?? 0),
      resultados: n(x.resultados, base?.resultados ?? 0), gasto: n(x.gasto, base?.gasto ?? 0),
      edadSexo: base?.edadSexo ?? [], plataformas: base?.plataformas ?? [],
    })
  }

  if (hayAjustes(a, 'instagram')) {
    const reels = conDato(fuentes.instagram)?.reels ?? []
    const suma = (k: 'reproducciones' | 'alcance' | 'meGusta' | 'comentarios' | 'guardados' | 'compartidos') => reels.reduce((s, r) => s + r[k], 0)
    const x = a.instagram ?? {}
    // El PDF muestra TOTALES de los reels: lo cargado a mano va como un solo total.
    f.instagram = aMano<DatosInstagram>(fuentes.instagram, { reels: [{
      permalink: null, publicadoEn: null,
      reproducciones: n(x.reproducciones, suma('reproducciones')), alcance: n(x.alcance, suma('alcance')),
      meGusta: n(x.meGusta, suma('meGusta')), comentarios: n(x.comentarios, suma('comentarios')),
      guardados: suma('guardados'), compartidos: suma('compartidos'),
    }], cantidadReels: Math.max(reels.length, 1) })
  }
  return f
}

/**
 * Se corrigió algo DESPUÉS de que la plataforma escribió los textos: hay que "Volver a escribir". No compara horas
 * (el reloj del navegador y el del servidor pueden no coincidir): al escribir, el servidor BORRA `ajustesEn`, así que
 * si existe, la corrección es posterior.
 */
export function textosDesactualizados(m: { ajustesEn?: string; redaccion?: Redaccion }): boolean {
  return !!m.ajustesEn && !!m.redaccion?.generadoEn
}
