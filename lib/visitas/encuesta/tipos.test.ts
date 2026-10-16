import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ESTADOS_ENVIO, MOTIVOS_OMISION, ESTADOS_AVISO, OPINIONES_PRECIO, MONEDAS, PASOS_GUARDABLES,
  COLUMNAS_DE_CANAL, CANALES_AVISO, monedaDe,
} from './tipos'

const SQL = readFileSync('supabase/migrations/20261015000002_encuesta_de_visita.sql', 'utf8')

/** Valores entre comillas del `IN (...)` de la línea que define `columna`. */
function valoresDelCheck(columna: string): string[] {
  const linea = SQL.split('\n').find(l => l.trimStart().startsWith(`${columna} TEXT`))
  if (!linea) throw new Error(`no encontré la columna ${columna} en la migración`)
  const dentro = linea.match(/IN \(([^)]*)\)/)?.[1] ?? ''
  return [...dentro.matchAll(/'([^']+)'/g)].map(m => m[1])
}

describe('catálogos = CHECK de la base (se tocan JUNTOS)', () => {
  it.each([
    ['send_status', ESTADOS_ENVIO],
    ['send_skip_reason', MOTIVOS_OMISION],
    ['team_notice_status', ESTADOS_AVISO],
    ['gift_whatsapp_status', ESTADOS_AVISO],
    ['gift_email_status', ESTADOS_AVISO],
    ['price_opinion', OPINIONES_PRECIO],
    ['offer_currency', MONEDAS],
    ['last_step', PASOS_GUARDABLES],
  ] as const)('%s', (columna, catalogo) => {
    expect(valoresDelCheck(columna)).toEqual([...catalogo])
  })
  it('cada canal de aviso apunta a columnas que existen en la tabla', () => {
    for (const canal of CANALES_AVISO) {
      const { estado, momento } = COLUMNAS_DE_CANAL[canal]
      expect(SQL).toContain(`  ${estado} TEXT`)
      expect(SQL).toContain(`  ${momento} TIMESTAMPTZ`)
    }
  })
})

describe('monedaDe', () => {
  it('ARS es ARS; cualquier otra cosa (USD, null, basura) es USD, la moneda de los avisos', () => {
    expect(monedaDe('ARS')).toBe('ARS')
    expect(monedaDe('USD')).toBe('USD')
    expect(monedaDe(null)).toBe('USD')
    expect(monedaDe('pesos')).toBe('USD')
  })
})
