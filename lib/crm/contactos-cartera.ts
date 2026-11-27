// La lista de Contactos con la misma fila que el CRM (crm-cartera-por-rol, design.md D5 y
// D6). Puro. Quién ve a quién es la regla de la ficha (`puedeVerContacto`), no una copia.
import { alcanceContactos, puedeVerContacto, type VinculosContacto } from '@/lib/auth/contact-access'
import {
  TIPOS_TAREA_DE_PROCESO,
  proximoPaso,
  tareasConQuien,
  tasacionDe,
  textoPropiedad,
  type FilaCartera,
  type PerfilCartera,
  type ProcesoLeido,
  type TareaLeida,
} from './cartera'
import { estaAbierto, etapaCRM, type EtapaCRM } from './etapas'
import { tareasVisiblesEnFicha } from './tareas-ficha'
import { anteriorAlRegistro, type ContactoRegistrado } from './ultimo-contacto'

export interface FilaContacto extends Omit<FilaCartera, 'id' | 'etapa' | 'abierto'> {
  id: string // contact id
  proceso: { id: string; etapa: EtapaCRM } | null
  conProcesoAbierto: boolean
  registradoEn: string // contacts.created_at
}

export interface ContactoLeido {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  origin: string | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
}

/** Solo `contact_id, assigned_to, user_id` de `appraisals`: nunca `select('*')` (CLAUDE.md). */
export interface TasacionDeContacto {
  contact_id: string
  assigned_to: string | null
  user_id: string | null
}

/**
 * El proceso que muestra la fila. Para un asesor, SOLO entre los procesos a su nombre: si
 * eligiera entre todos, la fila (y la respuesta por la red) traería el proceso más nuevo
 * de otro asesor —48 personas tienen más de uno abierto—, lo mismo que la ficha oculta con
 * `dealsOcultos`. Sin ninguno suyo (lo ve por estar asignado, por haberlo creado o por una
 * tasación) → null. Dentro de los que puede ver: el abierto más reciente (Comprador es
 * abierto en la cartera), si no el cerrado más reciente.
 */
export function procesoDeContacto<
  T extends { id: string; stage: string; created_at: string; scheduled_date: string | null; assigned_to: string | null },
>(procesos: T[], quienMira: { id: string; role: string }): T | null {
  const candidatos =
    alcanceContactos(quienMira.role) === 'todos' ? procesos : procesos.filter((p) => !!quienMira.id && p.assigned_to === quienMira.id)
  const masNuevo = (lista: T[]) =>
    lista.reduce<T | null>((m, p) => (!m || Date.parse(p.created_at) > Date.parse(m.created_at) ? p : m), null)
  return masNuevo(candidatos.filter((p) => estaAbierto(etapaCRM(p)))) ?? masNuevo(candidatos)
}

/** Es `puedeVerContacto` de la ficha, con su nombre en esta lista: no se copia la regla. */
export function contactoVisible(u: { id: string; role: string }, v: VinculosContacto): boolean {
  return puedeVerContacto(u, v)
}

/**
 * Una fila por contacto visible. Solo se arman (y por lo tanto solo se mandan) los que
 * `contactoVisible` deja. Próximo paso: las tareas del proceso que muestra la fila, si está
 * abierto, más las ligadas solo al contacto (`contact_id` sin proceso); el asesor cuenta
 * solo las suyas, el equipo las de cualquiera (con las copias de la coordinación juntas).
 * Las tareas de un proceso cerrado no cuentan (la fila muestra el cierre).
 */
export function armarFilasContactos(e: {
  usuario: { id: string; role: string }
  contactos: ContactoLeido[]
  procesos: ProcesoLeido[]
  tasaciones: TasacionDeContacto[]
  tareas: TareaLeida[] | 'error'
  tareasCerradas: TareaLeida[]
  ultimos: Map<string, ContactoRegistrado> | 'error'
  perfiles: Map<string, PerfilCartera>
  ahora: Date
}): FilaContacto[] {
  const alcance = alcanceContactos(e.usuario.role)
  if (alcance === 'ninguno') return []
  const soloSuyas = alcance === 'propios'

  const procesosDe = new Map<string, ProcesoLeido[]>()
  for (const p of e.procesos) {
    if (!p.contact_id) continue
    procesosDe.set(p.contact_id, [...(procesosDe.get(p.contact_id) ?? []), p])
  }
  const tasacionesDe = new Map<string, (string | null)[]>()
  for (const t of e.tasaciones) tasacionesDe.set(t.contact_id, [...(tasacionesDe.get(t.contact_id) ?? []), t.assigned_to, t.user_id])

  const pendientes =
    e.tareas === 'error'
      ? []
      : e.tareas.filter(
          (t) =>
            t.status === 'pending' &&
            (TIPOS_TAREA_DE_PROCESO as readonly string[]).includes(t.type) &&
            (!soloSuyas || t.assigned_to === e.usuario.id),
        )

  const filas: FilaContacto[] = []
  for (const c of e.contactos) {
    const suyos = procesosDe.get(c.id) ?? []
    const visible = contactoVisible(e.usuario, {
      assigned_to: c.assigned_to,
      created_by: c.created_by,
      asesoresDeProcesos: suyos.map((p) => p.assigned_to),
      asesoresDeTasaciones: tasacionesDe.get(c.id) ?? [],
    })
    if (!visible) continue

    const p = procesoDeContacto(suyos, e.usuario)
    const etapa = p ? etapaCRM(p) : null
    const abierto = etapa ? estaAbierto(etapa) : false
    const idAsesor = p ? p.assigned_to : soloSuyas ? null : c.assigned_to
    const asesor = idAsesor
      ? { id: idAsesor, nombre: e.perfiles.get(idAsesor)?.nombre ?? 'Sin nombre', activo: e.perfiles.get(idAsesor)?.activo === true }
      : null
    const ultimoContacto: FilaContacto['ultimoContacto'] = e.ultimos === 'error' ? 'error' : (e.ultimos.get(c.id) ?? null)
    const tasacion = p && abierto ? tasacionDe(p, asesor?.nombre ?? null) : null
    const nombre = c.full_name?.trim() || 'Sin nombre'

    let proximo: FilaContacto['proximo'] = null
    if (e.tareas === 'error') proximo = 'error'
    else {
      const propias = pendientes.filter((t) => (t.deal_id ? abierto && p && t.deal_id === p.id : t.contact_id === c.id))
      const visibles = tareasVisiblesEnFicha(propias, {
        dealsConTasacionAgendada: tasacion && p ? [p.id] : [],
        dealsOcultos: [],
        usuarioId: '',
        soloPropiasSinProceso: false,
      })
      proximo = proximoPaso({
        tareas: tareasConQuien({
          tareas: visibles,
          deCualquiera: !soloSuyas,
          tareasCerradas: e.tareasCerradas,
          perfiles: e.perfiles,
          asesorDeLaFila: idAsesor,
        }),
        tasacion,
        quienTasacion: null,
        etapa,
        hayContactos: ultimoContacto !== null,
        registradoEn: p?.created_at ?? c.created_at,
        nombrePersona: nombre,
        ahora: e.ahora,
      })
    }

    const cerradoEn = p && etapa && !abierto ? (etapa === 'captada' ? (p.captured_at ?? p.stage_changed_at) : (p.lost_at ?? p.stage_changed_at)) : null
    filas.push({
      id: c.id,
      contactoId: c.id,
      nombre,
      telefono: c.phone,
      email: c.email,
      propiedad: p ? textoPropiedad(p) : '',
      direccion: p?.property_address?.trim() ?? '',
      origen: p?.origin ?? c.origin,
      asesor,
      // "Se registró" filtra por el alta del contacto: `creadoEn` es eso acá, así los
      // filtros de cartera.ts sirven igual para las dos listas.
      creadoEn: c.created_at,
      registradoEn: c.created_at,
      cerradoEn,
      colega: (p?.tags ?? []).includes('colega'),
      anteriorAlRegistro: anteriorAlRegistro(p?.created_at ?? c.created_at),
      ultimoContacto,
      proximo,
      tasacion,
      proceso: p && etapa ? { id: p.id, etapa } : null,
      conProcesoAbierto: abierto,
    })
  }
  return filas
}
