import 'server-only'

/**
 * Wrapper server-only del cliente WhatsApp. La lógica vive en ./core (sin
 * 'server-only') para poder reutilizarla desde scripts de prueba (tsx).
 * La app SIEMPRE importa desde acá para conservar el guard de bundling.
 */
export * from './core'
