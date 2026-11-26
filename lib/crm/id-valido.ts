// ¿Es un uuid? Puro. Las rutas lo usan antes de consultar la base (revisión 12.1): un id que
// no es uuid hacía que Postgres respondiera `22P02 invalid input syntax for type uuid`, y la
// ruta lo devolvía como 500. Un id que no puede existir es "no encontrado" (404), igual que
// uno que no existe: así tampoco se distingue un id mal escrito de uno ajeno.
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuid(valor: string): boolean {
  return RE_UUID.test(valor)
}
