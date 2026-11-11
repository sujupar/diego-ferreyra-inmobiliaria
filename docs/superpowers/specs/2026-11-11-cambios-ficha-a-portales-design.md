# Cambios de la ficha que tocan avisos publicados (tipo, operación, precio) — diseño

**Fecha:** 2026-11-11 · **Tamaño:** grande (escribe en avisos reales de dos portales) · **Pedido del dueño:** implementar directo ("que cuando entre ya esté funcionando"), con revisores y agentes de prueba.

## 1. Problema y resultado

**Caso real (Olmos 585, captada 2026-11-11):** se publicó primero en Argenprop como *departamento* (10:53), después se corrigió la ficha a *casa* y con eso se publicó MercadoLibre (10:58, bien como casa, `MLA401685`). El aviso de Argenprop quedó como DEPARTAMENTO y la plataforma no tiene cómo corregirlo: hoy habría que hacerlo a mano en el portal.

**Resultado:** cuando en la ficha cambian el **tipo**, la **operación**, el **precio** o la **moneda** de una propiedad con avisos publicados, la plataforma pregunta **en qué portales** aplicarlo, explica qué va a pasar en cada uno, lo ejecuta al confirmar y muestra el resultado. Si un aviso ya no coincide con la ficha (como Olmos hoy), la ficha lo avisa y ofrece corregirlo.

## 2. Qué pasa en cada portal (medido con las sondas del 2026-11-11, §6)

| Cambio | MercadoLibre | Argenprop |
|---|---|---|
| Precio / moneda | Se **actualiza** el aviso. Precio y moneda viajan **siempre juntos** (solo `currency_id` da `item.price.invalid`). | Se **actualiza** el aviso (`Precio.Monto/Moneda`). |
| Operación | Se **actualiza en el mismo aviso**: `PUT` con `category_id` nuevo + atributos fijos de la categoría nueva (`PROPERTY_TYPE`, `OPERATION`, `OPERATION_SUBTYPE`) + precio/moneda. Mismo id, no pierde visitas. | `PUT` en el mismo aviso (`Precio.Operacion`). Argenprop rechaza alquiler con `AptoCredito=true` (PUB003): al pasar a alquiler se manda `AptoCredito=false`. |
| Tipo | Igual que operación: **mismo aviso**, `PUT` con `category_id` + atributos fijos. Si ML lo rechaza (p. ej. la categoría nueva exige datos que no están), se muestra el motivo y un **plan B con confirmación aparte**: publicar uno nuevo en la categoría correcta y, recién si se publicó, cerrar el actual (empieza sin visitas ni preguntas). | Argenprop **no permite** cambiar el tipo (`PUB001`). Se **elimina y se publica de nuevo con el mismo `Codigo`** (verificado: `201`, sin ENT002). Cambia el `IdAviso` → se actualizan `external_url` y `metadata.aviso_id`. Se republica desde el aviso vivo: características filtradas al catálogo de la categoría nueva (`GET /v1/catalogo/categorias/{CAT}/caracteristicas`), fotos **de la ficha**, `AptoCredito` conservado. |

**Atributos fijos de la categoría nueva en ML:** se toman de los atributos de la categoría (`tags.fixed`, su único `values[0]`); un fijo que la categoría nueva no tiene (p. ej. `OPERATION_SUBTYPE` al pasar a alquiler) no se manda. Los atributos vivos que la categoría nueva no acepta se descartan del envío.

**Riesgo de Argenprop:** entre eliminar y publicar hay un instante sin aviso. Si la publicación falla, se reintenta una vez; si sigue fallando, el listing queda `failed` con el motivo y la pantalla dice claramente *"El aviso de Argenprop se eliminó pero no se pudo volver a publicar: publicalo desde el asistente de Argenprop"*. El cuadro advierte antes de confirmar que el aviso de Argenprop cambia de número.

## 3. Qué ve el usuario

**A. Al guardar un cambio en "Modificar ficha"** (tipo, operación, precio o moneda; el precio después de su confirmación propia de `price-guard`): si la propiedad tiene avisos publicados o pausados y alguno ya no coincide, se abre **"¿Actualizamos los avisos?"**:
- Una fila por portal publicado, con casilla **marcada por defecto**, lo que cambia ("Tipo: Departamento → Casa", "Precio: USD 79.000 → USD 75.000") y qué va a pasar en palabras simples. Para Argenprop con cambio de tipo: *"Argenprop no deja cambiar el tipo de un aviso: lo vamos a eliminar y volver a publicar como Casa con las mismas fotos y datos. El aviso cambia de número (el link viejo deja de andar)."*
- Botones **"Actualizar avisos"** y **"Ahora no"**.
- Al confirmar: progreso por portal → ✅ "Listo" con enlace al aviso, o ❌ con el motivo en castellano (y, si ML rechaza el cambio de tipo, el botón del plan B "Publicar uno nuevo y cerrar el actual" con su propia confirmación).

**B. Aviso en la ficha cuando algo no coincide** (Olmos hoy, o si se eligió "Ahora no"): en la ficha de la propiedad, una franja *"El aviso de Argenprop figura como Departamento y la ficha dice Casa"* con botón **"Revisar"** que abre el mismo cuadro.

**Roles:** quienes hoy pueden publicar (`puedeDifundir(..., 'difundir')`). Abogado: no ve nada y las rutas devuelven 403.

## 4. Qué pasa por detrás

- **Módulo puro `lib/portals/diferencias-con-ficha.ts`:** dado lo que dice la ficha (tipo, operación, precio, moneda) y lo que tiene cada aviso vivo, devuelve las diferencias por portal y la acción (`actualizar` | `republicar`). ML: categoría `resolveCategory(ficha)` vs `item.category_id`; precio/moneda vs `price`/`currency_id`. Argenprop: `apCategoria(ficha)` + operación vs `Categoria`/`Precio.Operacion`; precio/moneda vs `Precio`.
- **`GET /api/properties/[id]/portales/diferencias`:** para cada listing publicado o pausado con `external_id`, lee el aviso vivo (una lectura por portal) y devuelve las diferencias. Un portal que no responde vuelve con su error, sin bloquear al otro.
- **`POST /api/properties/[id]/portales/sincronizar` `{ portal }`:** ejecuta para UN portal (el cliente llama una vez por portal marcado: cada request queda corto). Recalcula las diferencias contra el aviso vivo en ese momento y aplica todas las de ese portal.
- **Envío automático:** el **precio deja de viajar solo** (migración que saca `precio` del trigger `requeue_listings_on_update`); fotos y expensas siguen solas. Así un cambio de precio se aplica solo si la persona lo confirma, como se pidió.
- **Reutiliza** lo del PR #34: `leerAviso`, `armarActualizacionMl` (ya acepta `precio`), `armarAvisoActualizado` (ya acepta `precio`), errores en castellano (`mensajeYDetalle`).

## 5. Qué queda afuera
- Ubicación/dirección y otros datos de la ficha (no piden borrar y republicar).
- Zonaprop.
- Campañas de Meta y landing (tienen sus propios flujos).

## 6. Sondas (hechas 2026-11-11 sobre `[TEST]`, todo dado de baja; reporte en `.superpowers/sondas-report.md`)
1. Argenprop: cambiar `Categoria` por `PUT` → **rechazado** (`PUB001`). Eliminar + `POST` con el mismo `Codigo` → **OK**, IdAviso nuevo; características y AptoCredito conservados. Operación por `PUT` → OK salvo `AptoCredito=true` hacia alquiler (`PUB003`). En CASA, `DISPOSICION` y `APTO_PROFESIONAL` se descartan en silencio.
2. ML: `PUT` con `category_id` + `PROPERTY_TYPE`/`OPERATION` (+ precio/moneda) → **OK, mismo id** (casa↔depto, venta→alquiler y vuelta). Publicar uno nuevo con el viejo activo también funciona (sin marca de duplicado; ocupa un cupo al activarse, el del viejo vuelve ~60 s después de cerrarlo) → queda como plan B.
3. ML: `PUT {price}` y `PUT {currency_id, price}` → OK; solo `currency_id` → `item.price.invalid`.

## 7. Criterios de aceptación
1. Cambiar el tipo en la ficha de una propiedad publicada en los dos portales abre el cuadro con los dos portales marcados y el texto de qué pasa en cada uno.
2. Confirmar → en ML el MISMO aviso queda en la categoría correcta, con el tipo correcto y sin perder datos; si ML lo rechaza, el plan B publica uno nuevo, cierra el viejo, `property_listings` y `portal_property_map` apuntan al nuevo.
3. Confirmar → en Argenprop el aviso se elimina y se republica con la categoría correcta, mismas fotos, características compatibles y apto crédito; `property_listings` y `portal_property_map` quedan con el `IdAviso`/link nuevos.
4. Si ML rechaza el cambio de tipo, el aviso sigue igual y se ofrece el plan B; si el plan B falla al publicar, el viejo sigue activo. Si Argenprop no se puede republicar, queda `failed` con un mensaje claro.
5. Cambiar el precio abre el cuadro; confirmar actualiza el precio en los dos avisos y nada más; "Ahora no" deja los avisos como estaban (el precio ya no viaja solo).
6. Desmarcar un portal → ese portal no se toca.
7. Una propiedad cuyo aviso no coincide con la ficha muestra la franja en la ficha y "Revisar" abre el cuadro (caso Olmos).
8. Sin avisos publicados, cambiar estos datos no abre nada.
9. Abogado: 403 en las rutas nuevas y no ve la franja.
10. Queda auditoría de cada acción (quién, qué, en qué portal).

## 8. Riesgos
- **Escribe en avisos públicos:** pruebas solo sobre `[TEST]`; el caso Olmos se corrige con la pantalla nueva recién con el OK del dueño.
- **Orden de despliegue:** código primero, migración del trigger enseguida (si fuera al revés, mientras tanto el precio no viajaría ni solo ni por el cuadro: sin daño).
- **Límite de tiempo de Netlify:** una llamada por portal; republicar en ML son ~4 llamadas a ML.
