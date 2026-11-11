# Cambios de la ficha que tocan avisos publicados (tipo, operación, precio) — diseño

**Fecha:** 2026-11-11 · **Tamaño:** grande (escribe en avisos reales de dos portales) · **Pedido del dueño:** implementar directo ("que cuando entre ya esté funcionando"), con revisores y agentes de prueba.

## 1. Problema y resultado

**Caso real (Olmos 585, captada 2026-11-11):** se publicó primero en Argenprop como *departamento* (10:53), después se corrigió la ficha a *casa* y con eso se publicó MercadoLibre (10:58, bien como casa, `MLA401685`). El aviso de Argenprop quedó como DEPARTAMENTO y la plataforma no tiene cómo corregirlo: hoy habría que hacerlo a mano en el portal.

**Resultado:** cuando en la ficha cambian el **tipo**, la **operación**, el **precio** o la **moneda** de una propiedad con avisos publicados, la plataforma pregunta **en qué portales** aplicarlo, explica qué va a pasar en cada uno, lo ejecuta al confirmar y muestra el resultado. Si un aviso ya no coincide con la ficha (como Olmos hoy), la ficha lo avisa y ofrece corregirlo.

## 2. Qué pasa en cada portal

| Cambio | MercadoLibre | Argenprop |
|---|---|---|
| Precio / moneda | Se **actualiza** el aviso (leer vivo → cambiar `price`/`currency_id` → enviar). | Se **actualiza** el aviso (`Precio.Monto/Moneda`). |
| Tipo / operación | ML **no permite** cambiar la categoría de un aviso. Se **publica uno nuevo** en la categoría correcta y, solo si salió bien, se **cierra el anterior**. | Se intenta **actualizar** el aviso cambiando `Categoria` (mismo `Codigo`). Si Argenprop no lo acepta (lo decide la sonda, §6), se elimina y se publica de nuevo. |

**Republicar en ML (orden obligatorio):** 1) armar el aviso nuevo con la ficha + lo que se cargó en el asistente (`metadata.ml_attributes`, filtrado a los datos que acepta la categoría nueva; `listing_type` y `media_choice` del borrador); 2) publicarlo; 3) **recién si se publicó**, cerrar el viejo; 4) actualizar `property_listings` (nuevo `external_id`/`external_url`, `metadata.reemplaza_a` con el id viejo), `portal_property_map` (para que las consultas sigan ruteando) y auditar (`published` el nuevo, `unpublished` el viejo con el motivo). Si el paso 2 falla (por ejemplo, la categoría nueva exige un dato que no está), el aviso viejo **sigue intacto** y se muestra qué falta, con enlace al asistente de ML.

## 3. Qué ve el usuario

**A. Al guardar un cambio en "Modificar ficha"** (tipo, operación, precio o moneda; el precio después de su confirmación propia de `price-guard`): si la propiedad tiene avisos publicados o pausados y alguno ya no coincide, se abre **"¿Actualizamos los avisos?"**:
- Una fila por portal publicado, con casilla **marcada por defecto**, lo que cambia ("Tipo: Departamento → Casa", "Precio: USD 79.000 → USD 75.000") y qué va a pasar en palabras simples. Para republicar en ML: *"MercadoLibre no deja cambiar el tipo de un aviso: vamos a publicar uno nuevo como Casa y, cuando esté publicado, cerrar el actual. El aviso nuevo empieza sin visitas ni preguntas."*
- Botones **"Actualizar avisos"** y **"Ahora no"**.
- Al confirmar: progreso por portal → ✅ "Listo" con enlace al aviso, o ❌ con el motivo en castellano (y, si falta un dato en ML, enlace "Completar en el asistente de MercadoLibre").

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

## 6. Sondas antes de construir (sobre una propiedad `[TEST]` publicada en los dos portales)
1. Argenprop: `PUT /v1/avisos` con `Categoria` DEPARTAMENTO → CASA sobre el mismo `Codigo`. ¿Lo acepta y queda como CASA? Si no: ¿eliminar + `POST` con el mismo `Codigo` funciona o da ENT002?
2. ML: con el aviso viejo activo, ¿se puede publicar el nuevo con el mismo título/fotos (o ML lo marca como duplicado)? ¿Consume otro cupo y cerrar el viejo lo devuelve?
3. ML: `PUT` de `price` y de `currency_id` sobre el aviso vivo.

## 7. Criterios de aceptación
1. Cambiar el tipo en la ficha de una propiedad publicada en los dos portales abre el cuadro con los dos portales marcados y el texto de qué pasa en cada uno.
2. Confirmar → en ML queda un aviso nuevo en la categoría correcta y el viejo cerrado; `property_listings` apunta al nuevo; las consultas del aviso nuevo rutean a la propiedad (`portal_property_map`).
3. Confirmar → en Argenprop el aviso queda con la categoría correcta (según la sonda), sin perder fotos, características ni apto crédito.
4. Si la publicación nueva de ML falla, el aviso viejo sigue activo y la pantalla dice qué falta.
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
