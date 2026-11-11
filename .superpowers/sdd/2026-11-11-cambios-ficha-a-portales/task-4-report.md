# Task 4 — Argenprop operación/precio y republicación por cambio de tipo
Hecho: cambio-categoria.ts (armarAvisoConOperacionYPrecio, armarAvisoRepublicado, republicarAviso con red inyectable) + 10 tests; adapter: caracteristicasDeCategoria (cache Map por tipo), republicar(codigo, dto).
Nota: el `republicar(externalId)` previo (reactivar suspendido) chocaba de nombre; se renombró a `reactivar` y se actualizó app/api/properties/[id]/ap-publish/route.ts.
CASA omite Subtipo. Result del POST = IdAviso (igual que publish()). Tests 330/330, tsc limpio.

## Fix round 1
I1 CASA→Subtipo 'CASA' por defecto (explícito: aId mayúsculas). I2 fotos tope 30; ficha vacía conserva FOTO vivas. I3 armarAvisoRepublicado acepta {operacion,monto,moneda} (+AptoCredito=false si no VENTA). Menores: caracteristicasDeCategoria lanza y no cachea si vacío; normalizarOperacion (venta/alquiler/temporario); republicarAviso trata ENT002 en reintento como éxito vía leerIdExistente (adapter: leerAviso); test de wiring con fetch global stubbeado (adapter-republicar.test.ts). `aId` ahora exportada.
