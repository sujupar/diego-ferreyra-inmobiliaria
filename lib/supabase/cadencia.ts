// `aplicarCadencia` (design.md D4, paso 3, y D7): la segunda mitad de guardar una llamada
// o un WhatsApp marcado. La usan por igual el guardado nuevo, el guardado repetido, la
// ruta de reintento y el script de prueba contra la base (que no tiene sesión): por eso
// vive acá y no en un `route.ts`. Service role, como el resto de `lib/supabase/`.
//
// Qué sale de quién: las TAREAS (a quién va la nueva, cuáles se cierran, `procesoPropio`)
// salen de quien REGISTRÓ (`created_by` de la actividad); los BOTONES (`ofrecer`) salen de
// quien HACE EL PEDIDO. El proceso es siempre el de la actividad, nunca el activo de ahora.
import { hasPermission } from '@/lib/auth/roles'
import {
  cierraSoloPropias,
  decidirCadencia,
  hayTareaWhatsappDeCadenciaPendiente,
  tareasACerrar,
  type MotivoSinTarea,
  type Ofrecer,
} from '@/lib/crm/cadencia'
import { numerarLlamadas } from '@/lib/crm/actividades'
import { esProcesoPropio, puedeCerrarProceso, puedeConvertirSolicitud, situacionProceso } from '@/lib/crm/deal-activo'
import { enArgentina } from '@/lib/crm/horario-laboral'
import type { Role } from '@/types/auth.types'
import {
  intentosNoAnulados,
  leerProcesoParaCadencia,
  nombreDelContacto,
  rolDePerfil,
  type FilaActividad,
} from './actividades'
import {
  closeTasksByActivity,
  createCadenceTask,
  getPendingTasksForContact,
  getTasksOfActivity,
} from './tasks'

export interface TareaCreadaDeCadencia {
  id: string
  title: string
  due_date: string
  due_time: string
  channel: string
}

/** El bloque `cadencia` de la respuesta de las rutas (D4). */
export interface BloqueCadencia {
  aplica: boolean
  tareaCreada: TareaCreadaDeCadencia | null
  motivoSinTarea: MotivoSinTarea | null
  tareasCerradas: { id: string; title: string }[]
  ofrecer: Ofrecer
  dealId: string | null
}

export interface ResultadoCadencia {
  cadencia: BloqueCadencia
  intento: number | null // número de la llamada dentro de su proceso; null si es WhatsApp
  pendiente: boolean // true = faltó cerrar o crear tareas después del reintento (D7)
}

/** Lo que responde un guardado repetido de una actividad ya anulada (D4, paso 2). */
export const CADENCIA_VACIA: BloqueCadencia = {
  aplica: false,
  tareaCreada: null,
  motivoSinTarea: null,
  tareasCerradas: [],
  ofrecer: null,
  dealId: null,
}

export interface Solicitante {
  id: string
  role: Role
}

/**
 * Corre un paso que escribe con UN reintento (D7). Si falla dos veces no tira: deja el
 * motivo en el log con el id de la actividad y devuelve `false`, así el resto de la
 * cadencia sigue y la ruta responde `pendiente: true`.
 */
async function conUnReintento(paso: string, actividadId: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (primero) {
    try {
      await fn()
      return true
    } catch (segundo) {
      console.error(`aplicarCadencia: no se pudo ${paso} (dos intentos)`, {
        actividadId,
        primero: primero instanceof Error ? primero.message : String(primero),
        segundo: segundo instanceof Error ? segundo.message : String(segundo),
      })
      return false
    }
  }
}

/** Leer también se reintenta una vez; si vuelve a fallar, tira (la ruta responde 500). */
async function leerConReintento<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    // Se ignora el primer error a propósito: el segundo intento decide, y si falla tira.
    return fn()
  }
}

export async function aplicarCadencia(actividad: FilaActividad, solicitante: Solicitante): Promise<ResultadoCadencia> {
  if (actividad.kind !== 'call' && actividad.kind !== 'whatsapp_sent') {
    throw new Error(`aplicarCadencia: solo llamadas y WhatsApp (actividad ${actividad.id} es "${actividad.kind}")`)
  }
  const contactId = actividad.contact_id
  const dealId = actividad.deal_id

  // a. Proceso de la actividad, intentos, tareas pendientes y quién registró.
  const [proceso, nombre, intentos, pendientes, rolAutor] = await Promise.all([
    dealId ? leerProcesoParaCadencia(dealId) : Promise.resolve(null),
    nombreDelContacto(contactId),
    intentosNoAnulados(contactId, dealId),
    getPendingTasksForContact(contactId, dealId ? [dealId] : []),
    actividad.created_by ? rolDePerfil(actividad.created_by) : Promise.resolve(null),
  ])

  // Autor borrado (o sin perfil): quien registra, de quién es el proceso y a quién va la
  // tarea salen de quien hace el pedido. Si no, una "No atendió" de un autor borrado daría
  // `proceso_ajeno` para siempre aunque la reintente una coordinadora.
  const registrante =
    actividad.created_by && rolAutor ? { id: actividad.created_by, role: rolAutor } : { id: solicitante.id, role: solicitante.role }

  const evaluado = {
    id: actividad.id,
    deal_id: dealId,
    kind: actividad.kind,
    call_outcome: actividad.call_outcome,
    occurred_at: actividad.occurred_at,
    created_at: actividad.created_at,
  }
  // La actividad puede no venir en la lectura (réplica atrasada): se suma igual.
  const intentosDelProceso = intentos.some((i) => i.id === actividad.id) ? intentos : [...intentos, evaluado]
  const intento = actividad.kind === 'call' ? (numerarLlamadas(intentosDelProceso).get(actividad.id) ?? null) : null

  const situacion = situacionProceso(proceso)
  const procesoPropio = proceso ? esProcesoPropio(registrante, proceso) : true

  const decision = decidirCadencia({
    evaluado,
    intentosDelProceso,
    numeroDeIntento: intento,
    nombreContacto: nombre,
    situacion,
    puedeConvertir: proceso
      ? puedeConvertirSolicitud(
          {
            id: solicitante.id,
            puedeVerTodos: hasPermission(solicitante.role, 'pipeline.view_all'),
            puedeCoordinar: hasPermission(solicitante.role, 'pipeline.schedule'),
          },
          proceso,
        )
      : false,
    puedeCerrar: proceso
      ? puedeCerrarProceso(
          { id: solicitante.id, role: solicitante.role, puedeAvanzar: hasPermission(solicitante.role, 'pipeline.advance') },
          proceso,
        )
      : false,
    puedeAbrir: proceso ? esProcesoPropio(solicitante, proceso) : false,
    procesoPropio,
    hayTareaWhatsappDeCadenciaPendiente: hayTareaWhatsappDeCadenciaPendiente(pendientes, {
      evaluadoId: actividad.id,
      dealId,
      contactId,
      creadasAntesDe: actividad.created_at,
    }),
    volverEl: actividad.callback_at ? enArgentina(new Date(actividad.callback_at)) : null,
    cargadoEn: new Date(actividad.created_at),
  })

  let pendiente = false
  if (decision.aplica) {
    // c. Cerrar lo que este intento completa.
    const aCerrar = tareasACerrar(pendientes, {
      dealId,
      contactId,
      registranteId: registrante.id,
      incluirWhatsapp: decision.cerrarWhatsapp,
      creadasAntesDe: actividad.created_at,
      soloPropias: cierraSoloPropias({ procesoPropio, rolRegistrante: registrante.role, dealId }),
    }).map((t) => t.id)
    if (aCerrar.length > 0) {
      const cerro = await conUnReintento('cerrar tareas', actividad.id, () => closeTasksByActivity(aCerrar, actividad.id))
      if (!cerro) pendiente = true
    }

    // d. Crear la siguiente, a nombre de quien registró. El índice único la protege.
    const tarea = decision.tarea
    if (tarea) {
      const creo = await conUnReintento('crear la tarea siguiente', actividad.id, () =>
        createCadenceTask({
          type: 'follow_up',
          title: tarea.title,
          assigned_to: registrante.id,
          created_by: registrante.id,
          deal_id: dealId,
          contact_id: contactId,
          channel: tarea.channel,
          due_date: tarea.due_date,
          due_time: tarea.due_time,
          all_day: false,
          source_activity_id: actividad.id,
        }),
      )
      if (!creo) pendiente = true
    }
  }

  // e. La respuesta sale de LEER la base, no de lo que escribió este pedido: así el
  // guardado repetido, dos pedidos a la vez y el reintento responden lo mismo.
  const hecho = await leerConReintento(() => getTasksOfActivity(actividad.id))
  const hizoAlgo = hecho.creada !== null || hecho.cerradas.length > 0
  return {
    intento,
    pendiente,
    cadencia: {
      aplica: hizoAlgo || decision.aplica,
      tareaCreada: hecho.creada,
      motivoSinTarea: hecho.creada ? null : decision.motivoSinTarea,
      tareasCerradas: hecho.cerradas,
      ofrecer: decision.ofrecer,
      dealId,
    },
  }
}
