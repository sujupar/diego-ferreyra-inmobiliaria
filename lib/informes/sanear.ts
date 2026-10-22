/**
 * Valida en el servidor lo que manda la pantalla del informe: lo que carga Paula (`manual`) y las
 * competidoras. Puro. Estricto con las claves (una clave desconocida, como `estado`, se rechaza:
 * el estado solo se cambia con "Marcar como listo"). Los links solo `https://` — van a `<img>` y a
 * links del PDF que recibe el propietario.
 */
import { z } from 'zod'
import { idDeAvisoMercadoLibre } from './aviso-ml'
import { valorDelM2 } from './resumen'
import type { Competidora, Manual } from './tipos'

const conteo = z.number().int().min(0).max(1_000_000_000)
const texto = (max: number) => z.string().max(max).transform(s => s.trim())
const httpsUrl = z.string().max(1000).refine(u => {
  try { return new URL(u).protocol === 'https:' } catch { return false }
}, 'link inválido')

const manual = z.object({
  zonaprop: z.object({ publicado: z.boolean(), exposicion: conteo, visualizaciones: conteo, interesados: conteo }).partial().strict(),
  argenprop: z.object({ publicado: z.boolean(), visualizaciones: conteo }).partial().strict(),
  mercadolibre: z.object({ aviso: z.string().max(500), contactos: conteo, llamadas: conteo, whatsapp: conteo, preguntas: conteo }).partial().strict(),
  tiktok: z.object({ visualizaciones: conteo, tiempoTotal: texto(20), tiempoPromedio: texto(20), vieronCompleto: z.number().min(0).max(100), nuevosSeguidores: conteo }).partial().strict(),
  textos: z.object({
    resumenMetricas: texto(2000), accionesRealizadas: texto(3000), accionesARealizar: texto(3000),
    resumenConsultas: texto(3000), analisisFinal: texto(6000),
  }).partial().strict(),
}).partial().strict()

const numeroONull = z.number().min(0).max(1_000_000_000).nullable().optional()
const competidora = z.object({
  url: httpsUrl,
  direccion: z.string().min(1).max(200).transform(s => s.trim()),
  barrio: z.string().max(100).nullable().optional(),
  precio: numeroONull,
  moneda: z.enum(['USD', 'ARS']).nullable().optional(),
  m2: numeroONull,
  valorM2: numeroONull,
  ambientes: numeroONull,
  banos: numeroONull,
  dormitorios: numeroONull,
  antiguedad: numeroONull,
  cocheras: numeroONull,
  foto: httpsUrl.nullable().optional(),
  publicadoHace: z.string().max(80).nullable().optional(),
  visualizaciones: numeroONull,
  bajoDePrecio: z.boolean().optional(),
}).strict()

const cuerpo = z.object({ manual, competidoras: z.array(competidora).max(8) }).partial().strict()

export type CambiosInforme = { manual?: Manual; competidoras?: Competidora[] }
export type ResultadoSaneo = { ok: true; cambios: CambiosInforme } | { ok: false; error: string }

const ERROR_AVISO_ML = 'No reconocemos ese aviso de MercadoLibre. Pegá el link del aviso o su código (MLA…)'

export function sanearCambios(body: unknown): ResultadoSaneo {
  const p = cuerpo.safeParse(body)
  if (!p.success) return { ok: false, error: 'Datos del informe inválidos' }
  if (!p.data.manual && !p.data.competidoras) return { ok: false, error: 'No hay nada para guardar' }
  const cambios: CambiosInforme = {}
  if (p.data.manual) {
    const m = p.data.manual
    const aviso = m.mercadolibre?.aviso
    if (aviso !== undefined && aviso.trim() !== '') {
      const id = idDeAvisoMercadoLibre(aviso)
      if (!id) return { ok: false, error: ERROR_AVISO_ML }
      m.mercadolibre = { ...m.mercadolibre, aviso: id }
    }
    cambios.manual = m as Manual
  }
  if (p.data.competidoras) {
    cambios.competidoras = p.data.competidoras.map(c => ({
      url: c.url, direccion: c.direccion, barrio: c.barrio ?? null, precio: c.precio ?? null, moneda: c.moneda ?? null,
      m2: c.m2 ?? null, valorM2: c.valorM2 ?? valorDelM2(c.precio ?? null, c.m2 ?? null),
      ambientes: c.ambientes ?? null, banos: c.banos ?? null, dormitorios: c.dormitorios ?? null,
      antiguedad: c.antiguedad ?? null, cocheras: c.cocheras ?? null, foto: c.foto ?? null,
      publicadoHace: c.publicadoHace ?? null, visualizaciones: c.visualizaciones ?? null, bajoDePrecio: c.bajoDePrecio ?? false,
    }))
  }
  return { ok: true, cambios }
}
