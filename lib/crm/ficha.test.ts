import { describe, it, expect } from 'vitest'
import { armarFicha, perfilesANombrar, procesosParaLeerHistorial, type DatosFicha, type ProcesoDeFicha } from './ficha'

// 2026-11-25 15:00 UTC = miércoles 12:00 de Argentina.
const AHORA = new Date('2026-11-25T15:00:00.000Z')
const haceMin = (m: number) => new Date(AHORA.getTime() - m * 60_000).toISOString()

const proceso = (p: Partial<ProcesoDeFicha> & { id: string }): ProcesoDeFicha => ({
  stage: 'request',
  created_at: '2026-11-20T10:00:00.000Z',
  assigned_to: null,
  scheduled_date: null,
  scheduled_time: null,
  origin: 'embudo',
  property_address: 'Av. Siempreviva 742',
  neighborhood: 'Palermo',
  property_type: 'departamento',
  property_type_other: null,
  rooms: 3,
  covered_area: 70,
  meta_campaign_name: 'Campaña Tasación',
  meta_adset_name: 'Conjunto A',
  meta_ad_name: 'Anuncio 1',
  stage_changed_at: '2026-11-20T10:00:00.000Z',
  lost_at: null,
  visited_at: null,
  ...p,
})

const datos = (d: Partial<DatosFicha> = {}): DatosFicha => ({
  contacto: {
    id: 'c-1',
    full_name: '[TEST] Ana',
    phone: '+5491155550142',
    email: 'ana@example.com',
    origin: 'referido',
    notes: 'Prefiere la tarde',
    assigned_to: null,
    created_by: null,
  },
  procesos: [],
  tasaciones: [],
  propiedades: [],
  ultimoIntentoEn: null,
  ...d,
})

const NOMBRES = new Map([
  ['asesor-1', 'Aldo Asesor'],
  ['asesor-2', 'Berta Asesora'],
  ['coord-1', 'Cora Coordinadora'],
])
const COORD = { id: 'coord-1', role: 'coordinador' as const }
const ASESOR = { id: 'asesor-1', role: 'asesor' as const }

const ficha = (d: DatosFicha, usuario: { id: string; role: 'coordinador' | 'asesor' | 'admin' } = COORD, cambios = new Map()) =>
  armarFicha({ datos: d, cambiosAPerdido: cambios, nombres: NOMBRES, usuario, ahora: AHORA })

describe('armarFicha — persona, proceso activo y detalles', () => {
  it('contacto sin procesos: sin etapa, origen del contacto y "Sin asignar todavía"', () => {
    const f = ficha(datos())
    expect(f.persona).toMatchObject({ id: 'c-1', full_name: '[TEST] Ana', phone: '+5491155550142', notes: 'Prefiere la tarde', asesor: null })
    expect(f.procesoActivo).toBeNull()
    expect(f.detalles).toMatchObject({ etapa: null, origen: 'referido', direccion: null, campana: null })
    expect(f.detalles.asesor).toEqual({ mostrar: true, id: null, nombre: null })
    expect(f.procesos).toEqual([])
    expect(f.tasacionesAgendadas).toEqual([])
    expect(f.archivos).toEqual({ tasaciones: [], propiedades: [] })
  })

  it('solicitud del embudo: cabecera y Detalles con la etiqueta del CRM y los datos del proceso', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-1' })] }))
    expect(f.procesoActivo).toEqual({ id: 'd-1', etapa: 'solicitud', etiquetaEtapa: 'Solicitud', situacion: 'solicitud' })
    expect(f.detalles).toMatchObject({
      etapa: { clave: 'solicitud', etiqueta: 'Solicitud' },
      origen: 'embudo',
      campana: 'Campaña Tasación',
      conjunto: 'Conjunto A',
      anuncio: 'Anuncio 1',
      direccion: 'Av. Siempreviva 742',
      barrio: 'Palermo',
      tipoPropiedad: 'departamento',
      ambientes: 3,
      superficie: 70,
    })
  })

  it('tipo "otro" muestra el texto cargado a mano', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-1', property_type: 'otro', property_type_other: 'Galpón' })] }))
    expect(f.detalles.tipoPropiedad).toBe('Galpón')
  })

  it('scheduled sin día cuenta como Solicitud (mismo criterio que el CRM)', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-1', stage: 'scheduled' })] }))
    expect(f.procesoActivo?.etiquetaEtapa).toBe('Solicitud')
  })

  it('el asesor del proceso gana sobre el del contacto; sin ninguno, "Sin asignar todavía"', () => {
    const conAsesor = ficha(datos({ procesos: [proceso({ id: 'd-1', assigned_to: 'asesor-2' })] }))
    expect(conAsesor.detalles.asesor).toEqual({ mostrar: true, id: 'asesor-2', nombre: 'Berta Asesora' })
    const sinNadie = ficha(datos({ procesos: [proceso({ id: 'd-1' })] }))
    expect(sinNadie.detalles.asesor).toEqual({ mostrar: true, id: null, nombre: null })
  })

  it('dos solicitudes abiertas (coordinadora): activo = la más nueva, las dos con puede_convertir', () => {
    const f = ficha(datos({
      procesos: [proceso({ id: 'd-vieja' }), proceso({ id: 'd-nueva', created_at: '2026-11-24T10:00:00.000Z' })],
    }))
    expect(f.procesoActivo?.id).toBe('d-nueva')
    expect(f.procesos.map((p) => [p.id, p.puede_convertir])).toEqual([
      ['d-nueva', true],
      ['d-vieja', true],
    ])
  })

  it('solicitud + clase más nueva: activo = la clase; la solicitud con puede_convertir', () => {
    const f = ficha(datos({
      procesos: [
        proceso({ id: 'd-sol' }),
        proceso({ id: 'd-clase', stage: 'clase_gratuita', origin: 'clase_gratuita', created_at: '2026-11-24T10:00:00.000Z' }),
      ],
    }))
    expect(f.procesoActivo).toMatchObject({ id: 'd-clase', etiquetaEtapa: 'Clase Gratuita', situacion: 'clase_gratuita' })
    expect(f.procesos.find((p) => p.id === 'd-sol')?.puede_convertir).toBe(true)
    expect(f.procesos.find((p) => p.id === 'd-clase')?.puede_convertir).toBe(false)
  })

  it('origen clase_gratuita en solicitud, o proceso ya coordinado → puede_convertir falso', () => {
    const f = ficha(datos({
      procesos: [
        proceso({ id: 'd-clase-sol', origin: 'clase_gratuita' }),
        proceso({ id: 'd-coord', stage: 'scheduled', scheduled_date: '2026-11-28' }),
      ],
    }))
    expect(f.procesos.every((p) => !p.puede_convertir)).toBe(true)
  })
})

describe('armarFicha — lo que ve un asesor', () => {
  it('solicitud propia → listada con puede_convertir', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-1', assigned_to: 'asesor-1' })] }), ASESOR)
    expect(f.procesos).toEqual([expect.objectContaining({ id: 'd-1', puede_convertir: true })])
  })

  it('Archivos: la tasación que llega por el proceso de otro asesor no se lista; sin asesor tampoco (su enlace daría 403)', () => {
    // `leerDatosDeFicha` ya sumó las tasaciones de los procesos (ROJO 1 del QA); el filtro
    // del asesor es el de D4: `appraisals.assigned_to`/`user_id` = él, lo mismo que mira
    // `canAccessAppraisal` para abrir `/appraisals/<id>`.
    const f = ficha(
      datos({
        procesos: [proceso({ id: 'd-mio', assigned_to: 'asesor-1' }), proceso({ id: 'd-otro', assigned_to: 'asesor-2' })],
        tasaciones: [
          { id: 'ap-de-mi-proceso', property_title: 'Mía', property_location: null, created_at: '2026-11-02T00:00:00Z', assigned_to: 'asesor-1', user_id: null },
          { id: 'ap-del-proceso-ajeno', property_title: 'Ajena', property_location: null, created_at: '2026-11-03T00:00:00Z', assigned_to: 'asesor-2', user_id: 'asesor-2' },
          { id: 'ap-sin-asesor', property_title: 'Nadie', property_location: null, created_at: '2026-11-04T00:00:00Z', assigned_to: null, user_id: null },
        ],
      }),
      ASESOR,
    )
    expect(f.archivos.tasaciones.map((a) => a.id)).toEqual(['ap-de-mi-proceso'])
  })

  it('un proceso suyo y otro activo de otro asesor: listas solo con lo suyo, etapa visible, datos del ajeno en null', () => {
    const f = ficha(
      datos({
        contacto: { ...datos().contacto, assigned_to: 'asesor-1' },
        procesos: [
          proceso({ id: 'd-mio', stage: 'lost', assigned_to: 'asesor-1', created_at: '2026-10-01T10:00:00.000Z' }),
          proceso({ id: 'd-otro', assigned_to: 'asesor-2', stage: 'scheduled', scheduled_date: '2026-11-28', scheduled_time: '10:00', property_address: 'Calle Ajena 99', neighborhood: 'Belgrano', meta_campaign_name: 'Campaña Ajena' }),
        ],
        tasaciones: [
          { id: 'ap-mia', property_title: 'Mía', property_location: 'X', created_at: '2026-10-02T00:00:00Z', assigned_to: 'asesor-1', user_id: null },
          { id: 'ap-otra', property_title: 'Otra', property_location: 'Y', created_at: '2026-11-21T00:00:00Z', assigned_to: 'asesor-2', user_id: 'asesor-2' },
        ],
        propiedades: [{ id: 'pr-otra', address: 'Z', neighborhood: null, created_at: '2026-11-22T00:00:00Z', assigned_to: 'asesor-2' }],
      }),
      ASESOR,
    )
    expect(f.procesos.map((p) => p.id)).toEqual(['d-mio'])
    expect(f.tasacionesAgendadas).toEqual([])
    expect(f.archivos.tasaciones.map((a) => a.id)).toEqual(['ap-mia'])
    expect(f.archivos.propiedades).toEqual([])
    expect(f.procesoActivo).toMatchObject({ id: 'd-otro', etiquetaEtapa: 'Coordinada' })
    expect(f.detalles).toMatchObject({
      etapa: { clave: 'coordinada', etiqueta: 'Coordinada' },
      origen: 'referido', // el del contacto, no el del proceso ajeno
      campana: null,
      conjunto: null,
      anuncio: null,
      direccion: null,
      barrio: null,
      tipoPropiedad: null,
      ambientes: null,
      superficie: null,
    })
    expect(f.detalles.asesor).toEqual({ mostrar: true, id: 'asesor-1', nombre: 'Aldo Asesor' })
    for (const ajeno of ['Calle Ajena', 'Belgrano', 'Campaña Ajena', 'Berta Asesora']) expect(JSON.stringify(f)).not.toContain(ajeno)
  })

  it('proceso activo ajeno y contacto sin asesor → el renglón Asesor no se dibuja', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-otro', assigned_to: 'asesor-2' })] }), ASESOR)
    expect(f.detalles.asesor).toEqual({ mostrar: false, id: null, nombre: null })
  })

  it('contacto creado por él con una solicitud sin asesor: la etapa se ve, la solicitud no se lista', () => {
    const f = ficha(datos({ contacto: { ...datos().contacto, created_by: 'asesor-1' }, procesos: [proceso({ id: 'd-1' })] }), ASESOR)
    expect(f.procesoActivo?.etiquetaEtapa).toBe('Solicitud')
    expect(f.detalles.etapa?.etiqueta).toBe('Solicitud')
    expect(f.procesos).toEqual([])
  })

  it.each([
    ['de otro asesor', 'asesor-2'],
    ['sin asesor', null],
  ])('sin proceso abierto y el más reciente, cerrado, es %s → todo en null, también la etapa', (_n, dueño) => {
    const f = ficha(
      datos({ contacto: { ...datos().contacto, created_by: 'asesor-1' }, procesos: [proceso({ id: 'd-x', stage: 'lost', assigned_to: dueño })] }),
      ASESOR,
    )
    expect(f.procesoActivo).toBeNull()
    expect(f.detalles).toMatchObject({ etapa: null, origen: 'referido', direccion: null, campana: null })
    expect(f.detalles.asesor.mostrar).toBe(false)
    expect(JSON.stringify(f)).not.toContain('Av. Siempreviva')
  })

  it('sin proceso abierto y el más reciente, cerrado, es suyo → "Descartado" y sus datos', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-x', stage: 'lost', assigned_to: 'asesor-1' })] }), ASESOR)
    expect(f.procesoActivo).toBeNull()
    expect(f.detalles).toMatchObject({ etapa: { clave: 'descartado', etiqueta: 'Descartado' }, direccion: 'Av. Siempreviva 742', origen: 'embudo' })
  })
})

describe('armarFicha — tasaciones agendadas', () => {
  it('procesos en scheduled CON día, con fecha, hora, dirección y asesor; sin día no', () => {
    const f = ficha(datos({
      procesos: [
        proceso({ id: 'd-coord', stage: 'scheduled', scheduled_date: '2026-11-28', scheduled_time: '10:30:00', assigned_to: 'asesor-2' }),
        proceso({ id: 'd-sin-dia', stage: 'scheduled' }),
        proceso({ id: 'd-lost', stage: 'lost', scheduled_date: '2026-11-27' }),
      ],
    }))
    expect(f.tasacionesAgendadas).toEqual([
      { dealId: 'd-coord', fecha: '2026-11-28', hora: '10:30:00', direccion: 'Av. Siempreviva 742', asesor: { id: 'asesor-2', nombre: 'Berta Asesora' } },
    ])
  })
})

describe('armarFicha — deshacer_hasta', () => {
  const descartado = (min: number, extra: Partial<ProcesoDeFicha> = {}) =>
    proceso({ id: 'd-x', stage: 'lost', stage_changed_at: haceMin(min), lost_at: haceMin(min), ...extra })
  const cambio = (min: number, to = 'lost') => new Map([['d-x', { from_stage: 'request', to_stage: to, changed_at: haceMin(min) }]])

  it('descartado hace 2 minutos por quien puede cerrarlo → la hora del descarte más 10 minutos', () => {
    const f = ficha(datos({ procesos: [descartado(2)] }), COORD, cambio(2))
    expect(f.procesos[0].deshacer_hasta).toBe(new Date(Date.parse(haceMin(2)) + 10 * 60_000).toISOString())
  })
  it('hace 11 minutos → null', () => {
    const f = ficha(datos({ procesos: [descartado(11)] }), COORD, cambio(11))
    expect(f.procesos[0].deshacer_hasta).toBeNull()
  })
  it('descartado y vuelto a mover (la última fila no es a lost) → null', () => {
    const f = ficha(datos({ procesos: [descartado(2)] }), COORD, cambio(1, 'request'))
    expect(f.procesos[0].deshacer_hasta).toBeNull()
  })
  it('proceso que no está en lost → null', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-x' })] }), COORD, cambio(2))
    expect(f.procesos[0].deshacer_hasta).toBeNull()
  })
  it('sin historial leído → null', () => {
    const f = ficha(datos({ procesos: [descartado(2)] }), COORD)
    expect(f.procesos[0].deshacer_hasta).toBeNull()
  })
  it('asesor sobre un proceso descartado suyo → con valor', () => {
    const f = ficha(datos({ procesos: [descartado(2, { assigned_to: 'asesor-1' })] }), ASESOR, cambio(2))
    expect(f.procesos[0].deshacer_hasta).not.toBeNull()
  })
})

describe('procesosParaLeerHistorial', () => {
  it('solo los procesos en lost cuyo stage_changed_at es de los últimos 10 minutos', () => {
    const ps = [
      proceso({ id: 'lost-reciente', stage: 'lost', stage_changed_at: haceMin(3) }),
      proceso({ id: 'lost-viejo', stage: 'lost', stage_changed_at: haceMin(30) }),
      proceso({ id: 'abierto-reciente', stage: 'request', stage_changed_at: haceMin(1) }),
    ]
    expect(procesosParaLeerHistorial(ps, AHORA)).toEqual(['lost-reciente'])
  })
})

describe('armarFicha — último contacto', () => {
  it('una llamada de ayer ligada a un proceso viejo y una solicitud nueva sin llamadas → "ayer", sin alerta', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-nueva' })], ultimoIntentoEn: '2026-11-24T15:00:00.000Z' }))
    expect(f.ultimoContacto).toEqual({ texto: 'Último contacto: ayer', dias: 1, alerta: false, en: '2026-11-24T15:00:00.000Z' })
  })
  it('la visita de tasación realizada de cualquier proceso cuenta (también uno ajeno)', () => {
    const f = ficha(
      datos({
        procesos: [proceso({ id: 'd-otro', stage: 'visited', assigned_to: 'asesor-2', visited_at: '2026-11-24T18:00:00.000Z' })],
        ultimoIntentoEn: '2026-11-20T15:00:00.000Z',
      }),
      ASESOR,
    )
    expect(f.ultimoContacto.texto).toBe('Último contacto: ayer')
  })
  // Desde crm-cartera-por-rol (Diferencia 16): la cabecera y la fila de la lista dicen lo
  // mismo de una solicitud anterior al registro de llamadas (INICIO_REGISTRO_CONTACTOS).
  const DESPUES_DEL_REGISTRO = new Date('2026-11-27T15:00:00.000Z')
  const fichaDespues = (d: DatosFicha) =>
    armarFicha({ datos: d, cambiosAPerdido: new Map(), nombres: NOMBRES, usuario: COORD, ahora: DESPUES_DEL_REGISTRO })

  it('solicitud nueva (desde el registro) sin ningún contacto → "Sin contacto todavía" con alerta', () => {
    const f = fichaDespues(datos({ procesos: [proceso({ id: 'd-1', created_at: '2026-11-26T15:00:00.000Z' })] }))
    expect(f.ultimoContacto).toMatchObject({ texto: 'Sin contacto todavía', alerta: true, en: null })
  })
  it('solicitud anterior al registro sin ningún contacto → "Sin contacto registrado", sin alerta', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-1' })] }))
    expect(f.ultimoContacto).toEqual({ texto: 'Sin contacto registrado', dias: null, alerta: false, en: null })
  })
  it('las 23:30 de Argentina del día anterior al registro (ya el día de inicio en UTC) → anterior', () => {
    const f = fichaDespues(datos({ procesos: [proceso({ id: 'd-1', created_at: '2026-11-26T02:30:00.000Z' })] }))
    expect(f.ultimoContacto.texto).toBe('Sin contacto registrado')
  })
  it('una solicitud anterior al registro CON un contacto anotado dice el contacto', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-1' })], ultimoIntentoEn: '2026-11-24T15:00:00.000Z' }))
    expect(f.ultimoContacto.texto).toBe('Último contacto: ayer')
  })
  it('sin proceso abierto (todos cerrados) sigue "Sin contacto todavía", sin alerta', () => {
    const f = ficha(datos({ procesos: [proceso({ id: 'd-1', stage: 'lost' })] }))
    expect(f.ultimoContacto).toMatchObject({ texto: 'Sin contacto todavía', alerta: false })
  })
})

describe('perfilesANombrar', () => {
  it('pide el asesor del contacto, de cada proceso y de las tasaciones agendadas, sin repetir', () => {
    const ids = perfilesANombrar(datos({
      contacto: { ...datos().contacto, assigned_to: 'asesor-1' },
      procesos: [proceso({ id: 'a', assigned_to: 'asesor-2' }), proceso({ id: 'b', assigned_to: 'asesor-2' }), proceso({ id: 'c' })],
    }))
    expect(ids.sort()).toEqual(['asesor-1', 'asesor-2'])
  })
})
