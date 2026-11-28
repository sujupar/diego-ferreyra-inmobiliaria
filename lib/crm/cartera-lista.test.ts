// crm-cartera-por-rol, tarea 3.6: agrupar, filtrar, contar y ordenar las filas en memoria
// (design.md D5). Se arman filas a mano: lo que se prueba acá es la lista, no la fila.
import { describe, it, expect } from 'vitest'
import {
  agrupar,
  contarPorEtapa,
  filtrarFilas,
  ordenarFilas,
  textoBusqueda,
  type FilaCartera,
  type FiltrosCartera,
  type ProximoPaso,
} from './cartera'
import type { Vista } from './cartera-vista'
import type { EtapaCRM } from './etapas'

// 2026-12-02 (miércoles) 13:40 UTC = 10:40 AR.
const AHORA = new Date('2026-12-02T13:40:00Z')
const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString()
const COORD: Vista = { tipo: 'coordinacion', personaId: 'coord-1' }
const ASESOR: Vista = { tipo: 'asesor', personaId: 'asesor-1' }
const DUENO: Vista = { tipo: 'dueno' }

const DEFECTO: FiltrosCartera = {
  seg: 'abiertos', etapa: '', origen: '', asesor: '', entro: '', desde: '', hasta: '', q: '',
  trabado: '', orden: 'proximo', colegas: '', ver: '',
}
const filtros = (f: Partial<FiltrosCartera>): FiltrosCartera => ({ ...DEFECTO, ...f })

let n = 0
function fila(p: Partial<FilaCartera> = {}): FilaCartera {
  n += 1
  const etapa: EtapaCRM = p.etapa ?? 'solicitud'
  return {
    id: p.id ?? `d-${n}`,
    contactoId: `c-${n}`,
    nombre: `Persona ${n}`,
    telefono: null,
    email: null,
    propiedad: '',
    direccion: '',
    etapa,
    abierto: !['captada', 'descartado'].includes(etapa),
    origen: 'embudo',
    asesor: null,
    creadoEn: ar('2026-12-01', '10:00'),
    cerradoEn: null,
    colega: false,
    anteriorAlRegistro: false,
    ultimoContacto: { at: ar('2026-12-01', '12:00'), que: 'llamada', resultado: 'no_atendio' },
    proximo: null,
    tasacion: null,
    ...p,
  }
}
const tareaEn = (fecha: string | null, hora: string | null, extra: Partial<ProximoPaso> = {}): ProximoPaso => ({
  clase: 'tarea',
  titulo: 'Llamada 2',
  vence: { due_date: fecha, due_time: hora, all_day: false },
  quien: null,
  espera: null,
  instante: fecha ? ar(fecha, hora ?? '23:59') : null,
  ...extra,
})
const tasacionEn = (fecha: string, hora: string | null) => ({
  fecha,
  hora,
  instante: ar(fecha, hora ?? '23:59'),
  asesor: 'Tomás Agüero',
  direccion: 'Bacacay 2450',
})
const claves = (g: ReturnType<typeof agrupar>) => g.map((x) => [x.clave, x.filas.map((f) => f.id)])

describe('agrupar — coordinación', () => {
  it('los cuatro grupos en orden, cada proceso en uno solo, y vacíos afuera', () => {
    const sinContacto = fila({ id: 'sc', ultimoContacto: null, proximo: tareaEn('2026-12-02', '10:00', { titulo: 'Primera llamada' }) })
    const vencida = fila({ id: 'v', proximo: tareaEn('2026-12-01', '09:00') })
    const tasMan = fila({ id: 't', etapa: 'coordinada', tasacion: tasacionEn('2026-12-03', '11:00'), proximo: tareaEn('2026-12-02', '17:00', { titulo: 'Confirmar el horario' }) })
    const resto = fila({ id: 'r', proximo: tareaEn('2026-12-05', '09:00') })
    expect(claves(agrupar([resto, tasMan, vencida, sinContacto], COORD, AHORA))).toEqual([
      ['sin-contacto', ['sc']],
      ['vencidas', ['v']],
      ['tasaciones', ['t']],
      ['resto', ['r']],
    ])
  })
  it('"Sin primer contacto": primero la que más espera', () => {
    const ayer = fila({ id: 'ayer', ultimoContacto: null, creadoEn: ar('2026-12-01', '15:00') })
    const recien = fila({ id: 'recien', ultimoContacto: null, creadoEn: ar('2026-12-02', '09:40') })
    expect(agrupar([recien, ayer], COORD, AHORA)[0]).toMatchObject({ clave: 'sin-contacto', urgente: true })
    expect(agrupar([recien, ayer], COORD, AHORA)[0].filas.map((f) => f.id)).toEqual(['ayer', 'recien'])
  })
  it('una tasación de hoy y una de pasado mañana: solo la de hoy en "Tasaciones de hoy y mañana"', () => {
    const hoy = fila({ id: 'hoy', etapa: 'coordinada', tasacion: tasacionEn('2026-12-02', '15:30') })
    const pasado = fila({ id: 'pasado', etapa: 'coordinada', tasacion: tasacionEn('2026-12-04', '11:00') })
    expect(claves(agrupar([pasado, hoy], COORD, AHORA))).toEqual([
      ['tasaciones', ['hoy']],
      ['resto', ['pasado']],
    ])
  })
  it('una tasación de hoy que ya pasó no está en "Tasaciones de hoy y mañana"', () => {
    const pasada = fila({ id: 'p', etapa: 'coordinada', tasacion: tasacionEn('2026-12-02', '09:00') })
    expect(claves(agrupar([pasada], COORD, AHORA))).toEqual([['resto', ['p']]])
  })
  it('la tasación pasada a nombre del asesor no cuenta en "Llamada o mensaje vencido"', () => {
    const f = fila({
      id: 'x', etapa: 'coordinada', tasacion: tasacionEn('2026-11-29', '11:00'),
      proximo: { clase: 'tasacion', titulo: 'Cargar el resultado de la tasación', vence: { due_date: '2026-11-29', due_time: '11:00', all_day: false }, quien: { id: 'asesor-1', nombre: 'Tomás Agüero' }, espera: null, instante: ar('2026-11-29', '11:00') },
    })
    expect(claves(agrupar([f], COORD, AHORA))).toEqual([['resto', ['x']]])
  })
  it('con el último contacto en error no hay "Sin primer contacto": va al grupo siguiente', () => {
    const f = fila({ id: 'x', ultimoContacto: 'error', proximo: tareaEn('2026-12-01', '09:00') })
    expect(claves(agrupar([f], COORD, AHORA))).toEqual([['vencidas', ['x']]])
  })
  it('con las tareas en error no hay "vencidas"; las tasaciones sí', () => {
    const v = fila({ id: 'v', proximo: 'error' })
    const t = fila({ id: 't', etapa: 'coordinada', proximo: 'error', tasacion: tasacionEn('2026-12-03', '10:00') })
    expect(claves(agrupar([v, t], COORD, AHORA))).toEqual([
      ['tasaciones', ['t']],
      ['resto', ['v']],
    ])
  })
  it('los cerrados van en un solo grupo, del cierre más reciente al más viejo', () => {
    const viejo = fila({ id: 'viejo', etapa: 'descartado', cerradoEn: '2026-10-01T12:00:00Z' })
    const nuevo = fila({ id: 'nuevo', etapa: 'descartado', cerradoEn: '2026-11-30T12:00:00Z' })
    const sinFecha = fila({ id: 'sin', etapa: 'descartado', cerradoEn: null })
    expect(claves(agrupar([viejo, sinFecha, nuevo], COORD, AHORA))).toEqual([['cerrados', ['nuevo', 'viejo', 'sin']]])
  })
  it('sin filas no hay grupos', () => {
    expect(agrupar([], COORD, AHORA)).toEqual([])
  })
})

describe('agrupar — asesor', () => {
  it('los cuatro grupos en orden, cada proceso en uno solo', () => {
    const hoy = fila({ id: 'hoy', etapa: 'coordinada', tasacion: tasacionEn('2026-12-02', '15:30'), proximo: tareaEn('2026-12-02', '15:30', { clase: 'tasacion', titulo: 'Tasación' }) })
    const vencida = fila({ id: 'venc', etapa: 'seguimiento', proximo: tareaEn('2026-12-01', '18:00', { titulo: 'Entregar la tasación' }) })
    const prox = fila({ id: 'prox', etapa: 'seguimiento', proximo: tareaEn('2026-12-04', '09:00') })
    const nada = fila({ id: 'nada', etapa: 'seguimiento', proximo: null })
    const g = agrupar([nada, prox, vencida, hoy], ASESOR, AHORA)
    expect(claves(g)).toEqual([
      ['hoy', ['hoy']],
      ['vencidas', ['venc']],
      ['proximos', ['prox']],
      ['nada', ['nada']],
    ])
    expect(g.map((x) => x.urgente)).toEqual([false, true, false, false])
  })
  it('tasaciones de hoy por hora: 12:30 antes que 15:30, y sin hora al final', () => {
    const t1530 = fila({ id: '1530', etapa: 'coordinada', tasacion: tasacionEn('2026-12-02', '15:30') })
    const sinHora = fila({ id: 'sinhora', etapa: 'coordinada', tasacion: tasacionEn('2026-12-02', null) })
    const t1230 = fila({ id: '1230', etapa: 'coordinada', tasacion: tasacionEn('2026-12-02', '12:30') })
    expect(agrupar([t1530, sinHora, t1230], ASESOR, AHORA)[0].filas.map((f) => f.id)).toEqual(['1230', '1530', 'sinhora'])
  })
  it('la tasación de mañana no va en "Tasaciones de hoy"', () => {
    const f = fila({ id: 'm', etapa: 'coordinada', tasacion: tasacionEn('2026-12-03', '11:00'), proximo: tareaEn('2026-12-03', '11:00', { clase: 'tasacion', titulo: 'Tasación' }) })
    expect(claves(agrupar([f], ASESOR, AHORA))).toEqual([['proximos', ['m']]])
  })
  it('la tasación pasada sin resultado cuenta como vencida para el asesor', () => {
    const f = fila({
      id: 'x', etapa: 'coordinada', tasacion: tasacionEn('2026-11-29', '11:00'),
      proximo: { clase: 'tasacion', titulo: 'Cargar el resultado de la tasación', vence: { due_date: '2026-11-29', due_time: '11:00', all_day: false }, quien: null, espera: null, instante: ar('2026-11-29', '11:00') },
    })
    expect(claves(agrupar([f], ASESOR, AHORA))).toEqual([['vencidas', ['x']]])
  })
  it('una tarea sin fecha está en "Con próximo paso", después de las que tienen fecha', () => {
    const sinFecha = fila({ id: 'sf', proximo: tareaEn(null, null) })
    const conFecha = fila({ id: 'cf', proximo: tareaEn('2026-12-10', '09:00') })
    expect(claves(agrupar([sinFecha, conFecha], ASESOR, AHORA))).toEqual([['proximos', ['cf', 'sf']]])
  })
  it('con las tareas en error no hay "vencidas", "Con próximo paso" ni "Sin nada pendiente": quedan en una lista neutra', () => {
    const f = fila({ id: 'x', proximo: 'error' })
    expect(claves(agrupar([f], ASESOR, AHORA))).toEqual([['todos', ['x']]])
  })
})

describe('agrupar — dueño', () => {
  it('un solo grupo "todos" ordenado por próximo paso', () => {
    const nada = fila({ id: 'nada' })
    const venc = fila({ id: 'venc', proximo: tareaEn('2026-12-01', '09:00') })
    expect(claves(agrupar([nada, venc], DUENO, AHORA))).toEqual([['todos', ['venc', 'nada']]])
  })
})

describe('ordenarFilas', () => {
  it('"Próximo paso": vencida, mañana, sin fecha, sin nada', () => {
    const nada = fila({ id: 'nada' })
    const sinFecha = fila({ id: 'sf', proximo: tareaEn(null, null) })
    const manana = fila({ id: 'man', proximo: tareaEn('2026-12-03', '09:00') })
    const venc = fila({ id: 'venc', proximo: tareaEn('2026-12-01', '09:00') })
    expect(ordenarFilas([nada, sinFecha, manana, venc], 'proximo').map((f) => f.id)).toEqual(['venc', 'man', 'sf', 'nada'])
  })
  it('mismo vencimiento: primero el que lleva más tiempo sin contacto', () => {
    const reciente = fila({ id: 'rec', proximo: tareaEn('2026-12-03', '09:00'), ultimoContacto: { at: ar('2026-12-01', '12:00'), que: 'llamada', resultado: null } })
    const viejo = fila({ id: 'vie', proximo: tareaEn('2026-12-03', '09:00'), ultimoContacto: { at: ar('2026-11-01', '12:00'), que: 'llamada', resultado: null } })
    expect(ordenarFilas([reciente, viejo], 'proximo').map((f) => f.id)).toEqual(['vie', 'rec'])
  })
  it('entre dos sin ningún contacto, primero el que entró antes', () => {
    const nuevo = fila({ id: 'nuevo', ultimoContacto: null, creadoEn: ar('2026-11-01', '10:00') })
    const viejo = fila({ id: 'viejo', ultimoContacto: null, creadoEn: ar('2025-09-01', '10:00') })
    expect(ordenarFilas([nuevo, viejo], 'proximo').map((f) => f.id)).toEqual(['viejo', 'nuevo'])
  })
  it('sin contacto antes que con contacto viejo (más tiempo sin contacto)', () => {
    const conViejo = fila({ id: 'con', ultimoContacto: { at: ar('2025-01-01', '12:00'), que: 'visita', resultado: null } })
    const sin = fila({ id: 'sin', ultimoContacto: null })
    expect(ordenarFilas([conViejo, sin], 'proximo').map((f) => f.id)).toEqual(['sin', 'con'])
  })
  it('"Más tiempo sin contacto": sin ningún contacto primero, después el más viejo', () => {
    const reciente = fila({ id: 'rec', ultimoContacto: { at: ar('2026-12-01', '12:00'), que: 'llamada', resultado: null } })
    const viejo = fila({ id: 'vie', ultimoContacto: { at: ar('2026-10-01', '12:00'), que: 'llamada', resultado: null } })
    const sin = fila({ id: 'sin', ultimoContacto: null })
    expect(ordenarFilas([reciente, viejo, sin], 'ultimo').map((f) => f.id)).toEqual(['sin', 'vie', 'rec'])
  })
  it('"Más nuevos primero"', () => {
    const a = fila({ id: 'a', creadoEn: ar('2026-11-01', '10:00') })
    const b = fila({ id: 'b', creadoEn: ar('2026-12-01', '10:00') })
    expect(ordenarFilas([a, b], 'nuevos').map((f) => f.id)).toEqual(['b', 'a'])
  })
  it('"Nombre (A a Z)": Ángela antes que Bruno', () => {
    const b = fila({ id: 'b', nombre: 'Bruno' })
    const a = fila({ id: 'a', nombre: 'Ángela' })
    const c = fila({ id: 'c', nombre: 'ángel' })
    expect(ordenarFilas([b, a, c], 'nombre').map((f) => f.nombre)).toEqual(['ángel', 'Ángela', 'Bruno'])
  })
  it('no muta la lista que recibe', () => {
    const lista = [fila({ id: 'b', nombre: 'B' }), fila({ id: 'a', nombre: 'A' })]
    ordenarFilas(lista, 'nombre')
    expect(lista.map((f) => f.id)).toEqual(['b', 'a'])
  })
})

describe('textoBusqueda', () => {
  it('sin tildes, en minúscula, con espacios juntados', () => {
    expect(textoBusqueda('  Ramiro   ECHEVERRÍA ')).toBe('ramiro echeverria')
  })
  it('una tilde en NFD (macOS) se va igual', () => {
    expect(textoBusqueda('Echeverría')).toBe('echeverria')
  })
})

describe('filtrarFilas', () => {
  const ramiro = fila({ id: 'ramiro', nombre: 'Ramiro Echeverría', telefono: '11 5555-0148', email: 'ramiro@ejemplo.com', direccion: 'Thames 640', propiedad: 'Villa Crespo' })
  const ana = fila({ id: 'ana', nombre: 'Ana Pinto', origen: 'referido', etapa: 'seguimiento', asesor: { id: 'asesor-1', nombre: 'Tomás', activo: true }, direccion: '2*D (contrafrente)' })
  const clase = fila({ id: 'clase', origen: 'clase_gratuita', etapa: 'clase_gratuita' })
  const sinOrigen = fila({ id: 'sinorigen', origen: null })
  const cerrado = fila({ id: 'cerrado', etapa: 'descartado' })
  const colega = fila({ id: 'colega', colega: true })
  const todas = [ramiro, ana, clase, sinOrigen, cerrado, colega]
  const ids = (f: Partial<FiltrosCartera>) => filtrarFilas(todas, filtros(f), AHORA).map((x) => x.id)

  it('por defecto: abiertos, sin colegas', () => {
    expect(ids({})).toEqual(['ramiro', 'ana', 'clase', 'sinorigen'])
  })
  it('cerrados', () => {
    expect(ids({ seg: 'cerrados' })).toEqual(['cerrado'])
  })
  it('colegas a la vista con colegas=1', () => {
    expect(ids({ colegas: '1' })).toContain('colega')
  })
  it('etapa', () => {
    expect(ids({ etapa: 'seguimiento' })).toEqual(['ana'])
  })
  it('origen: embudo incluye la clase gratuita', () => {
    expect(ids({ origen: 'embudo' })).toEqual(['ramiro', 'clase'])
  })
  it('origen: un proceso sin origen no aparece al elegir uno', () => {
    expect(ids({ origen: 'referido' })).toEqual(['ana'])
    expect(ids({ origen: 'historico' })).toEqual([])
  })
  it('asesor y "sin"', () => {
    expect(ids({ asesor: 'asesor-1' })).toEqual(['ana'])
    expect(ids({ asesor: 'sin' })).toEqual(['ramiro', 'clase', 'sinorigen'])
  })
  it('búsqueda sin tildes', () => {
    expect(ids({ q: 'echeverria' })).toEqual(['ramiro'])
  })
  it('búsqueda con la tilde en NFD', () => {
    expect(ids({ q: 'Echeverría' })).toEqual(['ramiro'])
  })
  it('búsqueda por teléfono sin espacios ni guiones', () => {
    expect(ids({ q: '55550148' })).toEqual(['ramiro'])
  })
  it('búsqueda por teléfono como está escrito', () => {
    expect(ids({ q: '5555-0148' })).toEqual(['ramiro'])
  })
  it('varias palabras: tienen que estar todas', () => {
    expect(ids({ q: 'thames crespo' })).toEqual(['ramiro'])
    expect(ids({ q: 'thames pinto' })).toEqual([])
  })
  it('por email', () => {
    expect(ids({ q: 'ejemplo.com' })).toEqual(['ramiro'])
  })
  it('caracteres de regex: "2*D" y "(" se buscan como texto', () => {
    expect(ids({ q: '2*D' })).toEqual(['ana'])
    expect(ids({ q: '(' })).toEqual(['ana'])
  })
  it('combinados: origen + asesor + búsqueda', () => {
    expect(ids({ origen: 'referido', asesor: 'asesor-1', q: 'pinto' })).toEqual(['ana'])
    expect(ids({ origen: 'embudo', asesor: 'asesor-1' })).toEqual([])
  })
  it('búsqueda vacía o solo espacios no filtra', () => {
    expect(ids({ q: '   ' })).toEqual(ids({}))
  })

  describe('entró al CRM (días de Argentina)', () => {
    const hoy = fila({ id: 'hoy', creadoEn: ar('2026-12-02', '08:00') })
    const ayer = fila({ id: 'ayer', creadoEn: ar('2026-12-01', '23:30') }) // ya 2/12 en UTC
    const hace6 = fila({ id: 'hace6', creadoEn: ar('2026-11-26', '10:00') })
    const hace7 = fila({ id: 'hace7', creadoEn: ar('2026-11-25', '10:00') })
    const lista = [hoy, ayer, hace6, hace7]
    const ent = (f: Partial<FiltrosCartera>) => filtrarFilas(lista, filtros(f), AHORA).map((x) => x.id)
    it('hoy', () => expect(ent({ entro: 'hoy' })).toEqual(['hoy']))
    it('ayer (las 23:30 de Argentina, aunque en UTC ya sea hoy)', () => expect(ent({ entro: 'ayer' })).toEqual(['ayer']))
    it('últimos 7 días: hoy y los 6 anteriores', () => expect(ent({ entro: '7' })).toEqual(['hoy', 'ayer', 'hace6']))
    it('últimos 15, 30 y 90 días', () => {
      expect(ent({ entro: '15' })).toEqual(['hoy', 'ayer', 'hace6', 'hace7'])
      expect(ent({ entro: '30' })).toHaveLength(4)
      expect(ent({ entro: '90' })).toHaveLength(4)
    })
    it('rango con las dos puntas incluidas', () => expect(ent({ entro: 'rango', desde: '2026-11-26', hasta: '2026-12-01' })).toEqual(['ayer', 'hace6']))
    it('rango solo "desde"', () => expect(ent({ entro: 'rango', desde: '2026-12-01' })).toEqual(['hoy', 'ayer']))
    it('rango solo "hasta"', () => expect(ent({ entro: 'rango', hasta: '2026-11-25' })).toEqual(['hace7']))
  })

  describe('filtros de lo trabado', () => {
    const sc = fila({ id: 'sc', ultimoContacto: null })
    const sa = fila({ id: 'sa', etapa: 'seguimiento', asesor: null })
    const sm = fila({ id: 'sm', etapa: 'seguimiento', asesor: { id: 'a', nombre: 'A', activo: true }, ultimoContacto: { at: '2026-11-01T12:00:00Z', que: 'llamada', resultado: null } })
    const lista = [sc, sa, sm]
    const lejos = new Date('2026-12-20T15:00:00Z')
    const tr = (trabado: FiltrosCartera['trabado']) => filtrarFilas(lista, filtros({ trabado }), lejos).map((x) => x.id)
    it('sin primer contacto', () => expect(tr('sin-contacto')).toEqual(['sc']))
    it('sin asesor', () => expect(tr('sin-asesor')).toEqual(['sa']))
    it('sin movimiento', () => expect(tr('sin-movimiento')).toEqual(['sa', 'sm']))
  })
})

describe('contarPorEtapa', () => {
  const lista = [
    fila({ etapa: 'solicitud', origen: 'referido' }),
    fila({ etapa: 'solicitud', origen: 'embudo' }),
    fila({ etapa: 'seguimiento', origen: 'referido' }),
    fila({ etapa: 'descartado', origen: 'referido' }),
    fila({ etapa: 'descartado', origen: 'referido', colega: true }),
  ]
  it('cuenta las diez etapas, con cero donde no hay', () => {
    const c = contarPorEtapa(lista, filtros({}), AHORA)
    expect(Object.keys(c)).toHaveLength(10)
    expect(c).toMatchObject({ solicitud: 2, seguimiento: 1, descartado: 1, captada: 0, comprador: 0 })
  })
  it('respeta los filtros (origen Referido) y los colegas ocultos', () => {
    expect(contarPorEtapa(lista, filtros({ origen: 'referido' }), AHORA)).toMatchObject({ solicitud: 1, seguimiento: 1, descartado: 1 })
  })
  it('no respeta la etapa ni el segmento (cuenta abiertos y cerrados igual)', () => {
    const c = contarPorEtapa(lista, filtros({ etapa: 'seguimiento', seg: 'cerrados' }), AHORA)
    expect(c).toMatchObject({ solicitud: 2, seguimiento: 1, descartado: 1 })
  })
  it('con colegas a la vista, los cuenta', () => {
    expect(contarPorEtapa(lista, filtros({ colegas: '1' }), AHORA).descartado).toBe(2)
  })
})

describe('crm-lista-nuevos-primero', () => {
  it('trabados: abiertos con más de 30 días sin movimiento van a un grupo propio, al final (antes de los cerrados)', () => {
    // Coordinada con la tasación del 2 de junio y nada después (el caso Alejandra Migeli).
    const junio = fila({
      id: 'junio', etapa: 'coordinada', creadoEn: ar('2026-06-01', '10:00'), ultimoContacto: null, anteriorAlRegistro: true,
      tasacion: tasacionEn('2026-06-02', '11:00'),
      proximo: { clase: 'tasacion', titulo: 'Cargar el resultado de la tasación', vence: { due_date: '2026-06-02', due_time: '11:00', all_day: false }, quien: null, espera: null, instante: ar('2026-06-02', '11:00') },
    })
    // Entró hace 2 meses pero la llamaron ayer: se movió, no está trabado.
    const llamadoAyer = fila({ id: 'ayer', etapa: 'seguimiento', creadoEn: ar('2026-10-01', '10:00'), ultimoContacto: { at: ar('2026-12-01', '12:00'), que: 'llamada', resultado: 'no_atendio' } })
    // Justo 30 días: todavía no.
    const treinta = fila({ id: 'treinta', etapa: 'seguimiento', creadoEn: ar('2026-11-02', '11:00'), ultimoContacto: null, anteriorAlRegistro: true })
    const cerrado = fila({ id: 'cerrado', etapa: 'descartado', creadoEn: ar('2026-05-01', '10:00'), cerradoEn: '2026-11-30T12:00:00Z' })
    expect(claves(agrupar([junio, llamadoAyer, treinta, cerrado], DUENO, AHORA, 'nuevos'))).toEqual([
      ['todos', ['treinta', 'ayer']],
      ['trabados', ['junio']],
      ['cerrados', ['cerrado']],
    ])
  })
  it('una tasación agendada a futuro no está trabada aunque el proceso sea viejo', () => {
    const f = fila({ id: 'f', etapa: 'coordinada', creadoEn: ar('2026-06-01', '10:00'), ultimoContacto: null, anteriorAlRegistro: true, tasacion: tasacionEn('2026-12-10', '11:00') })
    expect(claves(agrupar([f], DUENO, AHORA, 'nuevos'))).toEqual([['todos', ['f']]])
  })
  it('con el último contacto en error no se afirma que esté trabado', () => {
    const f = fila({ id: 'e', etapa: 'seguimiento', creadoEn: ar('2026-06-01', '10:00'), ultimoContacto: 'error' })
    expect(claves(agrupar([f], DUENO, AHORA, 'nuevos'))).toEqual([['todos', ['e']]])
  })
  it('los trabados van del que se movió más recientemente al más viejo', () => {
    const a = fila({ id: 'a', etapa: 'seguimiento', creadoEn: ar('2026-03-01', '10:00'), ultimoContacto: null })
    const b = fila({ id: 'b', etapa: 'seguimiento', creadoEn: ar('2026-08-01', '10:00'), ultimoContacto: null })
    expect(claves(agrupar([a, b], DUENO, AHORA, 'nuevos'))).toEqual([['trabados', ['b', 'a']]])
  })
  it('el orden elegido manda en los grupos generales de cada vista (más nuevos primero)', () => {
    const viejo = fila({ id: 'viejo', creadoEn: ar('2026-11-20', '10:00'), proximo: tareaEn('2026-12-03', '09:00') })
    const nuevo = fila({ id: 'nuevo', creadoEn: ar('2026-12-01', '10:00'), proximo: tareaEn('2026-12-05', '09:00') })
    expect(claves(agrupar([viejo, nuevo], COORD, AHORA, 'nuevos'))).toEqual([['resto', ['nuevo', 'viejo']]])
    expect(claves(agrupar([viejo, nuevo], DUENO, AHORA, 'nuevos'))).toEqual([['todos', ['nuevo', 'viejo']]])
    expect(claves(agrupar([viejo, nuevo], ASESOR, AHORA, 'nuevos'))).toEqual([['proximos', ['nuevo', 'viejo']]])
    expect(claves(agrupar([viejo, nuevo], COORD, AHORA, 'proximo'))).toEqual([['resto', ['viejo', 'nuevo']]])
  })
})
