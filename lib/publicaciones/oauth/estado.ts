/**
 * El `state` de OAuth al conectar YouTube o TikTok.
 *
 * Dos frenos juntos: (1) va FIRMADO, así nadie arma uno con otro usuario o
 * para otra red; (2) lleva un nonce que también queda en una cookie del mismo
 * navegador, así un enlace de autorización armado por un tercero no termina
 * conectando SU cuenta de YouTube a nuestra plataforma. Vence a los 10 minutos.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export type PlataformaOAuth = 'youtube' | 'tiktok'
const VIGENCIA_MS = 10 * 60_000

interface Carga {
  p: PlataformaOAuth
  u: string
  n: string
  t: number
}

function firmar(cuerpo: string, secreto: string): string {
  return createHmac('sha256', `publicaciones-oauth:${secreto}`).update(cuerpo).digest('base64url')
}

export function crearEstado(
  secreto: string,
  a: { plataforma: PlataformaOAuth; usuarioId: string; ahora: Date },
): { estado: string; nonce: string } {
  if (!secreto) throw new Error('Falta el secreto para firmar la conexión')
  const nonce = randomBytes(16).toString('base64url')
  const carga: Carga = { p: a.plataforma, u: a.usuarioId, n: nonce, t: a.ahora.getTime() }
  const cuerpo = Buffer.from(JSON.stringify(carga)).toString('base64url')
  return { estado: `${cuerpo}.${firmar(cuerpo, secreto)}`, nonce }
}

export function verificarEstado(
  estado: string,
  secreto: string,
  a: { plataforma: PlataformaOAuth; nonce: string | null; ahora: Date },
): { ok: true; usuarioId: string } | { ok: false; motivo: 'invalido' | 'vencido' } {
  const [cuerpo, firma, sobra] = estado.split('.')
  if (!cuerpo || !firma || sobra !== undefined || !secreto) return { ok: false, motivo: 'invalido' }
  const esperada = Buffer.from(firmar(cuerpo, secreto))
  const dada = Buffer.from(firma)
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return { ok: false, motivo: 'invalido' }
  let carga: Partial<Carga>
  try {
    carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) as Partial<Carga>
  } catch {
    return { ok: false, motivo: 'invalido' }
  }
  if (carga.p !== a.plataforma || typeof carga.u !== 'string' || typeof carga.t !== 'number') return { ok: false, motivo: 'invalido' }
  if (!a.nonce || carga.n !== a.nonce) return { ok: false, motivo: 'invalido' }
  if (a.ahora.getTime() - carga.t > VIGENCIA_MS || carga.t > a.ahora.getTime() + 60_000) return { ok: false, motivo: 'vencido' }
  return { ok: true, usuarioId: carga.u }
}
