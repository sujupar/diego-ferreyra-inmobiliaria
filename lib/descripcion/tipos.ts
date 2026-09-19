/**
 * Tipos del generador de descripciones con el método de Diego.
 *
 * El método tiene tres pasos —mirar las fotos, investigar la zona, escribir— y
 * cada uno produce algo que el siguiente consume. Estos son esos contratos.
 * `DescripcionIA` es la forma del jsonb `properties.descripcion_ia`.
 */

/** Lo que el paso de fotos vio, ambiente por ambiente. Nunca lo que supuso. */
export interface InventarioFotos {
  ambientes: Array<{
    nombre: string
    /** Números de foto (1 = la primera de `properties.photos`). */
    fotos: number[]
    detalle: string
  }>
  exteriores: string[]
  edificio: string[]
  vistas: string[]
  estilo: string
  estadoGeneral: string
  puntosFuertes: string[]
  /** Lo que las fotos no permiten saber (orientación, medidas, expensas…). */
  noSeVe: string[]
  /** Fotos con ambientación virtual o renders: sus muebles NO vienen incluidos. */
  fotosAmbientadas: number[]
  compradorSugerido: { perfil: string; porque: string }
}

export type TipoLugar = 'subte' | 'tren' | 'plaza' | 'colegio' | 'universidad' | 'hospital'

/** Un lugar real del mapa, con la distancia CALCULADA (no buscada en la web). */
export interface LugarCercano {
  nombre: string
  tipo: TipoLugar
  /** "Línea B", "Sarmiento"… si el mapa lo sabe. */
  linea?: string
  metros: number
  cuadras: number
}

export interface ZonaInvestigada {
  /** null = no hubo coordenadas o el mapa falló: el texto NO lleva distancias. */
  mapa: { lugares: LugarCercano[] } | null
  /** Texto saneado de la búsqueda web (carácter, colectivos, comercios). */
  web: string | null
}

export interface TextoGenerado {
  title: string
  subtitle: string
  body: string
}

/** Forma de `properties.descripcion_ia`. Todo opcional: se llena por etapas. */
export interface DescripcionIA {
  fotos?: { firma: string; cantidad: number; inventario: InventarioFotos; en: string }
  zona?: { firma: string; datos: ZonaInvestigada; en: string }
  /** "Lo que no se ve en las fotos", escrito por el asesor. */
  notas?: string | null
  /** Descripciones reemplazadas, la más reciente primero (se guardan las últimas 3). */
  anteriores?: Array<{ title: string | null; description: string | null; reemplazadaEn: string }>
}
