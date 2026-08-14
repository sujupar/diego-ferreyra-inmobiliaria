import { formatMoney } from './detail-view'

/**
 * Freno contra publicar un precio equivocado.
 *
 * EL PROBLEMA CONCRETO: el precio se guarda al salir del campo. Si alguien
 * está escribiendo 1.290.000, alcanza a poner "12" y hace clic en otro lado,
 * el guardado se dispara con 12 — y la landing pública, que lee el precio en
 * vivo y se sirve sin caché, muestra US$ 12 con pauta de Meta encima.
 *
 * La solución no es adivinar si un número "está completo" (no se puede: 12 es
 * un precio válido para otra cosa), sino mirar la MAGNITUD DEL CAMBIO. Un
 * tipeo a medias o un cero de más siempre son saltos enormes contra el precio
 * que ya estaba; una baja real de precio no lo es. Por eso un cambio brusco
 * pide confirmación y uno normal se guarda solo.
 */

/**
 * Cuánto puede moverse el precio sin preguntar. Las bajas reales del rubro
 * andan por el 5-15%; los errores de tipeo son del 90% para arriba (o 10x).
 * El 25% deja pasar la operatoria normal y atrapa todos los errores gruesos.
 */
const UMBRAL_CAMBIO_BRUSCO = 0.25

export interface CambioDePrecio {
  anterior: number
  nuevo: number
  monedaAnterior: string
  monedaNueva: string
}

export type VeredictoPrecio =
  | { tipo: 'sin-cambio' }
  /** Se guarda sin molestar a nadie. */
  | { tipo: 'directo' }
  /** Requiere un clic explícito de la persona antes de tocar la base. */
  | { tipo: 'confirmar'; motivo: string }

export function evaluarCambioDePrecio(c: CambioDePrecio): VeredictoPrecio {
  const cambioMoneda = c.monedaAnterior !== c.monedaNueva

  // Un número raro NUNCA pasa de largo: se pregunta.
  if (typeof c.nuevo !== 'number' || !Number.isFinite(c.nuevo)) {
    return { tipo: 'confirmar', motivo: 'El valor ingresado no es un número válido.' }
  }

  if (!cambioMoneda && c.nuevo === c.anterior) return { tipo: 'sin-cambio' }

  // El mismo número en otra moneda es un cambio enorme de valor real: siempre
  // se confirma, aunque la cifra no se mueva.
  if (cambioMoneda) {
    return { tipo: 'confirmar', motivo: 'Estás cambiando la moneda de la publicación.' }
  }

  // Sin un precio anterior válido no hay proporción que calcular: se pregunta.
  if (!Number.isFinite(c.anterior) || c.anterior <= 0) {
    return { tipo: 'confirmar', motivo: 'La propiedad no tenía un precio anterior con el que comparar.' }
  }

  const proporcion = Math.abs(c.nuevo - c.anterior) / c.anterior
  if (proporcion > UMBRAL_CAMBIO_BRUSCO) {
    return { tipo: 'confirmar', motivo: describirCambio(c) }
  }
  return { tipo: 'directo' }
}

/** Frase para la confirmación: los dos precios y qué tan grande es el salto. */
export function describirCambio(c: CambioDePrecio): string {
  const desde = formatMoney(c.anterior, c.monedaAnterior)
  const hasta = formatMoney(c.nuevo, c.monedaNueva)

  if (c.monedaAnterior !== c.monedaNueva) {
    return `El aviso pasa de ${desde} a ${hasta}.`
  }
  if (!Number.isFinite(c.anterior) || c.anterior <= 0) {
    return `El aviso pasa de ${desde} a ${hasta}.`
  }

  const proporcion = Math.abs(c.nuevo - c.anterior) / c.anterior
  const pct = proporcion >= 1
    ? Math.round(proporcion * 100)
    : Math.round(proporcion * 1000) / 10
  const direccion = c.nuevo < c.anterior ? 'una baja' : 'una suba'
  return `El aviso pasa de ${desde} a ${hasta}: ${direccion} del ${pct}%.`
}
