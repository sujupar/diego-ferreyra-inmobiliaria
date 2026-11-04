/**
 * Quién cuenta en el embudo y hasta dónde llegó cada persona.
 *
 * Port de `scripts/metricas/tablas-mensuales.py`, la lógica con la que se
 * reconstruyó el año a mano y que el dueño validó ("Meta y embudos mes a mes").
 * Si se cambia una regla acá, el panel deja de coincidir con ese documento.
 *
 * Reglas (spec §Definiciones):
 *  - Una persona cuenta UNA vez por paso y por embudo: si pidió dos veces es
 *    1 solicitud; si se agendó es 1 solicitud y 1 agendada.
 *  - Identidad = contacto, o teléfono (10 últimos dígitos), o email.
 *  - Fuera siempre: pruebas (Julián, [TEST], @prueba.local, *.test) y colegas.
 *  - El sistema viejo (procesos "Importado de GHL") no tiene fechas confiables
 *    por etapa: sus `*_at` son artefactos del trigger. Ahí la etapa sale del
 *    "Stage GHL" de las notas y la fecha es la de la solicitud.
 */

export type Embudo = 'tasacion' | 'clase'
export type Etapa = 'solicitud' | 'agendada' | 'realizada' | 'entregada' | 'captada'
export const ETAPAS: Etapa[] = ['solicitud', 'agendada', 'realizada', 'entregada', 'captada']

export interface ContactoRow {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
}

export interface DealRow {
  id: string
  contact_id: string | null
  origin: string | null
  stage: string | null
  created_at: string
  notes: string | null
  appraisal_id: string | null
  landing_variant: string | null
  scheduled_at: string | null
  visited_at: string | null
  visit_completed_at: string | null
  delivered_at: string | null
  captured_at: string | null
}

export interface HistoriaRow { deal_id: string; to_stage: string; changed_at: string }
export interface InformeRow { contact_id: string | null; created_at: string }
export interface EnvioLanding { deal_id: string | null; funnel: string }

/** Una persona del embudo, con la fecha en que llegó a cada paso (null = no llegó). */
export interface Persona {
  embudo: Embudo
  /** Contacto de su primera solicitud. */
  contactId: string | null
  /** Identidad (contacto, teléfono o email) para no contar dos veces a quien está en los dos embudos. */
  identidad: string
  variante: string | null
  /** true si su primera solicitud vino del sistema viejo (fechas por etapa aproximadas). */
  historico: boolean
  fechas: Record<Etapa, string | null>
}

/**
 * Captaciones rastreadas a mano por teléfono: la propiedad se cargó sin la
 * persona (Boedo 1900, Salta 297, Pico 4690). Valor = fecha de captación si se
 * conoce.
 */
export const CAPTACIONES_RASTREADAS: Record<string, string | null> = {
  '1163514822': '2026-07-13',
  '1169103181': '2026-09-09',
  '1151322064': null,
}

export const sinEspacios = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ')

export function tel10(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-10) : null
}

export function mail(e: string | null | undefined): string | null {
  const v = (e ?? '').trim().toLowerCase()
  return v || null
}

/** Contactos de prueba, tal como los define `bajar-datos.mjs`. */
export function contactosDePrueba(contactos: ContactoRow[]) {
  const nombre = (c: ContactoRow) => (c.full_name ?? '').toLowerCase()
  const email = (c: ContactoRow) => (c.email ?? '').toLowerCase()
  const telefonosJulian = new Set(
    contactos.filter(c => email(c).includes('julianparra')).map(c => tel10(c.phone)).filter(Boolean) as string[],
  )
  const ids = new Set<string>()
  const tels = new Set<string>(['1100000000'])
  const emails = new Set<string>()
  for (const c of contactos) {
    const n = nombre(c), e = email(c), t = tel10(c.phone)
    const prueba =
      e.includes('julianparra') || /julian.*parra/.test(n) || n.startsWith('julian prueba') ||
      (t != null && telefonosJulian.has(t)) ||
      n.startsWith('[test') || e.endsWith('@prueba.local') || e.endsWith('.test') || e.endsWith('@julian.com')
    if (!prueba) continue
    ids.add(c.id)
    if (t && t !== '1100000000') tels.add(t)
    const m = mail(c.email)
    if (m) emails.add(m)
  }
  return { ids, tels, emails }
}

export type Clasificacion = { embudo: Embudo | null; via: 'import' | 'form_viejo' | 'landing_propia'; colega: boolean; stageGhl: string | null }

/** De qué embudo es una solicitud (o null si no es de ninguno de los dos). */
export function clasificar(d: DealRow, envios: Map<string, Set<string>>): Clasificacion {
  const n = sinEspacios(d.notes)
  const low = n.toLowerCase()
  const importado = low.startsWith('importado de ghl')
  const formViejo = low.startsWith('origen: ghl form')
  const stageGhl = n.match(/Stage GHL: (.*?) Source GHL/)?.[1] ?? null
  const colega = low.includes('stage ghl: colega')
  let embudo: Embudo | null = null
  if (importado) {
    if (low.includes('contact source: form - [tasaci')) embudo = 'tasacion'
    else if (low.includes('contact source: form - [clase')) embudo = 'clase'
  } else if (formViejo) {
    if (d.origin === 'embudo') embudo = 'tasacion'
    else if (d.origin === 'clase_gratuita') embudo = 'clase'
  } else {
    const f = envios.get(d.id)
    if (f?.has('tasacion')) embudo = 'tasacion'
    else if (f?.has('clase')) embudo = 'clase'
  }
  return { embudo, via: importado ? 'import' : formViejo ? 'form_viejo' : 'landing_propia', colega, stageGhl }
}

const FECHA_AR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
/**
 * Día en hora ARGENTINA (como el gasto de Meta y las visitas). Una solicitud a
 * las 22:30 del 31/10 es del 31/10, no del 1/11 como diría la fecha en UTC.
 * Una fecha sola ('YYYY-MM-DD') se toma tal cual.
 */
export const dia = (ts: string | null | undefined): string | null => {
  if (!ts) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : FECHA_AR.format(d)
}
const menor = (...xs: (string | null | undefined)[]) =>
  xs.filter((x): x is string => !!x).sort()[0] ?? null

export interface EntradaPersonas {
  deals: DealRow[]
  contactos: ContactoRow[]
  historia: HistoriaRow[]
  informes: InformeRow[]
  envios: EnvioLanding[]
}

export interface ResultadoPersonas {
  personas: Persona[]
  excluidas: { pruebas: number; colegas: number; repetidas: number }
}

/**
 * Arma la lista de personas de los dos embudos.
 *
 * Fechas por etapa: la más temprana de las evidencias de esa persona, en
 * cualquiera de sus procesos. Si llegó a un paso pero no hay fecha (sistema
 * viejo, captación rastreada), cae a la del paso anterior: nunca se pierde una
 * persona por falta de fecha, a lo sumo se cuenta antes.
 */
export function armarPersonas(e: EntradaPersonas): ResultadoPersonas {
  const contacto = new Map(e.contactos.map(c => [c.id, c]))
  const prueba = contactosDePrueba(e.contactos)
  const envios = new Map<string, Set<string>>()
  for (const s of e.envios) {
    if (!s.deal_id) continue
    if (!envios.has(s.deal_id)) envios.set(s.deal_id, new Set())
    envios.get(s.deal_id)!.add(s.funnel)
  }
  const historia = new Map<string, Map<string, string>>()
  for (const h of e.historia) {
    const m = historia.get(h.deal_id) ?? new Map<string, string>()
    const prev = m.get(h.to_stage)
    if (!prev || h.changed_at < prev) m.set(h.to_stage, h.changed_at)
    historia.set(h.deal_id, m)
  }
  const informes = new Map<string, string>()
  for (const a of e.informes) {
    if (!a.contact_id) continue
    const prev = informes.get(a.contact_id)
    if (!prev || a.created_at < prev) informes.set(a.contact_id, a.created_at)
  }

  const telDe = (d: DealRow) => tel10(d.contact_id ? contacto.get(d.contact_id)?.phone : null)
  const mailDe = (d: DealRow) => mail(d.contact_id ? contacto.get(d.contact_id)?.email : null)

  const porContacto = new Map<string, DealRow[]>(), porTel = new Map<string, DealRow[]>(), porMail = new Map<string, DealRow[]>()
  const push = (m: Map<string, DealRow[]>, k: string | null, d: DealRow) => {
    if (!k) return
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(d)
  }
  for (const d of e.deals) { push(porContacto, d.contact_id, d); push(porTel, telDe(d), d); push(porMail, mailDe(d), d) }

  const excluidas = { pruebas: 0, colegas: 0, repetidas: 0 }
  const vistas = new Set<string>()
  const personas: Persona[] = []
  const ordenados = [...e.deals].sort((a, b) => a.created_at.localeCompare(b.created_at))

  for (const d of ordenados) {
    const c = clasificar(d, envios)
    if (!c.embudo) continue
    const t = telDe(d), m = mailDe(d)
    if ((d.contact_id && prueba.ids.has(d.contact_id)) || (t && prueba.tels.has(t)) || (m && prueba.emails.has(m))) {
      excluidas.pruebas++; continue
    }
    if (c.colega) { excluidas.colegas++; continue }
    const claves = [d.contact_id, t && 'p' + t, m && 'e' + m].filter(Boolean).map(k => `${c.embudo}:${k}`)
    if (claves.some(k => vistas.has(k))) { excluidas.repetidas++; continue }
    claves.forEach(k => vistas.add(k))

    // Todos los procesos de esta persona (por cualquiera de sus identidades).
    const suyos = new Map<string, DealRow>()
    for (const x of [...(d.contact_id ? porContacto.get(d.contact_id) ?? [] : []), ...(t ? porTel.get(t) ?? [] : []), ...(m ? porMail.get(m) ?? [] : [])]) suyos.set(x.id, x)

    const solicitud = dia(d.created_at)!
    let agendada: string | null = null, realizada: string | null = null, entregada: string | null = null, captada: string | null = null
    const marcar = (k: 'a' | 'r' | 'e' | 'c', f: string | null) => {
      const v = f ?? solicitud
      if (k === 'a') agendada = menor(agendada, v)
      if (k === 'r') realizada = menor(realizada, v)
      if (k === 'e') entregada = menor(entregada, v)
      if (k === 'c') captada = menor(captada, v)
    }
    const contactosSuyos = new Set<string>()
    for (const x of suyos.values()) {
      if (x.contact_id) contactosSuyos.add(x.contact_id)
      const cx = clasificar(x, envios)
      if (cx.via === 'import') {
        const g = cx.stageGhl
        const base = dia(x.created_at)
        if (g && ['Se coordinó Tasación', 'No se Realizo', 'Seguimiento para Captación', 'Captada'].includes(g)) marcar('a', base)
        if (g && ['Seguimiento para Captación', 'Captada'].includes(g)) { marcar('r', base); marcar('e', base) }
        if (g === 'Captada') marcar('c', base)
        continue
      }
      const h = historia.get(x.id) ?? new Map<string, string>()
      const st = new Set<string>([x.stage ?? '', ...h.keys()])
      const tiene = (...s: string[]) => s.some(v => st.has(v))
      if (tiene('scheduled', 'not_visited', 'visited', 'appraisal_sent', 'captured'))
        marcar('a', dia(menor(x.scheduled_at, h.get('scheduled'), h.get('not_visited'), h.get('visited'))))
      if (tiene('visited', 'appraisal_sent', 'captured') || x.visit_completed_at || x.appraisal_id)
        marcar('r', dia(menor(x.visited_at, x.visit_completed_at, h.get('visited'))))
      if (tiene('appraisal_sent', 'captured'))
        marcar('e', dia(menor(x.delivered_at, h.get('appraisal_sent'))))
      if (st.has('captured'))
        marcar('c', dia(menor(x.captured_at, h.get('captured'))))
    }
    for (const cid of contactosSuyos) {
      const f = informes.get(cid)
      if (f) marcar('r', dia(f))
    }
    if (t && t in CAPTACIONES_RASTREADAS) {
      const f = CAPTACIONES_RASTREADAS[t]
      marcar('a', null); marcar('r', null); marcar('e', null); marcar('c', f)
    }
    // Llegar a un paso implica haber pasado por los anteriores.
    if (captada) entregada = entregada ?? captada
    if (entregada) realizada = realizada ?? entregada
    if (realizada) agendada = agendada ?? realizada
    // Y ningún paso puede ser anterior a la solicitud ni al paso previo.
    const fechas: Record<Etapa, string | null> = { solicitud, agendada, realizada, entregada, captada }
    let piso = solicitud
    for (const et of ETAPAS) {
      const f = fechas[et]
      if (!f) continue
      if (f < piso) fechas[et] = piso
      piso = fechas[et]!
    }
    personas.push({ embudo: c.embudo, contactId: d.contact_id, identidad: d.contact_id ?? (t ? 'p' + t : m ? 'e' + m : d.id), variante: d.landing_variant, historico: c.via === 'import', fechas })
  }
  return { personas, excluidas }
}
