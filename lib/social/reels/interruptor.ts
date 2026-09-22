/**
 * El interruptor general de la automatización de Instagram, visto desde la
 * pantalla.
 *
 * Es la llave que está POR ENCIMA de todos los reels: apagada, ningún reel
 * responde, esté en el modo que esté. Hasta el 2026-09-22 solo se podía tocar
 * por script; el dueño pidió tenerlo en la pantalla, y que lo manejen solo el
 * admin y el dueño.
 *
 * Módulo PURO.
 */

export function puedeCambiarInterruptorGeneral(rol: string | null | undefined): boolean {
  return rol === 'admin' || rol === 'dueno'
}

export interface ReelsActivos {
  prueba: number
  en_vivo: number
}

function reels(n: number): string {
  return n === 1 ? '1 reel' : `${n} reels`
}

/**
 * Lo que se le dice a la persona ANTES de prender: cuántos reels, de todas las
 * propiedades, empiezan a responder. En vivo va primero porque es lo que le
 * habla a clientes reales.
 */
export function avisoAlPrender(activos: ReelsActivos): string {
  if (activos.prueba === 0 && activos.en_vivo === 0) {
    return 'Hoy no hay ningún reel en Modo prueba ni En vivo: no va a responder nada hasta que actives uno.'
  }
  const partes: string[] = []
  if (activos.en_vivo > 0) {
    partes.push(`${reels(activos.en_vivo)} En vivo ${activos.en_vivo === 1 ? 'va' : 'van'} a empezar a responderle a clientes reales`)
  }
  if (activos.prueba > 0) {
    partes.push(`${reels(activos.prueba)} en Modo prueba ${activos.prueba === 1 ? 'va' : 'van'} a responderle solo a las cuentas de prueba`)
  }
  return `Afecta a todas las propiedades: ${partes.join(', y ')}.`
}
