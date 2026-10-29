/**
 * Tipos del informe quincenal (spec 2026-10-22). Lo que vive en las columnas jsonb de
 * `property_reports`: `fuentes` (lo automático), `manual` (lo que carga Paula), `competidoras`.
 */
import type { AvisoDeListado, DetalleCandidata } from './competencia/puntaje'
import type { Disposicion, Estado } from './competencia/caracteristicas'

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
  /** Tiene datos cargados a mano (`manual.ajustes`). Solo en memoria: lo pone `aplicarAjustes`, nunca va a la base. */
  aMano?: boolean
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

export interface DatosMercadoLibre {
  /** Los avisos que se sumaron (plataforma, cuenta por dirección, agregado a mano). */
  avisos: Array<{ id: string; titulo: string | null; url: string | null; origen: 'plataforma' | 'cuenta' | 'manual' }>
  visitas: number
  /** Interesados del período por canal (API de leads de clasificados). Opcional: informes viejos no lo tienen. */
  contactos?: { interesados: number; preguntas: number; whatsapp: number; llamadas: number; otros: number }
  /** Veces que vieron el teléfono en el período. null = la ventana de ML (150 días) no llega a ese período. */
  vistasTelefono?: number | null
}

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
  /** Avisos que la plataforma sumó y Paula sacó (emparejado por dirección equivocado). */
  excluidos?: string[]
}
export interface ManualTiktok { visualizaciones?: number; tiempoTotal?: string; tiempoPromedio?: string; vieronCompleto?: number; nuevosSeguidores?: number }

export interface Textos {
  resumenMetricas?: string
  accionesRealizadas?: string
  accionesARealizar?: string
  resumenConsultas?: string
  analisisFinal?: string
}

/** Lo que escribió la plataforma la última vez: para no pisar lo que Paula corrigió y señalar qué revisar. */
export interface Redaccion {
  generadoEn: string
  original: Textos
  /** Campos con algún número que no está en los datos del informe. */
  revisar: Array<keyof Textos>
}

/**
 * Correcciones a mano de lo que trajo la plataforma (pedido del dueño, 2026-10-29): un dato que llegó en cero, sin
 * datos o con error se puede cargar a mano. Campo vacío = se usa lo automático. Las aplica `aplicarAjustes`.
 */
export interface Ajustes {
  consultas?: Partial<DatosConsultas['porPortal']>
  visitas?: { realizadas?: number }
  reserva?: { reservada?: boolean; fecha?: string | null }
  mercadolibre?: { visitas?: number; interesados?: number; preguntas?: number; whatsapp?: number; llamadas?: number; vistasTelefono?: number }
  meta?: { alcance?: number; impresiones?: number; resultados?: number; gasto?: number }
  instagram?: { reproducciones?: number; alcance?: number; meGusta?: number; comentarios?: number }
}

export interface Manual {
  zonaprop?: ManualZonaprop
  argenprop?: ManualArgenprop
  mercadolibre?: ManualMercadoLibre
  tiktok?: ManualTiktok
  textos?: Textos
  redaccion?: Redaccion
  ajustes?: Ajustes
  /** Cuándo se tocó un ajuste por última vez: si es después de `redaccion.generadoEn`, los textos quedaron viejos. */
  ajustesEn?: string
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

/** Resultado de buscar competidoras en UN portal (ver `lib/informes/competencia`). */
export interface BusquedaPortal {
  /** sin_busqueda = el portal no se puede buscar para esta propiedad (tipo o zona), con el motivo en `error`. */
  estado: 'ok' | 'error' | 'sin_busqueda'
  error: string | null
  buscadoEn: string
  url: string | null
  avisos: AvisoDeListado[]
}

export interface CandidatasGuardadas {
  argenprop?: BusquedaPortal
  mercadolibre?: BusquedaPortal
  /** Lo leído al abrir cada aviso, por URL. */
  detalles: Record<string, DetalleCandidata>
}

export interface Informe {
  id: string
  propertyId: string
  desde: string
  hasta: string
  origen: 'ciclo' | 'manual'
  estado: 'borrador' | 'listo'
  /** Lo automático CON las correcciones a mano aplicadas: lo que usan el resumen, los textos y el PDF. */
  fuentes: Fuentes
  /** Lo que trajo la plataforma, sin correcciones (para mostrar "automático: 0" y saber qué falta traer). */
  fuentesAutomaticas?: Fuentes
  manual: Manual
  competidoras: Competidora[]
  candidatas: CandidatasGuardadas
  capturas: Capturas
  pdfPath: string | null
  listoAt: string | null
  createdAt: string
  updatedAt: string
}

/** Lo que muestran la pantalla y el PDF de la propiedad del informe. */
export interface PropiedadDelInforme {
  id: string
  direccion: string
  barrio: string | null
  ciudad: string | null
  tipo: string | null
  precio: number | null
  moneda: string | null
  capturadaEl: string | null
  foto: string | null
  /** Superficie total (o cubierta si no hay total): para el valor del m² del análisis. */
  m2?: number | null
  ambientes?: number | null
  provincia?: string | null
  antiguedad?: number | null
  /** Disposición y estado cargados para los portales (portal_data), ya normalizados. */
  disposicion?: Disposicion | null
  estadoConservacion?: Estado | null
}
