/**
 * Sonda de render de la cartera del CRM y de Contactos (crm-cartera-por-rol, tarea 6.7).
 * Correr: npx tsx scripts/cartera.probe.tsx [carpeta-de-salida]
 *
 * Dibuja con `renderToStaticMarkup` las vistas de coordinación, asesor, dueño (con "Lo que
 * está trabado"), "Ver como", cerrados, Contactos y el error de la lista, con datos fijos
 * (`components/crm/cartera/datos-prueba.ts`), y revisa: que estén TODOS los textos exactos
 * de la spec, que no haya ningún "Deals", ningún "Todas"/"Todos" suelto ni textos en inglés,
 * y nada con `opacity:0`. Con un argumento escribe cada HTML para mirarlo en un navegador.
 * No lee la base ni la red.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { VistaCartera, type PropsVistaCartera } from '@/components/crm/cartera/CarteraCRM'
import { VistaContactos } from '@/components/crm/cartera/ContactosLista'
import {
  ar,
  contactoPrueba,
  datosContactosPrueba,
  datosPrueba,
  filaPrueba,
  FLORENCIA,
  PAULA,
  pasoPrueba,
  TOMAS,
} from '@/components/crm/cartera/datos-prueba'
import { FILTROS_DEFECTO } from '@/lib/crm/cartera-url'
import type { FiltrosCartera } from '@/lib/crm/cartera'
import type { DatosCartera } from '@/lib/supabase/cartera'

const nada = () => {}
const OPCIONES = [
  { id: PAULA.id, etiqueta: `${PAULA.nombre} · coordinación` },
  { id: FLORENCIA.id, etiqueta: `${FLORENCIA.nombre} · asesor` },
  { id: TOMAS.id, etiqueta: `${TOMAS.nombre} · asesor` },
]

function vista(datos: DatosCartera | null, rol: string, filtros: Partial<FiltrosCartera> = {}, extra: Partial<PropsVistaCartera> = {}) {
  return renderToStaticMarkup(
    <VistaCartera
      datos={datos}
      estado={datos ? 'listo' : 'error'}
      rol={rol}
      filtros={{ ...FILTROS_DEFECTO, ...filtros }}
      aplicar={nada}
      opcionesVerComo={rol === 'dueno' || rol === 'admin' ? OPCIONES : null}
      avisos={[]}
      volver="/crm"
      alElegirVer={nada}
      alReintentar={nada}
      alEliminar={rol === 'dueno' ? async () => {} : undefined}
      {...extra}
    />,
  )
}

// ── Datos fijos ──────────────────────────────────────────────────────────────────────────

const tasacionManana = { fecha: '2026-12-03', hora: '11:00', instante: ar('2026-12-03', '11:00'), asesor: TOMAS.nombre, direccion: 'Bacacay 2450' }

const coordinacion = datosPrueba({
  vista: { tipo: 'coordinacion', persona: { id: PAULA.id, nombre: PAULA.nombre, rol: 'coordinador' }, mirando: false },
  opcionesVerComo: null,
  filas: [
    filaPrueba({ nombre: 'Marcela Ibáñez', ultimoContacto: null, creadoEn: ar('2026-12-02', '10:12'), proximo: pasoPrueba('2026-12-02', '10:12', { titulo: 'Primera llamada', espera: { registradoEn: ar('2026-12-02', '10:12') } }) }),
    filaPrueba({ nombre: 'Sofía Lanús', propiedad: 'PH 4 amb · Colegiales', direccion: 'Conesa 1250', ultimoContacto: { at: ar('2026-12-02', '09:40'), que: 'llamada', resultado: 'no_atendio' }, proximo: pasoPrueba('2026-12-02', '09:00') }),
    filaPrueba({ nombre: 'Ernesto Villalba', etapa: 'coordinada', direccion: 'Bacacay 2450', asesor: { ...TOMAS, activo: true }, tasacion: tasacionManana, proximo: pasoPrueba('2026-12-02', '15:00', { titulo: 'Confirmar el horario' }) }),
    filaPrueba({ nombre: 'Valeria Ruggiero', etapa: 'no_realizada', propiedad: 'Villa Crespo', direccion: 'Thames 640', proximo: pasoPrueba('2026-12-02', '12:00', { titulo: 'Volver a coordinar' }) }),
    filaPrueba({ nombre: 'Solicitud Vieja', ultimoContacto: null, anteriorAlRegistro: true, creadoEn: ar('2026-09-10', '10:00'), proximo: null }),
  ],
})

const asesor = datosPrueba({
  vista: { tipo: 'asesor', persona: { id: TOMAS.id, nombre: TOMAS.nombre, rol: 'asesor' }, mirando: false },
  asesores: null,
  opcionesVerComo: null,
  filas: [
    filaPrueba({ nombre: 'Hernán Quintana', etapa: 'coordinada', tasacion: { ...tasacionManana, fecha: '2026-12-02', hora: '12:30', instante: ar('2026-12-02', '12:30') }, proximo: pasoPrueba('2026-12-02', '12:30', { clase: 'tasacion', titulo: 'Tasación' }) }),
    filaPrueba({ nombre: 'Mirta Sosa', etapa: 'entregada', ultimoContacto: { at: ar('2026-11-28', '12:00'), que: 'visita', resultado: null }, proximo: pasoPrueba('2026-12-01', '18:00', { titulo: 'Entregar la tasación' }) }),
    filaPrueba({ nombre: 'Inés Carrizo', etapa: 'seguimiento', proximo: pasoPrueba('2026-12-04', '10:00', { titulo: 'Llamar' }) }),
    filaPrueba({ nombre: 'Esteban Lugones', etapa: 'comprador', proximo: null }),
  ],
})

const DIC20 = new Date('2026-12-20T13:40:00Z').toISOString()
const dueno = datosPrueba({
  generadoEn: DIC20,
  filas: [
    filaPrueba({ nombre: 'Patricia Medrano', ultimoContacto: null, creadoEn: ar('2026-12-20', '10:12'), proximo: null }),
    filaPrueba({ nombre: 'Roberto Sanz', etapa: 'realizada', origen: 'historico', asesor: null }),
    filaPrueba({ nombre: 'Graciela Pinto', etapa: 'seguimiento', origen: 'historico', asesor: { ...FLORENCIA, activo: false } }),
    filaPrueba({ nombre: 'Mariana Vidal', etapa: 'seguimiento', asesor: { ...FLORENCIA, activo: true }, ultimoContacto: { at: ar('2026-11-28', '12:00'), que: 'llamada', resultado: 'volver_a_llamar' } }),
    filaPrueba({ nombre: 'Pablo Ibarra', etapa: 'seguimiento', asesor: { ...TOMAS, activo: true }, proximo: pasoPrueba('2026-12-19', '10:00', { titulo: 'Mandarle comparables', quien: { id: PAULA.id, nombre: 'Paula' } }) }),
    filaPrueba({ nombre: 'Daniela Spinetta', etapa: 'clase_gratuita', origen: 'clase_gratuita' }),
    filaPrueba({ nombre: 'Lucía Benedetti', etapa: 'descartado', cerradoEn: ar('2026-12-15', '10:00') }),
    filaPrueba({ nombre: 'Federico Montes de Oca', etapa: 'captada', cerradoEn: ar('2026-12-10', '10:00') }),
  ],
})

const deFlorencia: DatosCartera = {
  ...datosPrueba({ filas: [filaPrueba({ nombre: 'Claudio Benavídez', etapa: 'seguimiento', asesor: { ...FLORENCIA, activo: true }, proximo: pasoPrueba('2026-12-05', '10:00') })] }),
  vista: { tipo: 'asesor', persona: { id: FLORENCIA.id, nombre: FLORENCIA.nombre, rol: 'asesor' }, mirando: true },
  asesores: null,
  opcionesVerComo: null,
}

const contactos = datosContactosPrueba({
  filas: [
    contactoPrueba({ nombre: 'Ángela Ruiz', origen: 'referido', asesor: { ...TOMAS, activo: true }, proceso: { id: 'd-1', etapa: 'seguimiento' } }),
    contactoPrueba({ nombre: 'Carla Sinproceso', proceso: null, conProcesoAbierto: false }),
  ],
})

// ── Render ───────────────────────────────────────────────────────────────────────────────

const pantallas: Record<string, string> = {
  coordinacion: vista(coordinacion, 'coordinador'),
  asesor: vista(asesor, 'asesor'),
  dueno: vista(dueno, 'dueno'),
  'ver-como': vista(deFlorencia, 'dueno', { ver: FLORENCIA.id }),
  cerrados: vista(dueno, 'dueno', { seg: 'cerrados' }),
  'error-lista': vista(null, 'coordinador'),
  contactos: renderToStaticMarkup(
    <VistaContactos datos={contactos} estado="listo" propios={false} filtros={FILTROS_DEFECTO} aplicar={nada} avisos={[]} volver="/contacts" alReintentar={nada} />,
  ),
  'contactos-sin-proceso': renderToStaticMarkup(
    <VistaContactos datos={contactos} estado="listo" propios={false} filtros={{ ...FILTROS_DEFECTO, seg: 'cerrados' }} aplicar={nada} avisos={[]} volver="/contacts" alReintentar={nada} />,
  ),
}

/** El texto visible (sin etiquetas) más los textos de los atributos que se leen: placeholder y aria-label. */
function textoDe(html: string): string {
  const atributos = [...html.matchAll(/(?:placeholder|aria-label)="([^"]*)"/g)].map((m) => m[1])
  // Las marcas de énfasis van dentro de una frase ("lo ve <strong>Florencia…</strong>."):
  // se sacan sin espacio; el resto de las etiquetas separan palabras.
  const visible = html.replace(/<\/?(strong|em|b)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')
  return `${visible} ${atributos.join(' ')}`
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

const ESPERADOS: Record<string, string[]> = {
  coordinacion: [
    'CRM',
    'Solicitudes, coordinadas y no realizadas, ordenadas por lo que hay que hacer primero.',
    'Sin primer contacto', 'Nadie las llamó todavía. Primero la que más espera.',
    'Llamada o mensaje vencido', 'Tenían una tarea para antes de ahora.',
    'Tasaciones de hoy y mañana', 'Para confirmar el horario con la persona y con el asesor.',
    'El resto de las solicitudes y coordinadas', 'Ordenadas por el próximo paso. Al final, las que no tienen nada agendado.',
    'Por etapa', 'Solicitud', 'Coordinada', 'No realizada', 'Abiertos', 'Cerrados',
    'Buscar', 'Nombre, teléfono o calle', 'Filtros', 'Etapa', 'Todas las etapas', 'Origen', 'Todos los orígenes', 'Embudo', 'Referido', 'Histórico',
    'Asesor', 'Todos los asesores', 'Sin asesor', 'Entró al CRM', 'Cualquier fecha', 'Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 15 días',
    'Últimos 30 días', 'Últimos 90 días', 'Elegir fechas…',
    'Persona y propiedad', 'Último contacto', 'Próximo paso',
    'Abrir la ficha de Sofía Lanús', 'PH 4 amb · Colegiales · Conesa 1250', 'hace 1 h', 'Llamada · no atendió', 'Llamada 2',
    'Villa Crespo · Thames 640', 'Primera llamada', 'Espera hace 28 min', 'Sin contacto todavía', 'Sin contacto registrado',
    'Confirmar el horario', 'Tasación mañana 11:00', 'Volver a coordinar', 'Hoy 12:00', 'Nada agendado',
    'Mostrando 5 de 5 procesos abiertos',
  ],
  asesor: [
    'Tus procesos, ordenados por el próximo paso.',
    'Tasaciones de hoy', 'Las que tenés hoy, por hora.', 'Tareas vencidas', 'Tenían que estar hechas antes de ahora.',
    'Con próximo paso', 'Ordenados por fecha.', 'Sin nada pendiente', 'No tienen ninguna tarea ni visita. Poneles un próximo paso o cerrá el proceso.',
    'Tasación', 'Hoy 12:30', 'Entregar la tasación', 'Vencida hace 1 día', 'Visita de tasación', 'Comprador',
  ],
  dueno: [
    'El embudo completo, lo que está trabado y la lista de todos los procesos.',
    'Ver como', 'Mi vista (dueño)', 'Paula Pandolfo · coordinación', 'Florencia Ledesma · asesor',
    'Lo que está trabado', 'al dom 20 dic, 10:40',
    'Solicitudes sin primer contacto', 'De 1 solicitudes abiertas. Llama la coordinación.',
    'Procesos sin asesor', 'Ya pasaron la solicitud y nadie los tiene. De 4 procesos.', 'Realizada · Histórico',
    'Seguimientos sin movimiento', 'Sin contacto hace 14 días o más. De 3 seguimientos.', 'Ver el proceso en la lista', 'Ver los 2 en la lista',
    'Embudo de tasación', 'Fuera del embudo', 'Clase gratuita', 'Comprador',
    'Todos los procesos', 'Ordenar por', 'Más tiempo sin contacto', 'Más nuevos primero', 'Nombre (A a Z)', 'Seleccionar',
    'Sin asesor', '(dado de baja)', 'Sin movimiento', 'volver a llamar', 'Mandarle comparables', '· Paula',
  ],
  'ver-como': [
    'Estás viendo el CRM como lo ve Florencia Ledesma (asesor). Es solo para revisar: no cambia nada de lo que esa persona ve.',
    'Volver a mi vista', 'Los procesos de Florencia Ledesma, ordenados por el próximo paso.',
  ],
  cerrados: [
    'Cerrados', 'Los más recientes primero. Para volver a abrir uno, entrá a su ficha.', 'Todos los cerrados', 'Cierre',
    'Captada', 'Descartado', 'Descartado hace 5 días', 'Mostrando 2 de 2 procesos cerrados',
  ],
  'error-lista': [
    'No se pudo cargar la lista de procesos', 'Los filtros siguen ahí. El resto de la plataforma funciona.', 'Reintentar', 'No se pudo contar por etapa',
  ],
  contactos: [
    'Contactos', 'Todas las personas cargadas, con su proceso, el último contacto y el próximo paso.', 'Nuevo contacto',
    'Con proceso abierto', 'Sin proceso abierto', 'Personas', 'Persona', 'Proceso', 'Se registró', 'Mostrando 1 de 1 personas',
  ],
  'contactos-sin-proceso': ['Su proceso se cerró (captado o descartado) o nunca tuvo uno.', 'Sin proceso'],
}

// Palabras en inglés que delatarían un texto sin traducir (dentro del texto visible).
const INGLES = /\b(Loading|Search|Filters?|Clear|Show|Hide|Cancel|Next|Previous|Owner|Advisor|Stage|Contacts?|Deals?|No results|Retry|Load more|Select|Delete|View as|Back)\b/

let fallas = 0
const salida = process.argv[2]
for (const [nombre, html] of Object.entries(pantallas)) {
  const texto = textoDe(html)
  const faltan = (ESPERADOS[nombre] ?? []).filter((t) => !texto.includes(t))
  const problemas: string[] = []
  if (faltan.length) problemas.push(`faltan ${faltan.length}: ${faltan.map((t) => `«${t}»`).join(', ')}`)
  if (/Deals/i.test(texto)) problemas.push('aparece "Deals"')
  const sueltos = [...html.matchAll(/>(Todas|Todos)</g)].length
  if (sueltos) problemas.push(`${sueltos} "Todas"/"Todos" suelto(s)`)
  const ingles = INGLES.exec(texto)
  if (ingles) problemas.push(`texto en inglés: «${ingles[0]}»`)
  if (/opacity:\s*0(?![.\d])|\bopacity-0\b/.test(html)) problemas.push('algo con opacity:0')
  if (/\b\d+\s*NaN|undefined|\[object Object\]/.test(texto)) problemas.push('un valor sin armar (NaN/undefined/[object Object])')
  const enlaces = [...html.matchAll(/aria-label="Abrir la ficha de /g)].length
  console.log(`${problemas.length ? '✗' : '✓'} ${nombre}: ${(ESPERADOS[nombre] ?? []).length} textos de la spec, ${enlaces} filas, ${Math.round(html.length / 1024)} KB${problemas.length ? ` — ${problemas.join('; ')}` : ''}`)
  fallas += problemas.length
  if (salida) writeFileSync(join(salida, `cartera-${nombre}.html`), `<!doctype html><meta charset="utf-8"><body>${html}</body>`)
}
console.log(fallas ? `\n✗ ${fallas} problema(s)` : '\n✅ todo en orden')
process.exit(fallas ? 1 : 0)
