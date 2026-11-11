# Task 4 — Argenprop operación/precio y republicación por cambio de tipo
Hecho: cambio-categoria.ts (armarAvisoConOperacionYPrecio, armarAvisoRepublicado, republicarAviso con red inyectable) + 10 tests; adapter: caracteristicasDeCategoria (cache Map por tipo), republicar(codigo, dto).
Nota: el `republicar(externalId)` previo (reactivar suspendido) chocaba de nombre; se renombró a `reactivar` y se actualizó app/api/properties/[id]/ap-publish/route.ts.
CASA omite Subtipo. Result del POST = IdAviso (igual que publish()). Tests 330/330, tsc limpio.
