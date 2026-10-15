/**
 * Saneo de los ajustes de la encuesta que manda /settings/encuesta (adenda §11.1.5) y estado de las
 * dos plantillas configuradas en Netlify. Puro: el normalizador de teléfonos entra por parámetro.
 */
import { z } from 'zod'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { PLANTILLAS_ENCUESTA, PLANTILLAS_REGALO, definicionDe } from './plantillas'
import type { AjustesEncuesta } from './tipos'

/** Mismo tope que el CHECK de visit_survey_settings.telefonos_prueba. */
export const MAX_TELEFONOS_PRUEBA = 10

export const cuerpoAjustes = z.object({
  envio_automatico: z.boolean().optional(),
  solo_con_regalo: z.boolean().optional(),
  regalo_por_whatsapp: z.boolean().optional(),
  telefonos_prueba: z.array(z.string().max(40)).max(MAX_TELEFONOS_PRUEBA).optional(),
}).strict()

export function sanearAjustes(
  body: unknown,
  normalizar: (v: string | null | undefined) => string | null,
): { ok: true; cambios: Partial<AjustesEncuesta> } | { ok: false; error: string } {
  const p = cuerpoAjustes.safeParse(body)
  if (!p.success) return { ok: false, error: 'Datos inválidos' }
  const cambios: Partial<AjustesEncuesta> = {}
  if (p.data.envio_automatico !== undefined) cambios.envio_automatico = p.data.envio_automatico
  if (p.data.solo_con_regalo !== undefined) cambios.solo_con_regalo = p.data.solo_con_regalo
  if (p.data.regalo_por_whatsapp !== undefined) cambios.regalo_por_whatsapp = p.data.regalo_por_whatsapp
  if (p.data.telefonos_prueba !== undefined) {
    const malos: string[] = []
    const vistos = new Set<string>()
    const buenos: string[] = []
    for (const crudo of p.data.telefonos_prueba) {
      const n = normalizar(crudo)
      const clave = n ? ultimos10Digitos(n) : null
      if (!n || !clave) { malos.push(crudo.trim() || '(vacío)'); continue }
      if (!vistos.has(clave)) { vistos.add(clave); buenos.push(n) }
    }
    if (malos.length > 0) return { ok: false, error: `Revisá estos teléfonos: ${malos.join(', ')}` }
    cambios.telefonos_prueba = buenos
  }
  if (Object.keys(cambios).length === 0) return { ok: false, error: 'No hay cambios' }
  return { ok: true, cambios }
}

export interface EstadoPlantilla {
  uso: 'encuesta' | 'regalo'
  variable: string
  configurada: string | null
  conocida: boolean
  conBoton: boolean
  conDocumento: boolean
}

export function estadoDePlantillas(env: { encuesta?: string; regalo?: string }): EstadoPlantilla[] {
  const una = (uso: 'encuesta' | 'regalo', variable: string, valor: string | undefined): EstadoPlantilla => {
    const configurada = valor?.trim() || null
    const def = definicionDe(uso === 'encuesta' ? PLANTILLAS_ENCUESTA : PLANTILLAS_REGALO, configurada)
    return { uso, variable, configurada, conocida: def !== null, conBoton: def?.conBoton ?? false, conDocumento: def?.encabezado === 'document' }
  }
  return [
    una('encuesta', 'WHATSAPP_TEMPLATE_ENCUESTA_VISITA', env.encuesta),
    una('regalo', 'WHATSAPP_TEMPLATE_REGALO_VISITA', env.regalo),
  ]
}
