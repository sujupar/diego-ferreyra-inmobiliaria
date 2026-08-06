import { describe, it, expect } from 'vitest'
import { decidirEnvio } from './consulta-envio'

/** Normalizador de mentira: deja solo dígitos. Alcanza para probar los frenos. */
const normalizar = (v: string | null | undefined): string | null => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d : null
}

const MI_TEL = '573107822955'
const OTRO = '5491122334455'
const prendido = { consulta_respuesta_enabled: true, consulta_test_phones: [] as string[] }

function consulta(over: Partial<Parameters<typeof decidirEnvio>[0]> = {}) {
  return { lead_phone: `+${MI_TEL}`, property_id: 'prop-1', whatsapp_enviado_at: null, ...over }
}

describe('decidirEnvio', () => {
  it('con todo en orden, manda', () => {
    expect(decidirEnvio(consulta(), prendido, normalizar)).toEqual({ enviar: true, telefono: MI_TEL })
  })

  it('APAGADO no manda, aunque la consulta sea perfecta', () => {
    const r = decidirEnvio(consulta(), { ...prendido, consulta_respuesta_enabled: false }, normalizar)
    expect(r.enviar).toBe(false)
  })

  it('sin ajustes (no se pudieron leer) tampoco: fail-closed', () => {
    expect(decidirEnvio(consulta(), null, normalizar).enviar).toBe(false)
  })

  it('no manda dos veces la misma consulta — la ingesta reprocesa mails', () => {
    const r = decidirEnvio(consulta({ whatsapp_enviado_at: '2026-08-06T10:00:00Z' }), prendido, normalizar)
    expect(r).toEqual({ enviar: false, motivo: 'ya se le había mandado', visibleParaElEquipo: false })
  })

  it('SIN PROPIEDAD no manda, y el equipo tiene que verlo', () => {
    const r = decidirEnvio(consulta({ property_id: null }), prendido, normalizar)
    expect(r.enviar).toBe(false)
    if (!r.enviar) {
      expect(r.motivo).toMatch(/no sabemos por qué propiedad/)
      expect(r.visibleParaElEquipo).toBe(true)
    }
  })

  it('sin teléfono usable tampoco, y también se ve', () => {
    for (const tel of [null, '', 'no tiene', '123']) {
      const r = decidirEnvio(consulta({ lead_phone: tel }), prendido, normalizar)
      expect(r.enviar).toBe(false)
      if (!r.enviar) expect(r.visibleParaElEquipo).toBe(true)
    }
  })

  describe('modo prueba', () => {
    const soloYo = { consulta_respuesta_enabled: true, consulta_test_phones: [MI_TEL] }

    it('a mi número SÍ le escribe', () => {
      expect(decidirEnvio(consulta(), soloYo, normalizar)).toEqual({ enviar: true, telefono: MI_TEL })
    })

    it('a cualquier otro NO, y queda a la vista para que alguien lo atienda', () => {
      const r = decidirEnvio(consulta({ lead_phone: `+${OTRO}` }), soloYo, normalizar)
      expect(r.enviar).toBe(false)
      if (!r.enviar) {
        expect(r.motivo).toMatch(/modo prueba/)
        expect(r.visibleParaElEquipo).toBe(true)
      }
    })

    it('la lista tolera formatos distintos: se compara normalizado', () => {
      const conFormato = { consulta_respuesta_enabled: true, consulta_test_phones: [`+${MI_TEL}`] }
      expect(decidirEnvio(consulta({ lead_phone: MI_TEL }), conFormato, normalizar).enviar).toBe(true)
    })

    it('un número basura en la lista no rompe ni habilita a nadie', () => {
      const rota = { consulta_respuesta_enabled: true, consulta_test_phones: ['', 'hola', MI_TEL] }
      expect(decidirEnvio(consulta(), rota, normalizar).enviar).toBe(true)
      expect(decidirEnvio(consulta({ lead_phone: `+${OTRO}` }), rota, normalizar).enviar).toBe(false)
    })

    it('lista VACÍA = sin restricción (el freno real es el interruptor)', () => {
      expect(decidirEnvio(consulta({ lead_phone: `+${OTRO}` }), prendido, normalizar).enviar).toBe(true)
    })
  })
})
