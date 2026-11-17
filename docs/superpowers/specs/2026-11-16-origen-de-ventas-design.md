# Origen de cada venta: los cuatro canales de la planilla, en la plataforma

**Fecha:** 2026-11-16 · **Tamaño:** grande (toca dinero: el 20 % de Julián se sugiere según el origen)
**Pedido del dueño (Julián, 2026-11-16):** "cogé cada una de esas propiedades que tenemos cargadas
y asociá internamente que son de referido, que son de embudo, que son de referido embudo o lo que
fuere. Lo mismo con lo de los abogados." Dudas resueltas por él el mismo día en el documento
"Plan de Negocios 2027 · Investigación y preguntas".

## Problema y resultado

**Problema:** la plataforma no distingue los cuatro canales con los que Diego mide el negocio
(referido directo, referido de embudo, abogado y embudo directo), no registra si el comprador llegó
por un anuncio nuestro, le faltan 5 de las 22 ventas de 2026 y ninguna venta está enganchada a la
ficha de su propiedad. Sin eso, el panel no puede medir solo la meta 2027 ni el 20 % de Julián.

**Resultado:** cada venta tiene su canal y la marca "el comprador llegó por un anuncio nuestro"; el
panel muestra las 22 ventas de 2026 por canal igual que la planilla; y al cargar una venta nueva la
plataforma sugiere el reparto con la regla del 16/11.

## Qué ve el usuario

1. **Ficha → "Datos de la operación"** (formulario `FormVenta`), desplegable "¿Cómo llegó el dueño?":
   suma dos opciones, **"Referido de un cliente del embudo"** y **"Abogado o colega"**. Las seis de hoy
   siguen igual.
2. Debajo, una casilla nueva: **"El comprador llegó por un anuncio nuestro"**.
3. Los % sugeridos cambian así (se pueden editar a mano, como hoy):
   - Julián 20 % si el dueño llegó por embudo, clase o referido de un cliente del embudo, **o** si
     el comprador llegó por un anuncio nuestro. Referido directo, abogado, portal, redes y otro: 0 %.
   - Referidor 20 % sugerido al elegir "Abogado o colega" (hoy se sugiere solo si se escribe un nombre).
4. **Panel → "Plata del negocio"**: la tabla de ventas y el reparto por origen muestran las etiquetas
   nuevas. No cambia nada más de la pantalla.
5. Roles: los mismos que hoy ven y editan ventas (operaciones: admin, dueño, coordinador). El asesor
   y la abogada no ven el panel, como hoy.

## Qué pasa por detrás

- **Migración** `supabase/migrations/2026111600000X_ventas_origen_canales.sql` (mirar el directorio
  antes de numerar): recrea el CHECK `ventas.origen_dueno` con `referido_embudo` y `abogado`, y agrega
  `comprador_por_anuncio boolean NOT NULL DEFAULT false`. Aditiva: no borra ni cambia datos.
  Se aplica con un script `pg` y se verifica con `select` antes del código.
- **`lib/metrics/panel/reparto.ts`**: `OrigenDueno` suma los dos valores; `validarVenta` acepta los
  ocho; `partesSugeridas` recibe `compradorPorAnuncio` y aplica la regla de arriba; `CAMPOS_VENTA`
  suma el campo nuevo.
- **Consumidores del enum** (todos se tocan en el mismo PR): `FormVenta.tsx` (`ORIGENES` + casilla),
  `PlataNegocio.tsx` (etiquetas), `venta-propiedad.ts` (`origenDesdePropiedad` y el insert),
  `datos-iniciales.ts`, las rutas `app/api/metrics/ventas/**` (pasan por `limpiarVenta`) y sus tests.
- **Carga de datos** con `scripts/metricas/asociar-origen-ventas.ts`, en modo prueba por defecto
  (muestra cada cambio) y `--grabar` para escribir. Idempotente: correrlo dos veces no duplica nada.
  - Corrige las 17 ventas cargadas con el canal y el honorario de la planilla "Metricas Consolidadas
    2026" (la planilla manda donde no coincide con lo cargado en septiembre: Lares, Maure, Piedras,
    precio de Moreno; Matorras queda como referido).
  - Agrega las 5 que faltan: Falcón (oct), Doblas (nov), Liniers (nov), Entre Ríos (dic) y Quesada
    USD 350.000 (dic). Las de noviembre y diciembre quedan "reservada" hasta la escritura.
  - Engancha 8 ventas a su ficha: Lares de Canning → `a4f1d221`, Quesada USD 600.000 (junio) →
    `Quesada 3500` `80449461`, Díaz Vélez → `Av. Diaz Vélez 3841` `85acb939` (la única ficha creada
    antes de la venta), Agüero → `Agüero 950, Balvanera` `295afaf1`, Falcón → `Falcón 2500, Flores`
    `dd869f0f`, Doblas → `Doblas 248` `1ca4a4a3`, Liniers → `Liniers 1631` `9c868944`, Entre Ríos →
    `Entre Ríos 2333, Martínez` `1e116561`.
  - **No toca los % ni los montos ya pagados** a Lucas, Julián o la abogada en ventas cobradas: eso
    es historia. En las 3 ventas "referido de embudo" el 20 % de Julián queda marcado "a confirmar".
- **Fichas vendidas que siguen "disponibles"** (Lares, Quesada 3500, Agüero 950, Falcón 2500): se
  marcan desde la propia ficha durante el QA, con el flujo normal, así quedan el evento y la venta
  coherentes. No se cambian por SQL.

## Qué queda afuera

- Contar la meta por **escritura** en el panel y que "al escriturar se actualice todo" (spec aparte).
- El freno para no crear dos fichas de la misma propiedad (caso Díaz Vélez: spec aparte).
- `properties.origin`: hoy guarda "tasacion" para las fichas creadas desde una tasación; no es el
  origen del dueño y no se toca.
- Si las ventas de **redes** pagan el 20 % de Julián: no está acordado; hoy sugiere 0 % y se edita a mano.

## Criterios de aceptación

1. En "Datos de la operación" aparecen "Referido de un cliente del embudo" y "Abogado o colega"; al
   elegir "Abogado o colega" el referidor queda sugerido en 20 %.
2. Con dueño "Referido" y la casilla "El comprador llegó por un anuncio nuestro" marcada, Julián
   queda sugerido en 20 %; sin la casilla, en 0 %.
3. Con dueño embudo, clase o referido de embudo, Julián queda sugerido en 20 %.
4. La base rechaza un origen fuera de la lista (error del CHECK) y acepta los dos nuevos.
5. En el panel, el año 2026 muestra 22 ventas y USD 192.893: referido directo 11 (74.841), referido
   de embudo 3 (68.132), abogado 3 (15.800) y embudo 5 (34.120), igual que la planilla.
6. Desde la ficha de cada una de las 8 propiedades se ve su venta en "Datos de la operación".
7. Lares, Quesada 3500, Agüero 950 y Falcón 2500 dejan de figurar como disponibles.
8. El script en modo prueba lista los 22 cambios sin escribir; con `--grabar` escribe; una segunda
   corrida con `--grabar` no cambia nada.

## Riesgos (pre-flight)

- **Productor/consumidor de un enum:** el CHECK y `OrigenDueno` se cambian juntos; la migración va
  antes del deploy (sin ella, guardar una venta con un origen nuevo da 23514).
- **Dinero:** cambia solo la SUGERENCIA del reparto; los % guardados no se recalculan solos.
- **Datos reales:** nada se borra; el script compara antes de escribir y deja el detalle en pantalla.
- **Venta automática al cambiar el estado:** `sincronizarVenta` busca la venta abierta por
  `property_id`; por eso primero se enganchan las ventas y después se marcan las fichas, así no se
  crea una segunda venta (además hay un índice único por propiedad).
- **RLS:** sin tablas nuevas; `ventas` sigue con la política de operaciones.
