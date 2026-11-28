// Tipos compartidos del radar de referencias de Instagram.

/** Un reel tal como lo devuelve la fuente de datos, sin interpretar. */
export interface ReelCrudo {
  shortcode: string
  pk: string
  cuenta: string
  /** ISO 8601 */
  publicadoAt: string
  vistas: number | null
  likes: number | null
  comentarios: number | null
  caption: string
  duracionSeg: number | null
  urlPortada: string | null
  esReel: boolean
}

export interface CuentaPerfil {
  usuario: string
  igUserId: string
  seguidores: number | null
}

export interface ConfigRadar {
  /** Veces sobre la mediana de la cuenta para ser candidato. */
  multiplicadorMin: number
  /** Antigüedad máxima (días) de un candidato. */
  diasMax: number
  vistasMin: number
  /** Cuántos reels maduros recientes entran a la base. */
  reelsBase: number
  /** Días que necesita un reel para que sus vistas se consideren estables. */
  diasMaduro: number
  puntajeMin: number
  topeDiario: number
  topeCuentas: number
  topeReels: number
}

export interface MedicionCuenta {
  /** Mediana de vistas de la base; null si la base es insuficiente. */
  base: number | null
  /** Cuántos reels se usaron realmente para la base. */
  baseN: number
  candidatos: Array<ReelCrudo & { multiplicador: number }>
  descartados: Array<{ shortcode: string; motivo: string; multiplicador: number | null }>
}

export type Categoria =
  | 'inmobiliario_ar'
  | 'inmobiliario_otro_pais'
  | 'formato_otro_rubro'
  | 'no_sirve'

export type TemaCategoria =
  | 'noticias'
  | 'impuestos'
  | 'datos_mercado'
  | 'creditos'
  | 'gobierno_normativa'
  | 'inmobiliarias'
  | 'otro'

export interface Clasificacion {
  categoria: Categoria
  tema: TemaCategoria
  puntaje: number
  razon: string
}

export interface Analisis {
  tema: string
  gancho: string
  formato: string
  por_que: string
  comentarios_analisis: string
  adaptacion_diego: string
  transcripcion: string
}
