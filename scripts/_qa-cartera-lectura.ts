/**
 * Prueba real de la lectura de la cartera del CRM (crm-cartera-por-rol, tarea 4.3).
 * SOLO LECTURA contra producción: no escribe NADA.
 *
 *   node --require ./scripts/precarga-server-only.cjs --env-file=<carpeta>/.env.local --import tsx scripts/_qa-cartera-lectura.ts
 *
 * Llama a `cargarCartera` para la vista del dueño, de cada coordinador y de cada asesor
 * activo, y a `cargarContactos` para el equipo y para cada asesor; imprime filas por vista y
 * por etapa, `truncado`, `fuentes`, el tiempo de cada tanda, la lectura (d) de copias
 * cerradas (cuántas y desde cuándo) y el peso del JSON. Compara la vista del dueño con un
 * `select stage, (scheduled_date is not null), count(*) from deals` corrido al lado (en una
 * transacción READ ONLY) y verifica que ninguna fila de un asesor tenga otro asesor.
 *
 * No imprime datos de clientes: solo conteos y, del equipo, nombre y rol.
 *
 * Si existe el archivo de ids de `_qa-cartera-datos.ts` (tarea 8.2), al final dice dónde
 * cae cada caso de prueba `[TEST] Cartera QA <n>` en la vista de la coordinación y del
 * asesor (las dos con la cuenta "Claude · pruebas", como en el QA de la vista previa) y en
 * la del dueño, y lo compara con lo esperado. Esas filas son de prueba: sí se nombran.
 */
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { cargarCartera, cargarContactos, type Medicion } from '@/lib/supabase/cartera'
import { etapaCRM, estaAbierto, NOMBRE_ETAPA, type EtapaCRM } from '@/lib/crm/etapas'
import { agrupar, sinMovimiento, SIN_MOVIMIENTO_DIAS, type FilaCartera } from '@/lib/crm/cartera'
import { calcularTrabado } from '@/lib/crm/cartera-trabado'
import { datoProximo, datoUltimoContacto } from '@/lib/crm/cartera-pantalla'
import { diasDeCalendarioEntre, instanteDesdeAR } from '@/lib/crm/horario-laboral'
import { INICIO_REGISTRO_CONTACTOS } from '@/lib/crm/ultimo-contacto'
import { CLAUDE_QA } from './_qa-receta-comun'
import { ARCHIVO_IDS, archivo as archivoDeCasos, nombreDeCaso, type Caso } from './_qa-cartera-datos'

interface Perfil {
  id: string
  full_name: string | null
  role: string
  is_active: boolean | null
}

const problemas: string[] = []
const kb = (o: unknown) => `${(Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(1)} KB`

function porEtapa(etapas: EtapaCRM[]): string {
  const m = new Map<EtapaCRM, number>()
  for (const e of etapas) m.set(e, (m.get(e) ?? 0) + 1)
  return [...m.entries()].map(([e, n]) => `${NOMBRE_ETAPA[e]} ${n}`).join(' · ') || '(ninguna)'
}

function medicion(m: Medicion | null): string {
  if (!m) return 'sin medición'
  const previa = m.previaMs === null ? '' : `previa ${m.previaMs} ms · `
  const d = m.cerradasDesde === null ? '(d) no se pidió' : `(d) ${m.cerradasLeidas} cerradas desde ${m.cerradasDesde}`
  return `${previa}tanda 1 ${m.tanda1Ms} ms · tanda 2 ${m.tanda2Ms} ms · ${d}`
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !process.env.SUPABASE_DB_PASSWORD) throw new Error('faltan credenciales en el entorno')
  if (!url.includes('mncsnastmcjdjxrehdep')) throw new Error(`proyecto inesperado: ${url}`)

  const { data, error } = await createClient(url, key).from('profiles').select('id, full_name, role, is_active').eq('is_active', true)
  if (error) throw new Error(`perfiles: ${error.message}`)
  const perfiles: Perfil[] = data ?? []
  const dueno = perfiles.find((p) => p.role === 'dueno') ?? perfiles.find((p) => p.role === 'admin')
  if (!dueno) throw new Error('no hay un dueño ni un admin activo')
  const ahora = new Date()
  console.log(`Prueba de lectura · ${ahora.toISOString()} · proyecto mncsnastmcjdjxrehdep\n`)

  // ── Control: la base contada al lado, en una transacción de solo lectura ──
  const pg = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await pg.connect()
  let control: { stage: string; con_dia: boolean; n: number }[]
  try {
    await pg.query('BEGIN READ ONLY')
    const r = await pg.query<{ stage: string; con_dia: boolean; n: string }>(
      'select stage, (scheduled_date is not null) as con_dia, count(*) as n from deals group by 1,2 order by 1,2',
    )
    await pg.query('ROLLBACK')
    control = r.rows.map((x) => ({ stage: x.stage, con_dia: x.con_dia, n: Number(x.n) }))
  } finally {
    await pg.end()
  }
  console.log('Control (select stage, scheduled_date is not null, count(*) from deals group by 1,2):')
  for (const c of control) console.log(`  ${c.stage.padEnd(15)} ${String(c.con_dia).padEnd(5)} ${c.n}`)
  const controlPorEtapa = new Map<EtapaCRM, number>()
  for (const c of control) {
    const e = etapaCRM({ stage: c.stage, scheduled_date: c.con_dia ? '2000-01-01' : null })
    controlPorEtapa.set(e, (controlPorEtapa.get(e) ?? 0) + c.n)
  }
  const controlAbiertos = [...controlPorEtapa.entries()].filter(([e]) => estaAbierto(e)).reduce((s, [, n]) => s + n, 0)
  const controlCerrados = [...controlPorEtapa.entries()].filter(([e]) => !estaAbierto(e)).reduce((s, [, n]) => s + n, 0)
  console.log(`  → ${controlAbiertos} abiertos y ${controlCerrados} cerrados\n`)

  // ── La cartera de cada vista ──
  const vistas: { etiqueta: string; quien: { id: string; role: string } }[] = [
    { etiqueta: `dueño (${dueno.full_name})`, quien: { id: dueno.id, role: dueno.role } },
    ...perfiles.filter((p) => p.role === 'coordinador').map((p) => ({ etiqueta: `coordinación (${p.full_name})`, quien: { id: p.id, role: p.role } })),
    ...perfiles.filter((p) => p.role === 'asesor').map((p) => ({ etiqueta: `asesor (${p.full_name})`, quien: { id: p.id, role: p.role } })),
  ]
  console.log('CARTERA')
  for (const v of vistas) {
    let m: Medicion | null = null
    const t0 = Date.now()
    const r = await cargarCartera({ quien: v.quien, verComo: null }, ahora, { alMedir: (x) => { m = x } })
    const total = Date.now() - t0
    if (!r.ok) {
      problemas.push(`${v.etiqueta}: ${r.motivo}`)
      console.log(`  ${v.etiqueta}: ${r.motivo}`)
      continue
    }
    const d = r.datos
    const abiertos = d.filas.filter((f) => f.abierto)
    console.log(`  ${v.etiqueta}: ${d.filas.length} filas (${abiertos.length} abiertos, ${d.filas.length - abiertos.length} cerrados) · ${total} ms · ${kb(d)}`)
    console.log(`    ${porEtapa(d.filas.map((f) => f.etapa))}`)
    console.log(`    truncado ${d.truncado} · fuentes ${JSON.stringify(d.fuentes)} · ${medicion(m)}`)
    if (d.fuentes.tareas === 'error' || d.fuentes.ultimoContacto === 'error') problemas.push(`${v.etiqueta}: una fuente vino en error`)

    if (v.quien.role === 'asesor') {
      const ajenas = d.filas.filter((f) => f.asesor?.id !== v.quien.id)
      if (ajenas.length > 0) problemas.push(`${v.etiqueta}: ${ajenas.length} filas con otro asesor o sin asesor`)
      console.log(`    filas con otro asesor o sin asesor: ${ajenas.length}`)
    }
    if (v.quien.id === dueno.id) {
      for (const [e, n] of controlPorEtapa) {
        const vista = d.filas.filter((f) => f.etapa === e).length
        if (vista !== n) problemas.push(`dueño: ${NOMBRE_ETAPA[e]} ${vista} en la vista contra ${n} en la base`)
      }
      const coincide = abiertos.length === controlAbiertos && d.filas.length - abiertos.length === controlCerrados
      if (!coincide) problemas.push('dueño: abiertos/cerrados no coinciden con el control')
      console.log(`    contra el control: ${coincide ? 'coincide' : 'NO coincide'} (${abiertos.length}/${controlAbiertos} abiertos, ${d.filas.length - abiertos.length}/${controlCerrados} cerrados)`)
    }
  }

  // ── Contactos ──
  console.log('\nCONTACTOS')
  const deContactos: { etiqueta: string; quien: { id: string; role: string } }[] = [
    { etiqueta: `equipo (${dueno.full_name})`, quien: { id: dueno.id, role: dueno.role } },
    ...perfiles.filter((p) => p.role === 'asesor').map((p) => ({ etiqueta: `asesor (${p.full_name})`, quien: { id: p.id, role: p.role } })),
  ]
  for (const v of deContactos) {
    let m: Medicion | null = null
    const t0 = Date.now()
    const d = await cargarContactos(v.quien, ahora, { alMedir: (x) => { m = x } })
    const total = Date.now() - t0
    if (!d) {
      problemas.push(`${v.etiqueta}: sin alcance`)
      continue
    }
    const conAbierto = d.filas.filter((f) => f.conProcesoAbierto).length
    console.log(`  ${v.etiqueta}: ${d.filas.length} personas (${conAbierto} con proceso abierto) · ${total} ms · ${kb(d)}`)
    console.log(`    truncado ${d.truncado} · fuentes ${JSON.stringify(d.fuentes)} · ${medicion(m)}`)
    if (v.quien.role === 'asesor') {
      const ajenas = d.filas.filter((f) => f.proceso && f.asesor?.id !== v.quien.id)
      if (ajenas.length > 0) problemas.push(`${v.etiqueta}: ${ajenas.length} personas muestran un proceso de otro asesor`)
      console.log(`    personas con un proceso de otro asesor: ${ajenas.length}`)
    }
  }

  await casosDePrueba(perfiles, ahora)

  console.log(problemas.length === 0 ? '\n✅ sin problemas' : `\n❌ ${problemas.length} problema(s):\n  - ${problemas.join('\n  - ')}`)
  if (problemas.length > 0) process.exitCode = 1
}

main().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})

// ── Casos de prueba (tarea 8.2) ──────────────────────────────────────────────────────────

/** Dónde cae cada caso de `_qa-cartera-datos.ts`, contra lo esperado. Solo lee. */
async function casosDePrueba(perfiles: Perfil[], ahora: Date): Promise<void> {
  const ids = archivoDeCasos.leer()
  if (!ids) {
    console.log(`\nCASOS DE PRUEBA: no hay archivo de ids (${ARCHIVO_IDS}); se saltea`)
    return
  }
  const claude = perfiles.find((p) => p.full_name === 'Claude · pruebas')
  if (!claude) {
    problemas.push(`casos de prueba: no está la cuenta ${CLAUDE_QA} activa`)
    return
  }
  const leer = async (role: string): Promise<FilaCartera[]> => {
    const r = await cargarCartera({ quien: { id: claude.id, role }, verComo: null }, ahora)
    if (!r.ok) throw new Error(`vista ${role} de "Claude · pruebas": ${r.motivo}`)
    return r.datos.filas
  }
  const [coordinacion, asesor, dueno] = await Promise.all([leer('coordinador'), leer('asesor'), leer('admin')])
  const gruposCoord = agrupar(coordinacion, { tipo: 'coordinacion', personaId: claude.id }, ahora)
  const gruposAsesor = agrupar(asesor, { tipo: 'asesor', personaId: claude.id }, ahora)
  const trabado = calcularTrabado(dueno, ahora)
  const proceso = (n: Caso) => ids.casos[n]?.proceso ?? ''
  const fila = (lista: FilaCartera[], n: Caso) => lista.find((f) => f.id === proceso(n)) ?? null
  const grupo = (gs: ReturnType<typeof agrupar>, n: Caso) => gs.find((g) => g.filas.some((f) => f.id === proceso(n)))?.clave ?? '(ausente)'
  const diasDesdeInicio = diasDeCalendarioEntre(instanteDesdeAR(INICIO_REGISTRO_CONTACTOS, '00:00'), ahora)

  console.log(`\nCASOS DE PRUEBA (${ARCHIVO_IDS}, creados ${ids.creadoEn})`)
  console.log(`  días desde INICIO_REGISTRO_CONTACTOS (${INICIO_REGISTRO_CONTACTOS}): ${diasDesdeInicio}`)
  const chequeo = (n: Caso, que: string, real: string, esperado: string) => {
    const ok = real === esperado
    if (!ok) problemas.push(`caso ${n}: ${que} = ${real} (se esperaba ${esperado})`)
    console.log(`  ${ok ? '✓' : '✗'} ${nombreDeCaso(n).padEnd(22)} ${que}: ${real}${ok ? '' : ` (se esperaba ${esperado})`}`)
  }
  const ultimo = (lista: FilaCartera[], n: Caso) => {
    const f = fila(lista, n)
    if (!f) return '(sin fila)'
    const d = datoUltimoContacto(f, ahora)
    return d.tipo === 'error' ? 'error' : d.tipo === 'nada' ? d.texto : d.sub
  }
  const proximo = (lista: FilaCartera[], n: Caso) => {
    const f = fila(lista, n)
    if (!f) return '(sin fila)'
    const d = datoProximo(f, ahora)
    return d.tipo === 'paso' ? `${d.titulo} · ${d.estado}` : d.tipo === 'error' ? 'error' : d.texto
  }
  const enTrabado = (col: 'sinContacto' | 'sinAsesor' | 'sinMovimiento', n: Caso) =>
    trabado === 'error' ? 'error' : trabado[col].filas.some((f) => f.id === proceso(n)) ? 'sí' : 'no'

  chequeo('1', 'grupo en la coordinación', grupo(gruposCoord, '1'), 'sin-contacto')
  chequeo('2', 'grupo en la coordinación', grupo(gruposCoord, '2'), 'vencidas')
  chequeo('2', 'próximo paso', proximo(coordinacion, '2'), '[TEST] Llamada 2 · vencida')
  chequeo('3', 'grupo en la coordinación', grupo(gruposCoord, '3'), 'tasaciones')
  chequeo('4', 'grupo en la coordinación', grupo(gruposCoord, '4'), 'resto')
  chequeo('4', 'último contacto', ultimo(coordinacion, '4'), 'Sin contacto registrado')
  const f5 = fila(dueno, '5')
  const marcada = f5 ? String(sinMovimiento(f5, ahora)) : '(sin fila)'
  chequeo('5', 'sin movimiento (dueño)', marcada, String(diasDesdeInicio >= SIN_MOVIMIENTO_DIAS))
  chequeo('5', 'en "Lo que está trabado" sin movimiento', enTrabado('sinMovimiento', '5'), diasDesdeInicio >= SIN_MOVIMIENTO_DIAS ? 'sí' : 'no')
  chequeo('5', 'último contacto', ultimo(dueno, '5'),
    diasDesdeInicio >= SIN_MOVIMIENTO_DIAS ? 'Sin movimiento · Visita de tasación · antes del registro de llamadas' : 'Visita de tasación · antes del registro de llamadas')
  chequeo('5b', 'próximo paso', proximo(dueno, '5b'), 'Cargar el resultado de la tasación · vencida')
  chequeo('6', 'en "Lo que está trabado" sin asesor', enTrabado('sinAsesor', '6'), 'sí')
  chequeo('7', 'en la coordinación', fila(coordinacion, '7') ? 'sí' : 'no', 'no')
  chequeo('7', 'en la vista del dueño', fila(dueno, '7') ? 'sí' : 'no', 'sí')
  chequeo('8', 'grupo en la coordinación', grupo(gruposCoord, '8'), 'cerrados')
  chequeo('8', 'colega', String(fila(coordinacion, '8')?.colega ?? '(sin fila)'), 'true')
  chequeo('9', 'grupo en la vista de asesor', grupo(gruposAsesor, '9'), 'cerrados')
  chequeo('10', 'en la vista de "Claude · pruebas" como asesor', fila(asesor, '10') ? 'sí' : 'no', 'no')
  chequeo('10', 'en la vista del dueño', fila(dueno, '10') ? 'sí' : 'no', 'sí')
}
