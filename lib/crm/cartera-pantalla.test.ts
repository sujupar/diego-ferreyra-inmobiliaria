// crm-cartera-por-rol, tarea 6.1: qué escribe cada dato de la fila (spec crm-cartera,
// "La fila de un proceso", "Último contacto", "Próximo paso", "Columna Asesor", "Tasación
// cercana en la fila") y qué piezas tiene cada vista. Los componentes solo dibujan esto.
import { describe, it, expect } from 'vitest'
import {
  datoAsesor,
  datoProximo,
  datoUltimoContacto,
  etapasDeVista,
  etiquetaRango,
  fichasActivas,
  cuantosFiltros,
  hayFiltros,
  hrefDeFila,
  lineaTasacion,
  miles,
  momentoDelCalculo,
  subtituloDeFila,
  textoPie,
  textoBotonTrabado,
  detalleSinAsesor,
} from './cartera-pantalla'
import type { FilaComun, FiltrosCartera, ProximoPaso } from './cartera'
import type { EtapaCRM } from './etapas'

// 2026-12-02 (miércoles) 13:40 UTC = 10:40 AR.
const AHORA = new Date('2026-12-02T13:40:00Z')
const ar = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString()

const DEFECTO: FiltrosCartera = {
  seg: 'abiertos', etapa: '', origen: '', asesor: '', entro: '', desde: '', hasta: '', q: '',
  trabado: '', orden: 'proximo', colegas: '', ver: '',
}
const filtros = (f: Partial<FiltrosCartera>): FiltrosCartera => ({ ...DEFECTO, ...f })

function fila(p: Partial<FilaComun> = {}): FilaComun {
  const etapa: EtapaCRM | null = p.etapa === undefined ? 'solicitud' : p.etapa
  return {
    id: 'd-1',
    contactoId: 'c-1',
    nombre: 'Sofía Lanús',
    telefono: '11 5555-0148',
    email: null,
    propiedad: 'PH 4 amb · Colegiales',
    direccion: 'Conesa 1250',
    etapa,
    abierto: etapa !== null && !['captada', 'descartado'].includes(etapa),
    origen: 'embudo',
    asesor: null,
    creadoEn: ar('2026-12-01', '10:00'),
    cerradoEn: null,
    colega: false,
    anteriorAlRegistro: false,
    ultimoContacto: null,
    proximo: null,
    tasacion: null,
    ...p,
  }
}
const paso = (p: Partial<ProximoPaso> & { fecha?: string | null; hora?: string | null; todoElDia?: boolean }): ProximoPaso => ({
  clase: p.clase ?? 'tarea',
  titulo: p.titulo ?? 'Llamada 2',
  vence: { due_date: p.fecha ?? null, due_time: p.hora ?? null, all_day: p.todoElDia ?? false },
  quien: p.quien ?? null,
  espera: p.espera ?? null,
  instante: p.fecha ? ar(p.fecha, p.hora ?? '23:59') : null,
})

describe('datoUltimoContacto', () => {
  it('una llamada sin atender de hace una hora', () => {
    const d = datoUltimoContacto(fila({ ultimoContacto: { at: ar('2026-12-02', '09:40'), que: 'llamada', resultado: 'no_atendio' } }), AHORA)
    expect(d).toMatchObject({ tipo: 'dato', principal: 'hace 1 h', sub: 'Llamada · no atendió', alerta: false })
    expect(d.tipo === 'dato' && d.exacta).toBe('mié 2 dic 2026, 9:40')
  })
  it('desde los 7 días siempre "hace N días"', () => {
    const d = datoUltimoContacto(fila({ etapa: 'realizada', ultimoContacto: { at: ar('2026-11-26', '12:00'), que: 'visita', resultado: null } }), AHORA)
    expect(d).toMatchObject({ tipo: 'dato', principal: 'hace 6 días', sub: 'Visita de tasación' })
    const d2 = datoUltimoContacto(fila({ etapa: 'realizada', ultimoContacto: { at: ar('2026-11-10', '12:00'), que: 'whatsapp', resultado: null } }), AHORA)
    expect(d2).toMatchObject({ principal: 'hace 22 días', sub: 'WhatsApp enviado · antes del registro de llamadas' })
  })
  it('seguimiento sin movimiento: en rojo con "Sin movimiento" delante de qué fue', () => {
    const lejos = new Date('2026-12-20T13:40:00Z')
    const d = datoUltimoContacto(
      fila({ etapa: 'seguimiento', ultimoContacto: { at: ar('2026-11-28', '12:00'), que: 'llamada', resultado: 'volver_a_llamar' } }),
      lejos,
    )
    expect(d).toMatchObject({ tipo: 'dato', principal: 'hace 22 días', alerta: true, sub: 'Sin movimiento · Llamada · volver a llamar' })
  })
  it('contacto anterior al registro, sin alerta mientras no pasan 14 días desde el registro', () => {
    const d = datoUltimoContacto(
      fila({ etapa: 'seguimiento', ultimoContacto: { at: ar('2026-07-05', '12:00'), que: 'visita', resultado: null } }),
      AHORA,
    )
    expect(d).toMatchObject({ principal: 'hace 150 días', alerta: false, sub: 'Visita de tasación · antes del registro de llamadas' })
  })
  it('sin ningún contacto: "Sin contacto todavía", "Sin contacto registrado" o "—"', () => {
    expect(datoUltimoContacto(fila(), AHORA)).toEqual({ tipo: 'nada', texto: 'Sin contacto todavía', alerta: false, sub: null })
    expect(datoUltimoContacto(fila({ anteriorAlRegistro: true }), AHORA)).toMatchObject({ tipo: 'nada', texto: 'Sin contacto registrado' })
    expect(datoUltimoContacto(fila({ etapa: 'descartado' }), AHORA)).toMatchObject({ tipo: 'nada', texto: '—' })
    expect(datoUltimoContacto(fila({ etapa: null }), AHORA)).toMatchObject({ tipo: 'nada', texto: '—' })
  })
  it('el dato que no se pudo leer es un error, nunca un vacío', () => {
    expect(datoUltimoContacto(fila({ ultimoContacto: 'error' }), AHORA)).toEqual({ tipo: 'error' })
  })
})

describe('datoProximo', () => {
  it('Llamada 2 mañana 9:00', () => {
    expect(datoProximo(fila({ proximo: paso({ fecha: '2026-12-03', hora: '09:00' }) }), AHORA)).toEqual({
      tipo: 'paso', titulo: 'Llamada 2', cuando: 'Mañana 9:00', estado: 'proxima', icono: 'calendario', quien: null,
    })
  })
  it('vencida con ícono de alerta y el nombre de quien la tiene', () => {
    const d = datoProximo(fila({ proximo: paso({ fecha: '2026-12-02', hora: '09:40', quien: { id: 'p', nombre: 'Paula' } }) }), AHORA)
    expect(d).toMatchObject({ cuando: 'Vencida hace 1 h', estado: 'vencida', icono: 'alerta', quien: 'Paula' })
  })
  it('de hoy con reloj; la tasación de hoy con calendario', () => {
    expect(datoProximo(fila({ proximo: paso({ fecha: '2026-12-02', hora: '17:00' }) }), AHORA)).toMatchObject({ cuando: 'Hoy 17:00', estado: 'hoy', icono: 'reloj' })
    expect(
      datoProximo(fila({ proximo: paso({ clase: 'tasacion', titulo: 'Tasación', fecha: '2026-12-02', hora: '12:30' }) }), AHORA),
    ).toMatchObject({ titulo: 'Tasación', cuando: 'Hoy 12:30', icono: 'calendario' })
  })
  it('todo el día, sin fecha y la espera de la primera llamada', () => {
    expect(datoProximo(fila({ proximo: paso({ fecha: '2026-12-02', todoElDia: true }) }), AHORA)).toMatchObject({ cuando: 'Hoy, todo el día' })
    expect(datoProximo(fila({ proximo: paso({ fecha: null }) }), AHORA)).toMatchObject({ cuando: 'Sin fecha', icono: 'ninguno' })
    expect(
      datoProximo(
        fila({ proximo: paso({ titulo: 'Primera llamada', fecha: '2026-12-02', hora: '10:12', espera: { registradoEn: ar('2026-12-02', '10:12') } }) }),
        AHORA,
      ),
    ).toMatchObject({ titulo: 'Primera llamada', cuando: 'Espera hace 28 min', estado: 'vencida', icono: 'reloj' })
  })
  it('sin nada: "Nada agendado"; error: error; cerrado: el cierre', () => {
    expect(datoProximo(fila(), AHORA)).toEqual({ tipo: 'nada', texto: 'Nada agendado' })
    expect(datoProximo(fila({ proximo: 'error' }), AHORA)).toEqual({ tipo: 'error' })
    expect(datoProximo(fila({ etapa: 'descartado', cerradoEn: ar('2026-11-27', '10:00') }), AHORA)).toEqual({ tipo: 'cierre', texto: 'Descartado hace 5 días' })
    expect(datoProximo(fila({ etapa: 'captada', cerradoEn: null }), AHORA)).toEqual({ tipo: 'cierre', texto: 'Captada' })
  })
  it('un cerrado con una tarea pendiente muestra el cierre, no la tarea', () => {
    expect(
      datoProximo(fila({ etapa: 'descartado', cerradoEn: ar('2026-11-27', '10:00'), proximo: paso({ fecha: '2026-12-03' }) }), AHORA),
    ).toMatchObject({ tipo: 'cierre' })
  })
  it('una persona sin proceso: su tarea, o "—"', () => {
    expect(datoProximo(fila({ etapa: null }), AHORA)).toEqual({ tipo: 'nada', texto: '—' })
    expect(datoProximo(fila({ etapa: null, proximo: paso({ fecha: '2026-12-03', hora: '09:00' }) }), AHORA)).toMatchObject({ tipo: 'paso' })
  })
})

describe('datoAsesor', () => {
  it('nombre, "(dado de baja)", "Sin asesor" y "—"', () => {
    expect(datoAsesor(fila({ etapa: 'seguimiento', asesor: { id: 'a', nombre: 'Tomás Agüero', activo: true } }))).toEqual({ tipo: 'nombre', texto: 'Tomás Agüero', baja: false })
    expect(datoAsesor(fila({ etapa: 'seguimiento', asesor: { id: 'a', nombre: 'Tomás Agüero', activo: false } }))).toEqual({ tipo: 'nombre', texto: 'Tomás Agüero (dado de baja)', baja: true })
    expect(datoAsesor(fila({ etapa: 'seguimiento' }))).toEqual({ tipo: 'sin' })
    expect(datoAsesor(fila({ etapa: 'solicitud' }))).toEqual({ tipo: 'vacio' })
    expect(datoAsesor(fila({ etapa: null }))).toEqual({ tipo: 'vacio' })
  })
})

describe('lineaTasacion', () => {
  const tas = (fecha: string, hora: string | null, extra: Partial<NonNullable<FilaComun['tasacion']>> = {}) => ({
    fecha, hora, instante: ar(fecha, hora ?? '23:59'), asesor: 'Tomás Agüero', direccion: 'Conesa 1250', ...extra,
  })
  it('mañana 11:00, sin "con" donde hay columna Asesor', () => {
    const f = fila({ etapa: 'coordinada', tasacion: tas('2026-12-03', '11:00'), proximo: paso({ titulo: 'Confirmar el horario', fecha: '2026-12-02', hora: '15:00' }) })
    expect(lineaTasacion(f, { conAsesor: true }, AHORA)).toBe('Tasación mañana 11:00')
    expect(lineaTasacion(f, { conAsesor: false }, AHORA)).toBe('Tasación mañana 11:00 con Tomás Agüero')
  })
  it('la dirección solo si es distinta; sin hora, todo el día', () => {
    const f = fila({ etapa: 'coordinada', tasacion: tas('2026-12-02', null, { direccion: 'Thames 640' }) })
    expect(lineaTasacion(f, { conAsesor: true }, AHORA)).toBe('Tasación hoy, todo el día · Thames 640')
  })
  it('no se muestra si es el próximo paso, si ya pasó o si es pasado mañana', () => {
    const t = tas('2026-12-03', '11:00')
    const comoPaso = fila({ etapa: 'coordinada', tasacion: t, proximo: paso({ clase: 'tasacion', titulo: 'Tasación', fecha: '2026-12-03', hora: '11:00' }) })
    expect(lineaTasacion(comoPaso, { conAsesor: true }, AHORA)).toBeNull()
    expect(lineaTasacion(fila({ etapa: 'coordinada', tasacion: tas('2026-12-02', '08:00') }), { conAsesor: true }, AHORA)).toBeNull()
    expect(lineaTasacion(fila({ etapa: 'coordinada', tasacion: tas('2026-12-04', '11:00') }), { conAsesor: true }, AHORA)).toBeNull()
    expect(lineaTasacion(fila(), { conAsesor: true }, AHORA)).toBeNull()
  })
})

describe('renglón y enlace de la fila', () => {
  it('propiedad y dirección; sin tipo, barrio y dirección', () => {
    expect(subtituloDeFila(fila(), 'cartera')).toBe('PH 4 amb · Colegiales · Conesa 1250')
    expect(subtituloDeFila(fila({ propiedad: 'Villa Crespo', direccion: 'Thames 640' }), 'cartera')).toBe('Villa Crespo · Thames 640')
    expect(subtituloDeFila(fila(), 'contactos')).toBe('11 5555-0148 · PH 4 amb · Colegiales')
    expect(subtituloDeFila(fila({ telefono: null, propiedad: '' }), 'contactos')).toBe('Conesa 1250')
  })
  it('la ficha con la vuelta codificada; sin contacto, el proceso', () => {
    expect(hrefDeFila(fila(), '/crm?etapa=seguimiento&q=pinto')).toBe('/contacts/c-1?volver=%2Fcrm%3Fetapa%3Dseguimiento%26q%3Dpinto')
    expect(hrefDeFila(fila({ contactoId: null }), '/crm')).toBe('/pipeline/d-1')
  })
})

describe('etapasDeVista', () => {
  const cero = { solicitud: 0, coordinada: 0, no_realizada: 0, realizada: 0, entregada: 0, seguimiento: 0, clase_gratuita: 0, comprador: 0, captada: 0, descartado: 0 }
  it('coordinación: tres etapas abiertas y solo Descartado en cerrados, nunca Clase gratuita', () => {
    expect(etapasDeVista('coordinacion', 'abiertos', cero)).toEqual([{ base: 'Por etapa', etapas: ['solicitud', 'coordinada', 'no_realizada'] }])
    expect(etapasDeVista('coordinacion', 'cerrados', cero)).toEqual([{ base: 'Por etapa', etapas: ['descartado'] }])
  })
  it('asesor: con Comprador, y Solicitud o Clase gratuita solo si tiene alguna', () => {
    expect(etapasDeVista('asesor', 'abiertos', cero)[0].etapas).toEqual(['coordinada', 'no_realizada', 'realizada', 'entregada', 'seguimiento', 'comprador'])
    expect(etapasDeVista('asesor', 'abiertos', { ...cero, solicitud: 1, clase_gratuita: 2 })[0].etapas).toEqual([
      'solicitud', 'coordinada', 'no_realizada', 'realizada', 'entregada', 'seguimiento', 'clase_gratuita', 'comprador',
    ])
    expect(etapasDeVista('asesor', 'cerrados', cero)).toEqual([{ base: 'Por etapa', etapas: ['captada', 'descartado'] }])
  })
  it('dueño: embudo y fuera del embudo', () => {
    expect(etapasDeVista('dueno', 'abiertos', cero)).toEqual([
      { base: 'Embudo de tasación', etapas: ['solicitud', 'coordinada', 'no_realizada', 'realizada', 'entregada', 'seguimiento'] },
      { base: 'Fuera del embudo', etapas: ['clase_gratuita', 'comprador'] },
    ])
  })
})

describe('filtros puestos', () => {
  const asesores = [{ id: 'a1', nombre: 'Lucas', activo: true }]
  it('fichas con su texto, en el orden de la maqueta', () => {
    expect(
      fichasActivas(filtros({ q: 'pinto', etapa: 'seguimiento', origen: 'referido', trabado: 'sin-movimiento', asesor: 'a1', entro: '7' }), { asesores, lista: 'crm' }),
    ).toEqual([
      { clave: 'q', texto: 'Busca: «pinto»' },
      { clave: 'trabado', texto: 'Seguimiento sin movimiento' },
      { clave: 'etapa', texto: 'Etapa: Seguimiento' },
      { clave: 'origen', texto: 'Origen: Referido' },
      { clave: 'asesor', texto: 'Asesor: Lucas' },
      { clave: 'entro', texto: 'Entró: últimos 7 días' },
    ])
  })
  it('rango y "Se registró" en Contactos; sin asesor', () => {
    expect(fichasActivas(filtros({ entro: 'rango', desde: '2026-11-01', hasta: '2026-11-25', asesor: 'sin' }), { asesores, lista: 'contactos' })).toEqual([
      { clave: 'asesor', texto: 'Asesor: sin asesor' },
      { clave: 'entro', texto: 'Se registró: Del 01/11 al 25/11' },
    ])
    expect(etiquetaRango('2026-11-01', '')).toBe('Del 01/11 al …')
  })
  it('el botón "Filtros" no cuenta la búsqueda', () => {
    expect(cuantosFiltros(filtros({ q: 'x', origen: 'referido', etapa: 'solicitud' }))).toBe(2)
    expect(hayFiltros(filtros({ q: 'x' }))).toBe(true)
    expect(hayFiltros(filtros({ orden: 'nombre', seg: 'cerrados', colegas: '1' }))).toBe(false)
  })
})

describe('textos sueltos', () => {
  it('pie, miles y momento del cálculo', () => {
    expect(textoPie(50, 493, 'abiertos', false)).toBe('Mostrando 50 de 493 procesos abiertos')
    expect(textoPie(25, 3000, 'cerrados', false)).toBe('Mostrando 25 de 3.000 procesos cerrados')
    expect(textoPie(3, 3, 'personas', false)).toBe('Mostrando 3 de 3 personas')
    expect(textoPie(25, 3000, 'abiertos', true)).toBe('Mostrando 25 de los 3.000 procesos abiertos que se pudieron traer')
    expect(miles(1234567)).toBe('1.234.567')
    expect(momentoDelCalculo(new Date('2026-11-25T13:40:00Z'))).toBe('al mié 25 nov, 10:40')
  })
  it('botón de lo trabado', () => {
    expect(textoBotonTrabado(61, false)).toBe('Ver los 61 en la lista')
    expect(textoBotonTrabado(1, false)).toBe('Ver el proceso en la lista')
    expect(textoBotonTrabado(61, true)).toBe('Quitar este filtro')
  })
  it('detalle de "sin asesor": etapa y origen', () => {
    expect(detalleSinAsesor(fila({ etapa: 'realizada', origen: 'historico' }))).toBe('Realizada · Histórico')
    expect(detalleSinAsesor(fila({ etapa: 'realizada', origen: null }))).toBe('Realizada')
  })
})
