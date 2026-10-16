import type { AjustesEncuesta } from './tipos'

/** Los ajustes de fábrica de la migración: todo apagado salvo "solo con regalo". */
export const AJUSTES_PRUEBA: AjustesEncuesta = {
  envio_automatico: false, solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: [],
}
