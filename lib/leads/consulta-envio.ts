/**
 * ¿Le mandamos el WhatsApp automático a esta consulta?
 *
 * Función PURA con todos los frenos juntos, para que la decisión se pueda leer
 * de un vistazo y testear sin red. El orden importa: primero lo que apaga todo,
 * después lo que falta.
 *
 * Devuelve SIEMPRE un motivo, incluso cuando dice que sí. El motivo es lo que
 * después se le muestra al equipo en la pantalla de consultas sin atender: sin
 * él, "no se mandó" es indistinguible de "no pasó nada".
 */

export interface ConsultaParaEnviar {
  lead_phone: string | null
  property_id: string | null
  /** Ya se le mandó antes: la ingesta reprocesa mails y nadie puede recibir dos. */
  whatsapp_enviado_at?: string | null
}

/**
 * El normalizador entra POR PARÁMETRO en vez de importarse.
 *
 * Es lo que mantiene esta función pura y testeable sin la librería de teléfonos
 * —que carga distinto dentro de Next que en un script suelto y nos costó una
 * hora de diagnóstico—. Quien llama pasa el normalizador real; los tests pasan
 * uno de mentira.
 */
export type Normalizador = (v: string | null | undefined) => string | null

export interface AjustesEnvio {
  consulta_respuesta_enabled: boolean
  consulta_test_phones: string[]
}

export type DecisionEnvio =
  | { enviar: true; telefono: string }
  | { enviar: false; motivo: string; visibleParaElEquipo: boolean }

/**
 * `visibleParaElEquipo` distingue "esta consulta necesita que alguien la
 * atienda a mano" (sin propiedad, sin teléfono) de "el sistema está apagado o
 * es una repetición", que no son un problema de nadie.
 */
export function decidirEnvio(
  c: ConsultaParaEnviar,
  ajustes: AjustesEnvio | null,
  normalizar: Normalizador,
): DecisionEnvio {
  if (!ajustes || !ajustes.consulta_respuesta_enabled) {
    // Fail-closed: si no se pudieron leer los ajustes, no se manda.
    return { enviar: false, motivo: 'la respuesta automática está apagada', visibleParaElEquipo: false }
  }
  if (c.whatsapp_enviado_at) {
    return { enviar: false, motivo: 'ya se le había mandado', visibleParaElEquipo: false }
  }

  const tel = normalizar(c.lead_phone)
  if (!tel) {
    return {
      enviar: false,
      motivo: 'la consulta no dejó un teléfono de WhatsApp válido',
      visibleParaElEquipo: true,
    }
  }
  if (!c.property_id) {
    // El freno más importante del sistema: sin saber por qué propiedad
    // pregunta, no hay nada honesto que mandarle. Mandarle el código del aviso
    // es peor que no escribirle.
    return {
      enviar: false,
      motivo: 'no sabemos por qué propiedad pregunta — el aviso no está vinculado',
      visibleParaElEquipo: true,
    }
  }

  const lista = (ajustes.consulta_test_phones ?? [])
    .map(p => normalizar(p))
    .filter((p): p is string => !!p)
  if (lista.length > 0 && !lista.includes(tel)) {
    return {
      enviar: false,
      motivo: 'modo prueba: solo se le escribe a los números de la lista',
      visibleParaElEquipo: true,
    }
  }

  return { enviar: true, telefono: tel }
}
