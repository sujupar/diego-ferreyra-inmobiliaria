import { describe, it, expect } from 'vitest'
import {
  ORIGENES_MANUALES,
  validarClienteNuevo,
  etapaInicial,
  debeNotificarCreacion,
  resolverProcesoDeCaptacion,
  pareceProcesoIncompleto,
  faltantesDelProceso,
  puedeReasignarAsesor,
  combinarProcesosEncontrados,
  validarDatosCliente,
  camposFaltantes,
  exigeDatosParaMover,
  textoFaltantes,
} from './proceso-manual'

/**
 * Reglas del trabajo MANUAL (tasación o captación cargada a mano).
 *
 * Decisiones del dueño (2026-09-17): no hay orígenes nuevos, y el proceso pasa
 * por las MISMAS etapas que cualquier otro, sin saltear ninguna. Una tasación
 * manual nace "Coordinada" (agendada) y avanza con los botones de siempre.
 */

const base = {
  nombre: '  Marta Gómez ',
  telefono: '11 5555-4444',
  email: ' MARTA@Example.com ',
  origen: 'referido',
  asesorId: '36c721f8-00c5-4714-b085-ba4b784e7a5e',
  direccion: ' Av. Belgrano 1500 ',
  tipo: 'departamento',
  barrio: 'Monserrat',
  ambientes: 2,
  fechaVisita: '2026-09-17',
}

describe('validarClienteNuevo', () => {
  it('limpia y devuelve los datos del cliente cuando está todo', () => {
    const r = validarClienteNuevo(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.nombre).toBe('Marta Gómez')
    expect(r.valor.email).toBe('marta@example.com')
    expect(r.valor.telefono).toBe('11 5555-4444')
    expect(r.valor.telefonoNormalizado).toBe('1155554444')
    expect(r.valor.direccion).toBe('Av. Belgrano 1500')
    expect(r.valor.ambientes).toBe(2)
  })

  it('el email es OBLIGATORIO (decisión del dueño, 2026-09-18)', () => {
    const r = validarClienteNuevo({ ...base, email: undefined })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toContain('Falta el email.')
  })

  it('un nombre que es la dirección no es un cliente', () => {
    const r = validarClienteNuevo({ ...base, nombre: 'Av. Belgrano 1500' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/nombre/i)
  })

  it('exige nombre de persona, no una dirección vacía', () => {
    const r = validarClienteNuevo({ ...base, nombre: ' ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/nombre/i)
  })

  it('exige un teléfono que identifique al cliente (10 dígitos)', () => {
    const corto = validarClienteNuevo({ ...base, telefono: '4444' })
    expect(corto.ok).toBe(false)
    if (!corto.ok) expect(corto.errores.join(' ')).toMatch(/teléfono/i)
    // Con +54 9 adelante es el mismo número y tiene que pasar.
    const largo = validarClienteNuevo({ ...base, telefono: '+54 9 11 5555-4444' })
    expect(largo.ok).toBe(true)
    if (largo.ok) expect(largo.valor.telefonoNormalizado).toBe('1155554444')
  })

  it('rechaza un email mal escrito', () => {
    const r = validarClienteNuevo({ ...base, email: 'marta@@example' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/email/i)
  })

  it('solo acepta los orígenes que la base permite, sin inventar ninguno', () => {
    expect(ORIGENES_MANUALES).toEqual(['embudo', 'referido', 'historico'])
    for (const o of ORIGENES_MANUALES) expect(validarClienteNuevo({ ...base, origen: o }).ok).toBe(true)
    const inventado = validarClienteNuevo({ ...base, origen: 'contacto_directo' })
    expect(inventado.ok).toBe(false)
    if (!inventado.ok) expect(inventado.errores.join(' ')).toMatch(/origen/i)
    // 'tasacion' se ofrecía en alguna pantalla y la base lo rechaza.
    expect(validarClienteNuevo({ ...base, origen: 'tasacion' }).ok).toBe(false)
  })

  it('exige asesor: sin asesor el proceso queda invisible para él en el CRM', () => {
    const r = validarClienteNuevo({ ...base, asesorId: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/asesor/i)
  })

  it('exige dirección, barrio, tipo y ambientes válidos', () => {
    expect(validarClienteNuevo({ ...base, direccion: '' }).ok).toBe(false)
    expect(validarClienteNuevo({ ...base, barrio: '  ' }).ok).toBe(false)
    expect(validarClienteNuevo({ ...base, tipo: 'castillo' }).ok).toBe(false)
    expect(validarClienteNuevo({ ...base, ambientes: 0 }).ok).toBe(false)
  })

  it('el tipo "otro" pide aclarar cuál', () => {
    expect(validarClienteNuevo({ ...base, tipo: 'otro' }).ok).toBe(false)
    const r = validarClienteNuevo({ ...base, tipo: 'otro', tipoOtro: 'Cochera' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.tipoOtro).toBe('Cochera')
  })

  it('exige una fecha de visita con forma de fecha', () => {
    expect(validarClienteNuevo({ ...base, fechaVisita: '' }).ok).toBe(false)
    expect(validarClienteNuevo({ ...base, fechaVisita: '17/09/2026' }).ok).toBe(false)
    expect(validarClienteNuevo({ ...base, fechaVisita: '2026-13-40' }).ok).toBe(false)
    expect(validarClienteNuevo({ ...base, fechaVisita: '2026-09-17' }).ok).toBe(true)
  })

  it('junta todos los errores, no solo el primero', () => {
    const r = validarClienteNuevo({ ...base, nombre: '', telefono: '', origen: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.length).toBeGreaterThanOrEqual(3)
  })
})

describe('etapaInicial', () => {
  it('una tasación manual nace Coordinada: es una tasación agendada como cualquier otra', () => {
    expect(etapaInicial('tasacion')).toBe('scheduled')
  })
  it('una captación manual nace Captada: la propiedad ya está en la agencia', () => {
    expect(etapaInicial('captacion')).toBe('captured')
  })
  it('NUNCA arranca en Entregada: entregar es un acto del asesor, no un efecto de cargar datos', () => {
    expect(etapaInicial('tasacion')).not.toBe('appraisal_sent')
    expect(etapaInicial('captacion')).not.toBe('appraisal_sent')
  })
})

describe('debeNotificarCreacion', () => {
  it('no manda "Tasación agendada" al registrar trabajo ya hecho', () => {
    expect(debeNotificarCreacion('tasacion')).toBe(false)
    expect(debeNotificarCreacion('captacion')).toBe(false)
  })
})

describe('resolverProcesoDeCaptacion', () => {
  const proceso = { id: 'deal-1', stage: 'appraisal_sent' }

  it('con el proceso elegido a mano, capta contra ese', () => {
    const r = resolverProcesoDeCaptacion({ dealIdElegido: 'deal-9', procesosDeLaTasacion: [], propiedadesActivasDelProceso: [] })
    expect(r).toEqual({ tipo: 'proceso', dealId: 'deal-9' })
  })

  it('sin elección, si la tasación tiene UN proceso, usa ese', () => {
    const r = resolverProcesoDeCaptacion({ procesosDeLaTasacion: [proceso], propiedadesActivasDelProceso: [] })
    expect(r).toEqual({ tipo: 'proceso', dealId: 'deal-1' })
  })

  it('si la tasación no tiene proceso, hay que elegir uno (no se inventa)', () => {
    const r = resolverProcesoDeCaptacion({ procesosDeLaTasacion: [], propiedadesActivasDelProceso: [] })
    expect(r.tipo).toBe('elegir')
  })

  it('si la tasación tiene DOS procesos, hay que elegir', () => {
    const r = resolverProcesoDeCaptacion({ procesosDeLaTasacion: [proceso, { id: 'deal-2', stage: 'followup' }], propiedadesActivasDelProceso: [] })
    expect(r.tipo).toBe('elegir')
  })

  it('frena el duplicado: el proceso ya tiene una propiedad activa', () => {
    const r = resolverProcesoDeCaptacion({
      procesosDeLaTasacion: [proceso],
      propiedadesActivasDelProceso: [{ id: 'prop-1' }],
    })
    expect(r).toEqual({ tipo: 'duplicado', propertyId: 'prop-1' })
  })

  it('una propiedad descartada NO cuenta como duplicado', () => {
    const r = resolverProcesoDeCaptacion({ procesosDeLaTasacion: [proceso], propiedadesActivasDelProceso: [] })
    expect(r.tipo).toBe('proceso')
  })
})

describe('combinarProcesosEncontrados', () => {
  const porDireccion = [{ id: 'd1', propertyAddress: 'Av. Belgrano 1500' }]
  const porContacto = [{ id: 'd2', propertyAddress: 'Otra 100' }, { id: 'd1', propertyAddress: 'Av. Belgrano 1500' }]

  it('junta los dos orígenes sin repetir procesos', () => {
    const r = combinarProcesosEncontrados(porDireccion, porContacto)
    expect(r.map(d => d.id)).toEqual(['d1', 'd2'])
  })

  it('respeta un tope para no volcar el CRM entero en un desplegable', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, propertyAddress: 'x' }))
    expect(combinarProcesosEncontrados(muchos, [], 8)).toHaveLength(8)
  })

  it('sin resultados devuelve lista vacía, no null', () => {
    expect(combinarProcesosEncontrados([], [])).toEqual([])
  })
})

describe('pareceProcesoIncompleto', () => {
  it('detecta los procesos que la tasación manual creaba con la dirección como cliente', () => {
    expect(pareceProcesoIncompleto({
      contactoNombre: 'Formosa 5176',
      contactoTelefono: null,
      propertyAddress: 'Formosa 5176, CABA, Villa Ballester, Buenos Aires',
      assignedTo: null,
    })).toBe(true)
  })

  it('un proceso con cliente y asesor de verdad está completo', () => {
    expect(pareceProcesoIncompleto({
      contactoNombre: 'Marta Gómez',
      contactoTelefono: '+5491155554444',
      contactoEmail: 'marta@example.com',
      propertyAddress: 'Av. Belgrano 1500',
      assignedTo: 'asesor-1',
    })).toBe(false)
  })

  it('sin asesor está incompleto aunque el cliente tenga nombre', () => {
    expect(pareceProcesoIncompleto({
      contactoNombre: 'Marta Gómez',
      contactoTelefono: '+5491155554444',
      propertyAddress: 'Av. Belgrano 1500',
      assignedTo: null,
    })).toBe(true)
  })

  it('sin teléfono está incompleto: no hay cómo llamar al cliente', () => {
    expect(pareceProcesoIncompleto({
      contactoNombre: 'Marta Gómez',
      contactoTelefono: '',
      propertyAddress: 'Av. Belgrano 1500',
      assignedTo: 'asesor-1',
    })).toBe(true)
  })
})

describe('faltantesDelProceso', () => {
  it('dice QUÉ falta, no un genérico', () => {
    expect(faltantesDelProceso({
      contactoNombre: 'Formosa 5176',
      contactoTelefono: null,
      propertyAddress: 'Formosa 5176, CABA',
      assignedTo: null,
    })).toEqual(['el nombre real del propietario (hoy figura la dirección)', 'el teléfono', 'el email', 'el asesor'])
  })

  it('un nombre corto que coincide con el principio de la calle NO es la dirección', () => {
    // "Ana" en "Anatole France 200": sin la regla del número, esto se marcaba.
    expect(faltantesDelProceso({
      contactoNombre: 'Ana',
      contactoTelefono: '1155554444',
      contactoEmail: 'ana@example.com',
      propertyAddress: 'Anatole France 200',
      assignedTo: 'asesor-1',
    })).toEqual([])
  })

  it('sin nombre lo pide', () => {
    expect(faltantesDelProceso({ contactoNombre: '  ', contactoTelefono: '1155554444', contactoEmail: 'x@example.com', assignedTo: 'a' }))
      .toEqual(['el nombre del propietario'])
  })

  it('completo → vacío', () => {
    expect(faltantesDelProceso({
      contactoNombre: 'Marta Gómez', contactoTelefono: '1155554444', contactoEmail: 'marta@example.com',
      propertyAddress: 'Av. Belgrano 1500', assignedTo: 'asesor-1',
    })).toEqual([])
  })
})

describe('puedeReasignarAsesor', () => {
  it('admin, dueño y coordinador sí', () => {
    for (const r of ['admin', 'dueno', 'coordinador']) expect(puedeReasignarAsesor(r)).toBe(true)
  })

  it('asesor, abogado, un rol inventado o ninguno: no', () => {
    for (const r of ['asesor', 'abogado', 'rol-que-no-existe', '', null, undefined]) {
      expect(puedeReasignarAsesor(r)).toBe(false)
    }
  })
})

describe('faltantesDelProceso — etapas', () => {
  const sinAsesor = { contactoNombre: 'Marta Gómez', contactoTelefono: '1155554444', contactoEmail: 'marta@example.com', propertyAddress: 'Calle 1', assignedTo: null }

  it('una solicitud del embudo todavía no tiene asesor POR DISEÑO: no se marca', () => {
    expect(faltantesDelProceso({ ...sinAsesor, stage: 'request' })).toEqual([])
    expect(faltantesDelProceso({ ...sinAsesor, stage: 'clase_gratuita' })).toEqual([])
  })

  it('un proceso cerrado tampoco (no hay nada que hacer con él)', () => {
    expect(faltantesDelProceso({ ...sinAsesor, stage: 'lost' })).toEqual([])
    expect(faltantesDelProceso({ ...sinAsesor, stage: 'comprador' })).toEqual([])
  })

  it('una tasación coordinada sin asesor SÍ: nadie la ve en su CRM', () => {
    expect(faltantesDelProceso({ ...sinAsesor, stage: 'scheduled' })).toEqual(['el asesor'])
  })
})

describe('validarDatosCliente — lo mínimo para trabajar un proceso', () => {
  const ok = { nombre: ' Marta Gómez ', telefono: '11 5555-4444', email: ' MARTA@Example.com ' }

  it('limpia y devuelve nombre, teléfono y email', () => {
    const r = validarDatosCliente(ok)
    expect(r).toEqual({ ok: true, valor: { nombre: 'Marta Gómez', telefono: '11 5555-4444', telefonoNormalizado: '1155554444', email: 'marta@example.com' } })
  })

  it('junta TODOS los errores de una vez', () => {
    const r = validarDatosCliente({ nombre: '', telefono: '123', email: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toEqual([
      'Falta el nombre del propietario.',
      'El teléfono tiene que tener al menos 10 dígitos (código de área y número).',
      'Falta el email.',
    ])
  })

  it('un email mal escrito no pasa', () => {
    const r = validarDatosCliente({ ...ok, email: 'marta@@example' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores).toEqual(['El email no parece válido.'])
  })

  it('si se conoce la dirección, el nombre no puede ser la dirección', () => {
    const r = validarDatosCliente({ ...ok, nombre: 'Formosa 5176' }, 'Formosa 5176, CABA')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0]).toMatch(/nombre del propietario/i)
  })
})

describe('camposFaltantes', () => {
  const completo = { contactoNombre: 'Marta Gómez', contactoTelefono: '1155554444', contactoEmail: 'marta@example.com', propertyAddress: 'Av. Belgrano 1500', assignedTo: 'a-1' }

  it('completo → nada', () => {
    expect(camposFaltantes(completo)).toEqual([])
  })

  it('el email ahora cuenta', () => {
    expect(camposFaltantes({ ...completo, contactoEmail: null })).toEqual(['email'])
    expect(camposFaltantes({ ...completo, contactoEmail: 'no-es-un-email' })).toEqual(['email'])
  })

  it('un teléfono incompleto cuenta como faltante', () => {
    expect(camposFaltantes({ ...completo, contactoTelefono: '4444' })).toEqual(['telefono'])
  })

  it('el caso del camino viejo: todo', () => {
    expect(camposFaltantes({ contactoNombre: 'Formosa 5176', propertyAddress: 'Formosa 5176, CABA' }))
      .toEqual(['nombre', 'telefono', 'email', 'asesor'])
  })

  it('el aviso de la ficha también menciona el email', () => {
    expect(faltantesDelProceso({ ...completo, contactoEmail: '', stage: 'scheduled' })).toEqual(['el email'])
  })
})

describe('exigeDatosParaMover', () => {
  it('avanzar exige datos', () => {
    expect(exigeDatosParaMover('scheduled', 'visited')).toBe(true)
    expect(exigeDatosParaMover('visited', 'appraisal_sent')).toBe(true)
    expect(exigeDatosParaMover('appraisal_sent', 'followup')).toBe(true)
    expect(exigeDatosParaMover('appraisal_sent', 'captured')).toBe(true)
    expect(exigeDatosParaMover('followup', 'captured')).toBe(true)
    // Reagendar: se va a volver a contactar al cliente.
    expect(exigeDatosParaMover('not_visited', 'scheduled')).toBe(true)
  })

  it('descartar y "no se realizó" NO exigen nada (decisión del dueño)', () => {
    expect(exigeDatosParaMover('appraisal_sent', 'lost')).toBe(false)
    expect(exigeDatosParaMover('scheduled', 'not_visited')).toBe(false)
  })

  it('quedarse en la misma etapa no es moverse (otro seguimiento dentro de Seguimiento)', () => {
    expect(exigeDatosParaMover('followup', 'followup')).toBe(false)
  })
})

describe('textoFaltantes', () => {
  it('se lee en castellano', () => {
    expect(textoFaltantes(['email'])).toBe('Para avanzar falta el email del cliente.')
    expect(textoFaltantes(['telefono', 'email'])).toBe('Para avanzar faltan el teléfono y el email del cliente.')
    expect(textoFaltantes(['nombre', 'telefono', 'email', 'asesor'])).toBe('Para avanzar faltan el nombre, el teléfono y el email del cliente, y el asesor.')
    expect(textoFaltantes(['asesor'])).toBe('Para avanzar falta asignar el asesor.')
  })
})
