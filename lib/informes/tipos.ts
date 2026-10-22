/**
 * Tipos del informe quincenal (spec 2026-10-22). Lo que vive en las columnas jsonb de
 * `property_reports`: `fuentes` (lo automático), `manual` (lo que carga Paula), `competidoras`.
 */
export const FUENTES = ['consultas', 'visitas', 'reserva', 'mercadolibre', 'meta', 'instagram'] as const
export type NombreFuente = (typeof FUENTES)[number]

/**
 * `sin_datos` = la fuente respondió y no hay nada que mostrar (la propiedad no tiene aviso en ML,
 * no tuvo campaña, no tiene reel). `error` = no se pudo traer: el informe lo dice y NUNCA lo cuenta
 * como 0. `pendiente` = todavía no se pidió.
 */
export type EstadoFuente = 'pendiente' | 'ok' | 'sin_datos' | 'error'

export interface FuenteGuardada<T> {
  estado: EstadoFuente
  actualizadoEn: string | null
  datos: T | null
  error: string | null
}

export interface DatosConsultas {
  total: number
  porPortal: { zonaprop: number; argenprop: number; mercadolibre: number; redes: number; otros: number }
}

export interface ConteoEtiqueta { etiqueta: string; cantidad: number }

export interface DatosVisitas {
  /** Visitas del período que se realizaron. */
  realizadas: number
  ficha: {
    respuestas: number
    leGusto: { si: number; no: number }
    precio: { correcto: number; alto: number; bajo: number }
    /** Ofertas en la moneda de publicación, de menor a mayor (para las barras "Cuánto ofertaría"). */
    ofertas: number[]
    moneda: 'USD' | 'ARS' | null
    menosGusto: ConteoEtiqueta[]
    masGusto: ConteoEtiqueta[]
    /** Lo que escribieron a mano en "qué no le gustó" (como en los ejemplos). */
    comentariosMenosGusto: string[]
  }
}

export interface DatosReserva { reservada: boolean; fecha: string | null }

export interface DatosMercadoLibre { avisoId: string; visitas: number }

export interface DatosMeta {
  campanas: number
  alcance: number
  impresiones: number
  resultados: number
  gasto: number
  edadSexo: Array<{ rango: string; hombres: number; mujeres: number }>
  plataformas: Array<{ plataforma: string; alcance: number; resultados: number }>
}

export interface ReelInstagram {
  permalink: string | null
  publicadoEn: string | null
  reproducciones: number
  alcance: number
  meGusta: number
  comentarios: number
  guardados: number
  compartidos: number
}

/** Instagram da las métricas del reel ACUMULADAS desde su publicación, no por período: se rotula. */
export interface DatosInstagram { reels: ReelInstagram[] }

export interface DatosPorFuente {
  consultas: DatosConsultas
  visitas: DatosVisitas
  reserva: DatosReserva
  mercadolibre: DatosMercadoLibre
  meta: DatosMeta
  instagram: DatosInstagram
}

export type Fuentes = { [K in NombreFuente]?: FuenteGuardada<DatosPorFuente[K]> }

/** Un portal que Paula completa a mano. `publicado: false` = no está en ese portal (no es un faltante). */
export interface ManualZonaprop { publicado?: boolean; exposicion?: number; visualizaciones?: number; interesados?: number }
export interface ManualArgenprop { publicado?: boolean; visualizaciones?: number }
export interface ManualMercadoLibre {
  /** El aviso, cuando la plataforma no lo conoce (publicado a mano): código MLA o link. */
  aviso?: string
  contactos?: number; llamadas?: number; whatsapp?: number; preguntas?: number }
export interface ManualTiktok { visualizaciones?: number; tiempoTotal?: string; tiempoPromedio?: string; vieronCompleto?: number; nuevosSeguidores?: number }

export interface Textos {
  resumenMetricas?: string
  accionesRealizadas?: string
  accionesARealizar?: string
  resumenConsultas?: string
  analisisFinal?: string
}

export interface Manual {
  zonaprop?: ManualZonaprop
  argenprop?: ManualArgenprop
  mercadolibre?: ManualMercadoLibre
  tiktok?: ManualTiktok
  textos?: Textos
}

export interface Competidora {
  url: string
  direccion: string
  barrio: string | null
  precio: number | null
  moneda: 'USD' | 'ARS' | null
  m2: number | null
  /** Lo propone la plataforma (precio ÷ m²); Paula lo corrige si usa el m² homogeneizado. */
  valorM2: number | null
  ambientes: number | null
  banos: number | null
  dormitorios: number | null
  antiguedad: number | null
  cocheras: number | null
  foto: string | null
  publicadoHace: string | null
  visualizaciones: number | null
  bajoDePrecio: boolean
}

export const CAPTURAS = ['zonaprop', 'argenprop', 'mercadolibre', 'tiktok'] as const
export type NombreCaptura = (typeof CAPTURAS)[number]
export type Capturas = { [K in NombreCaptura]?: string }

export interface Informe {
  id: string
  propertyId: string
  desde: string
  hasta: string
  origen: 'ciclo' | 'manual'
  estado: 'borrador' | 'listo'
  fuentes: Fuentes
  manual: Manual
  competidoras: Competidora[]
  capturas: Capturas
  pdfPath: string | null
  listoAt: string | null
  createdAt: string
  updatedAt: string
}
