// Precarga para correr scripts con `tsx` cuando el módulo que importan trae
// `import 'server-only'` (p. ej. lib/visitas/datos.ts). `server-only` es un
// paquete de Next que existe solo para romper el build si un módulo de
// servidor se cuela al navegador — Next lo resuelve con su propio bundler, no
// está instalado en `node_modules`, y bajo `tsx` cualquier archivo que lo
// importe revienta con "Cannot find package 'server-only'".
//
// Mismo truco documentado en CLAUDE.md § "Correr `notify.ts` desde un script
// con `tsx`": redirige `server-only` a un módulo vacío interceptando
// `Module._resolveFilename` ANTES de que tsx registre sus propios hooks de
// resolución, así nunca llega a intentar buscarlo de verdad.
//
// Uso:
//   node --require ./scripts/precarga-server-only.cjs --env-file=.env.local --import tsx <script>.ts
//
// `require()` es obligatorio ACÁ, no una elección de estilo: `node --require`
// solo carga módulos CommonJS, así que este archivo tiene que serlo.
/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const Module = require('node:module')
const path = require('node:path')

const EMPTY_MODULE = path.join(__dirname, 'server-only-stub.cjs')
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return EMPTY_MODULE
  return originalResolveFilename.call(this, request, ...rest)
}
