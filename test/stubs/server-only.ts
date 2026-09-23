// Reemplazo vacío de `server-only` para las pruebas.
//
// `server-only` es un paquete de Next que existe para ROMPER el build si un
// módulo de servidor se importa desde el navegador; en la app lo resuelve el
// bundler de Next y por eso no está en `node_modules`. Bajo Vitest, cualquier
// archivo que lo importe (`lib/ai/reset-prueba.ts`, `lib/email/resend-client.ts`,
// `lib/leads/responder-consulta.ts`, el webhook de WhatsApp) fallaba entero con
// "Cannot find package 'server-only'" — cuatro archivos de prueba en rojo
// permanente, que es justo lo que hace que nadie mire la suite.
//
// Se mapea desde `resolve.alias` de las configs de Vitest.
export {}
