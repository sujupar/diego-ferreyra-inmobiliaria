/**
 * ¿Las fotos son de ESTA propiedad?
 *
 * Caso real que lo motivó (2026-09-19): Díaz Colodrero 2327, una planta baja de
 * 1 dormitorio, tenía cargadas las 20 fotos de Perón 4227, un 13° piso de 2
 * dormitorios. El análisis de fotos describió fielmente el departamento de las
 * fotos, y la descripción terminó hablando de otra propiedad.
 *
 * Solo se avisa cuando las fotos muestran MÁS de lo que dice la ficha: menos es
 * normal (no siempre se fotografía cada dormitorio). El aviso va al asesor en la
 * vista previa; no bloquea, porque también puede estar mal la ficha.
 */
import type { InventarioFotos } from './tipos'

const DORMITORIO = /\b(dormitorio|habitaci[oó]n|cuarto)\b/i
const BANO = /\b(baño|toilette)\b/i

function contar(inventario: InventarioFotos, patron: RegExp): number {
  return inventario.ambientes.filter(a => patron.test(a.nombre)).length
}

function aviso(cosa: string, enFotos: number, enFicha: number): string {
  return `Las fotos muestran ${enFotos} ${cosa} y la ficha dice ${enFicha}. Revisá que las fotos sean de esta propiedad o corregí la ficha.`
}

export function avisosDeCoherencia(
  inventario: InventarioFotos,
  ficha: { bedrooms?: number | null; bathrooms?: number | null },
): string[] {
  const avisos: string[] = []
  const dormitorios = contar(inventario, DORMITORIO)
  if (typeof ficha.bedrooms === 'number' && dormitorios > ficha.bedrooms) avisos.push(aviso('dormitorios', dormitorios, ficha.bedrooms))
  const banos = contar(inventario, BANO)
  if (typeof ficha.bathrooms === 'number' && banos > ficha.bathrooms) avisos.push(aviso('baños', banos, ficha.bathrooms))
  return avisos
}
