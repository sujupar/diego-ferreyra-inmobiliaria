import { describe, it, expect } from 'vitest'
import {
  decidirQueHacer,
  esCuentaDePrueba,
  normalizarUsuario,
  type AjustesGlobales,
  type ComentarioEntrante,
  type ReelParaDecidir,
} from './decision'

const AHORA = new Date('2026-09-22T12:00:00Z')

const reelOk: ReelParaDecidir = {
  palabra_clave: 'propiedad',
  automatizacion_activa: true,
  automatizacion_desde: '2026-09-22T10:00:00Z',
  simulacro: false,
  estado: 'publicado',
}

const todoPrendido: AjustesGlobales = {
  automatizacion_habilitada: true,
  dm_habilitado: true,
  cuentas_de_prueba: [],
}

const comentarioOk: ComentarioEntrante = {
  texto: 'hola, propiedad',
  creado_en: '2026-09-22T11:00:00Z',
  autor_ig_id: '123',
  autor_username: 'cliente_real',
  es_de_la_cuenta: false,
  ya_recibio_dm: false,
}

describe('decidirQueHacer — el camino feliz', () => {
  it('con todo en orden, responde y manda el privado', () => {
    expect(decidirQueHacer(reelOk, comentarioOk, todoPrendido, AHORA))
      .toEqual({ accion: 'responder_y_dm' })
  })
})

describe('decidirQueHacer — los frenos que apagan todo', () => {
  it('el interruptor global apagado no deja hacer NADA', () => {
    expect(decidirQueHacer(reelOk, comentarioOk, { ...todoPrendido, automatizacion_habilitada: false }, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'automatizacion_global_apagada' })
  })

  it('la automatización del reel apagada no deja hacer nada', () => {
    expect(decidirQueHacer({ ...reelOk, automatizacion_activa: false }, comentarioOk, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'reel_sin_automatizacion' })
  })

  it('un reel que todavía no está publicado no automatiza', () => {
    expect(decidirQueHacer({ ...reelOk, estado: 'borrador' }, comentarioOk, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'reel_no_publicado' })
  })

  it('sin fecha de activación NO automatiza (falla cerrado)', () => {
    // Sin esa fecha no se puede distinguir un comentario nuevo de uno de hace
    // una semana. Ante la duda no se le escribe a nadie.
    expect(decidirQueHacer({ ...reelOk, automatizacion_desde: null }, comentarioOk, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'sin_fecha_de_activacion' })
  })

  it('una fecha de activación ilegible también frena todo', () => {
    expect(decidirQueHacer({ ...reelOk, automatizacion_desde: 'cualquier cosa' }, comentarioOk, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'sin_fecha_de_activacion' })
  })
})

describe('decidirQueHacer — qué comentarios no se tocan', () => {
  it('ignora un comentario ANTERIOR a activar la automatización', () => {
    // El caso de los 33 comentarios viejos del reel del 20/09: enganchar un reel
    // no puede escribirle a quien comentó hace días esperando otra cosa.
    // Instagram lee eso como spam y es la forma más rápida de que limiten la cuenta.
    const viejo = { ...comentarioOk, creado_en: '2026-09-20T15:00:00Z' }
    expect(decidirQueHacer(reelOk, viejo, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'comentario_anterior_a_la_activacion' })
  })

  it('ignora los comentarios de la propia cuenta', () => {
    // Nuestras propias respuestas entran por el mismo webhook. Sin este freno,
    // el sistema se contesta a sí mismo en un bucle.
    expect(decidirQueHacer(reelOk, { ...comentarioOk, es_de_la_cuenta: true }, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'comentario_propio' })
  })

  it('ignora el comentario que no contiene la palabra', () => {
    expect(decidirQueHacer(reelOk, { ...comentarioOk, texto: 'qué lindo' }, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'no_coincide' })
  })

  it('ignora un comentario sin texto', () => {
    expect(decidirQueHacer(reelOk, { ...comentarioOk, texto: null }, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'no_coincide' })
  })

  it('un reel sin palabra configurada no automatiza', () => {
    expect(decidirQueHacer({ ...reelOk, palabra_clave: null }, comentarioOk, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'no_coincide' })
  })

  it('el comentario propio se descarta ANTES de mirar la palabra', () => {
    // Nuestra propia respuesta podría contener la palabra si el asesor la
    // escribió en el texto. El orden de los frenos evita el bucle.
    const propioConPalabra = { ...comentarioOk, es_de_la_cuenta: true, texto: 'propiedad' }
    expect(decidirQueHacer(reelOk, propioConPalabra, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'comentario_propio' })
  })
})

describe('decidirQueHacer — simulacro', () => {
  it('en simulacro no manda nada, solo registra', () => {
    expect(decidirQueHacer({ ...reelOk, simulacro: true }, comentarioOk, todoPrendido, AHORA))
      .toEqual({ accion: 'simular' })
  })

  it('el simulacro NO tapa los descartes: lo que se ignora se sigue ignorando', () => {
    // Si el simulacro devolviera 'simular' para todo, el asesor vería en el
    // registro "le habría escrito" a gente a la que en realidad nunca le
    // escribiría — y decidiría con información falsa.
    const viejo = { ...comentarioOk, creado_en: '2026-09-20T15:00:00Z' }
    expect(decidirQueHacer({ ...reelOk, simulacro: true }, viejo, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'comentario_anterior_a_la_activacion' })
  })

  it('en simulacro tampoco importa que el privado esté deshabilitado', () => {
    // Se simula la cadena completa: es justamente para ver qué haría con todo prendido.
    expect(decidirQueHacer({ ...reelOk, simulacro: true }, comentarioOk, { ...todoPrendido, dm_habilitado: false }, AHORA))
      .toEqual({ accion: 'simular' })
  })
})

describe('decidirQueHacer — cuando responde pero no manda el privado', () => {
  it('con los privados deshabilitados responde igual, sin prometer nada', () => {
    // Es el estado del día uno: Meta todavía no destrabó pages_messaging.
    expect(decidirQueHacer(reelOk, comentarioOk, { ...todoPrendido, dm_habilitado: false }, AHORA))
      .toEqual({ accion: 'solo_responder', motivo: 'dm_deshabilitado' })
  })

  it('a quien ya recibió el privado le responde, pero no le manda otro', () => {
    // Instagram permite UN solo privado por persona que comenta. Y quedarse
    // callado en público haría que su comentario parezca ignorado.
    expect(decidirQueHacer(reelOk, { ...comentarioOk, ya_recibio_dm: true }, todoPrendido, AHORA))
      .toEqual({ accion: 'solo_responder', motivo: 'ya_recibio_dm' })
  })

  it('no manda el privado pasados los 7 días del comentario', () => {
    const reelViejo = { ...reelOk, automatizacion_desde: '2026-09-01T00:00:00Z' }
    const vencido = { ...comentarioOk, creado_en: '2026-09-10T11:00:00Z' }
    expect(decidirQueHacer(reelViejo, vencido, todoPrendido, AHORA))
      .toEqual({ accion: 'solo_responder', motivo: 'ventana_de_7_dias_vencida' })
  })

  it('justo adentro de los 7 días todavía manda el privado', () => {
    const reelViejo = { ...reelOk, automatizacion_desde: '2026-09-01T00:00:00Z' }
    const alLimite = { ...comentarioOk, creado_en: '2026-09-15T13:00:00Z' } // faltan 1 h
    expect(decidirQueHacer(reelViejo, alLimite, todoPrendido, AHORA))
      .toEqual({ accion: 'responder_y_dm' })
  })

  it('una fecha de comentario ilegible no bloquea la respuesta pública', () => {
    // Que Meta mande una fecha rara no puede hacer que el comentario se pierda.
    // Pero sin fecha confiable no se arriesga el privado.
    const raro = { ...comentarioOk, creado_en: 'ayer a la tarde' }
    expect(decidirQueHacer(reelOk, raro, todoPrendido, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'comentario_anterior_a_la_activacion' })
  })
})

describe('cuentas de prueba — reconocer la cuenta', () => {
  it('normaliza el usuario: sin @, sin espacios, en minúscula', () => {
    expect(normalizarUsuario('  @JulianDavidPR ')).toBe('juliandavidpr')
  })

  it('reconoce la cuenta aunque en la lista esté escrita con @ o mayúsculas', () => {
    expect(esCuentaDePrueba('juliandavidpr', ['@JulianDavidPR'])).toBe(true)
  })

  it('exige el nombre EXACTO: un pedazo no alcanza', () => {
    // "julian" está adentro de "juliandavidpr", pero es otra persona.
    expect(esCuentaDePrueba('julian', ['juliandavidpr'])).toBe(false)
    expect(esCuentaDePrueba('juliandavidpr2', ['juliandavidpr'])).toBe(false)
  })

  it('sin nombre de usuario NO es cuenta de prueba (falla cerrado)', () => {
    expect(esCuentaDePrueba(null, ['juliandavidpr'])).toBe(false)
    expect(esCuentaDePrueba('', ['juliandavidpr'])).toBe(false)
    expect(esCuentaDePrueba('  @ ', ['@'])).toBe(false)
  })

  it('con la lista vacía nadie es cuenta de prueba', () => {
    expect(esCuentaDePrueba('juliandavidpr', [])).toBe(false)
  })
})

describe('decidirQueHacer — cuentas de prueba con el reel en simulacro', () => {
  const enSimulacro = { ...reelOk, simulacro: true }
  const conPrueba: AjustesGlobales = { ...todoPrendido, cuentas_de_prueba: ['juliandavidpr'] }
  const delDueno: ComentarioEntrante = { ...comentarioOk, autor_ig_id: '999', autor_username: 'juliandavidpr' }

  it('a la cuenta de prueba le responde de verdad', () => {
    expect(decidirQueHacer(enSimulacro, delDueno, conPrueba, AHORA))
      .toEqual({ accion: 'responder_y_dm' })
  })

  it('con los privados apagados, la cuenta de prueba recibe solo la respuesta pública', () => {
    // Es el caso de HOY: falta pages_messaging. La respuesta que sale no promete
    // un privado que no va a llegar.
    expect(decidirQueHacer(enSimulacro, delDueno, { ...conPrueba, dm_habilitado: false }, AHORA))
      .toEqual({ accion: 'solo_responder', motivo: 'dm_deshabilitado' })
  })

  it('a cualquier otra persona la sigue simulando: no se le manda nada', () => {
    expect(decidirQueHacer(enSimulacro, comentarioOk, conPrueba, AHORA))
      .toEqual({ accion: 'simular' })
  })

  it('un aviso sin nombre de usuario queda en simulacro', () => {
    expect(decidirQueHacer(enSimulacro, { ...delDueno, autor_username: null }, conPrueba, AHORA))
      .toEqual({ accion: 'simular' })
  })

  it('la cuenta de prueba sin la palabra se ignora como cualquiera', () => {
    expect(decidirQueHacer(enSimulacro, { ...delDueno, texto: 'qué lindo' }, conPrueba, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'no_coincide' })
  })

  it('la excepción NO salta los frenos globales', () => {
    expect(decidirQueHacer(enSimulacro, delDueno, { ...conPrueba, automatizacion_habilitada: false }, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'automatizacion_global_apagada' })
  })

  it('la excepción NO salta el freno de los comentarios viejos', () => {
    const viejo = { ...delDueno, creado_en: '2026-09-22T09:00:00Z' }
    expect(decidirQueHacer(enSimulacro, viejo, conPrueba, AHORA))
      .toEqual({ accion: 'ignorar', motivo: 'comentario_anterior_a_la_activacion' })
  })

  it('la cuenta de prueba tampoco recibe dos privados por el mismo reel', () => {
    expect(decidirQueHacer(enSimulacro, { ...delDueno, ya_recibio_dm: true }, conPrueba, AHORA))
      .toEqual({ accion: 'solo_responder', motivo: 'ya_recibio_dm' })
  })

  it('sin simulacro la lista no cambia nada: a todos se les responde', () => {
    expect(decidirQueHacer(reelOk, comentarioOk, conPrueba, AHORA))
      .toEqual({ accion: 'responder_y_dm' })
  })
})
