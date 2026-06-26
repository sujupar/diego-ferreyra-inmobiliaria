import 'server-only'

/**
 * Wrapper server-only del cliente Gmail. Toda la lógica vive en ./core (sin
 * 'server-only') para poder reutilizarla desde scripts de diagnóstico (tsx).
 * La app SIEMPRE importa desde acá para conservar el guard de bundling.
 */
export * from './core'
