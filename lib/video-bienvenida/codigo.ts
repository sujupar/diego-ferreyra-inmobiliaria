/**
 * Código del enlace personal del video de bienvenida (change tasacion-video-bienvenida, D2).
 *
 * Mismo alfabeto que `lead_access_tokens` (lib/leads/access-token.ts): sin I, O, l, 0 ni 1,
 * porque el enlace a veces se dicta o se copia a mano. Se repite acá en vez de importarlo
 * porque aquel módulo arrastra el cliente de Supabase y este tiene que ser puro.
 *
 * La regex es la MISMA que el CHECK de la tabla `video_bienvenida_enlaces`. El test recorre
 * cada letra del alfabeto contra ella: si alguien cambia una de las dos sin la otra, una
 * parte de los códigos violaría el CHECK (le pasó al primer diseño con la `o` minúscula).
 */
import { randomInt } from 'node:crypto'

export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
export const LARGO_CODIGO = 10
export const REGEX_CODIGO = /^[A-HJ-NP-Za-km-z2-9]{10}$/

export function generarCodigo(): string {
  let out = ''
  for (let i = 0; i < LARGO_CODIGO; i++) out += ALFABETO[randomInt(ALFABETO.length)]
  return out
}

export function esCodigoValido(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && REGEX_CODIGO.test(codigo)
}

/** `https://inmodf.com.ar/t/<código>`: el dominio corto de la plataforma (decisión del dueño). */
export function urlDelEnlace(codigo: string, base: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const raiz = (base && base.trim() ? base : 'https://inmodf.com.ar').replace(/\/+$/, '')
  return `${raiz}/t/${codigo}`
}
