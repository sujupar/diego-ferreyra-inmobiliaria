import { describe, it, expect } from 'vitest'
import {
  CUERPOS_DE_PLANTILLA,
  cantidadDeVariables,
  renderCuerpo,
  textoDePlantilla,
  reconstruirDesdeParametros,
} from './cuerpos'

describe('el registro de cuerpos', () => {
  it('todas las plantillas que se mandaron de verdad están', () => {
    // Salió de la base: `SELECT DISTINCT template_name FROM whatsapp_messages`.
    // `tasacion_llamada_v1` todavía no se mandó, pero va igual: es la plantilla
    // a la que apunta el corte a coordinación telefónica, y este test es lo que
    // avisa si alguien la borra de Meta y re-sincroniza el catálogo — sin el
    // cuerpo, el Inbox deja de poder mostrar lo que recibió el cliente.
    for (const n of [
      'recorrido_acceso_v4', 'recorrido_acceso_v3', 'recorrido_acceso_v2', 'recorrido_acceso_util',
      'consulta_plano', 'consulta_plano_util', 'consulta_sin_enlace_v2',
      'tasacion_coordinar_util', 'tasacion_coordinar_v2', 'tasacion_llamada_v1',
    ]) {
      expect(CUERPOS_DE_PLANTILLA[n], n).toBeTruthy()
    }
  })

  it('ningún cuerpo quedó con un marcador suelto o vacío', () => {
    for (const [n, cuerpo] of Object.entries(CUERPOS_DE_PLANTILLA)) {
      expect(cuerpo.trim().length, n).toBeGreaterThan(20)
      expect(cantidadDeVariables(cuerpo), n).toBeGreaterThan(0)
    }
  })
})

describe('renderCuerpo', () => {
  it('reemplaza sin importar el orden en que aparecen', () => {
    // `recorrido_acceso_util` usa {{2}} y {{3}} ANTES que {{1}}.
    const r = renderCuerpo(CUERPOS_DE_PLANTILLA.recorrido_acceso_util, ['Ana', 'la casa de Roque Pérez', '1038'])
    expect(r).toContain('— la casa de Roque Pérez')
    expect(r).toContain('Solicitud #1038')
    expect(r).toContain('Hola Ana,')
    expect(r).not.toMatch(/\{\{\d+\}\}/)
  })

  it('{{10}} no se rompe contra {{1}}', () => {
    const params = Array.from({ length: 10 }, (_, i) => `v${i + 1}`)
    expect(renderCuerpo('{{1}} y {{10}}', params)).toBe('v1 y v10')
  })
})

describe('textoDePlantilla — no inventa mensajes', () => {
  it('arma el mensaje real del recorrido', () => {
    const r = textoDePlantilla('recorrido_acceso_v4', ['Juan', 'Roque Pérez 3059', 'https://inmodf.com.ar/v/Kyf23SuNv2'])
    expect(r).toContain('Hola Juan, ¿cómo estás?')
    expect(r).toContain('Te envío el recorrido de Roque Pérez 3059')
    expect(r).toContain('https://inmodf.com.ar/v/Kyf23SuNv2')
  })

  it('devuelve null si la plantilla no está en el registro', () => {
    expect(textoDePlantilla('plantilla_que_no_conocemos', ['a', 'b'])).toBeNull()
  })

  it('devuelve null si la cantidad de parámetros NO coincide', () => {
    // Mejor mostrar los parámetros que un mensaje que el cliente no recibió.
    expect(textoDePlantilla('recorrido_acceso_v4', ['Juan', 'Roque Pérez 3059'])).toBeNull()
    expect(textoDePlantilla('recorrido_acceso_v4', ['a', 'b', 'c', 'd'])).toBeNull()
  })

  it('sin nombre de plantilla, null', () => {
    expect(textoDePlantilla(null, ['a'])).toBeNull()
  })
})

describe('reconstruirDesdeParametros — arregla el historial sin migrar nada', () => {
  it('EL CASO REPORTADO: "Juan · Roque Pérez 3059 · https://…"', () => {
    const r = reconstruirDesdeParametros(
      'recorrido_acceso_v4',
      'Juan · Roque Pérez 3059 · https://inmodf.com.ar/v/Kyf23SuNv2',
    )
    expect(r).toContain('Hola Juan, ¿cómo estás?')
    expect(r).toContain('Te envío el recorrido de Roque Pérez 3059')
  })

  it('otro caso real de la base, con la plantilla v3', () => {
    const r = reconstruirDesdeParametros(
      'recorrido_acceso_v3',
      'Julian · Casa 3 ambientes premium con jardín y pileta · hvMsTaJUe3',
    )
    expect(r).toContain('Hola Julian')
    expect(r).toContain('Casa 3 ambientes premium con jardín y pileta')
    expect(r).toContain('Solicitud hvMsTaJUe3')
  })

  it('NO toca un mensaje que ya tiene el texto real guardado', () => {
    // Los envíos nuevos ya guardan el mensaje entero: rearmarlo sería pisarlo.
    const yaBueno = 'Hola Diego, ¿cómo estás? Soy del equipo de Diego Ferreyra Inmobiliaria.\n\nTe paso el plano…'
    expect(reconstruirDesdeParametros('consulta_plano', yaBueno)).toBeNull()
  })

  it('un mensaje de texto suelto no se toca', () => {
    expect(reconstruirDesdeParametros(null, 'Hola, ¿sigue disponible?')).toBeNull()
    expect(reconstruirDesdeParametros('recorrido_acceso_v4', null)).toBeNull()
  })

  it('si los parámetros no parten bien, no inventa', () => {
    expect(reconstruirDesdeParametros('recorrido_acceso_v4', 'algo raro sin separadores')).toBeNull()
  })
})
