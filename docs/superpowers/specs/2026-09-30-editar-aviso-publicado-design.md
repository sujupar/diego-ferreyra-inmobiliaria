# Editar un aviso ya publicado en MercadoLibre y Argenprop (Parte 1) — diseño

**Fecha:** 2026-09-30
**Estado:** diseño aprobado por el dueño en el chat (tres partes + aviso de prueba); pendiente revisión de este documento
**Tamaño:** grande (integración externa, toca avisos reales en dos portales)

## 1. Problema y resultado

**Problema:** con un aviso publicado, la plataforma no deja cargar ni cambiar ningún dato (la pantalla del portal pasa a tener solo Pausar/Reactivar/Cerrar). El equipo corrige a mano en ML y Argenprop, los datos quedan distintos en cada lado, y el reenvío automático que dispara la ficha pisaría esas correcciones.

**Resultado:** desde la plataforma se edita un aviso publicado partiendo de lo que el portal tiene HOY, se manda solo lo que cambió, y ningún proceso automático pisa lo que no se tocó.

### Evidencia (investigación 2026-09-26)
- ML ofrece Expensas (`MAINTENANCE_FEE`), Apto crédito (`SUITABLE_FOR_MORTGAGE_LOAN`) y Apto profesional (`PROFESSIONAL_USE_ALLOWED`) en Departamentos>Venta (`MLA401686`); el wizard los muestra al publicar.
- Doblas 248 y Díaz Vélez 3841 salieron con 10 datos; el 24/9 se corrigieron a mano en los portales. Doblas en ML quedó sin expensas ni apto crédito (en Argenprop sí los tiene).
- `adapter.update(property, id)` (ML y AP) se llama desde `processUpdates` del worker SIN opciones: reenvía la ficha (título, fotos, descripción, antigüedad) y no lo cargado en el wizard ni lo corregido en el portal. Lo dispara el trigger `requeue_listings_on_update` (precio, título, descripción, fotos, amenities, expensas, video, recorrido).
- Los dos wizards escriben `title`/`description`/`photos` en `properties` (`ml-preview`/`ap-preview` PATCH) → publicar en un portal dispara el reenvío del otro.
- `normalizeUnit` (`lib/portals/mercadolibre/mapping.ts`) agrega unidad a `*_AREA` y `PROPERTY_AGE`, no a `MAINTENANCE_FEE`.
- Argenprop: `AvisoPublicacionDto.AptoCredito` existe pero nunca se llena; `APTO_PROFESIONAL` está en su catálogo (`/v1/catalogo/categorias/DEPARTAMENTO/caracteristicas`) y no en `field-schema.ts`.
- Ambos portales devuelven el aviso completo: ML `GET /items/{id}` + `GET /items/{id}/description`; Argenprop `GET /v1/avisos/{Codigo}` (Titulo, Descripcion, Caracteristicas, Multimedia, Localizacion, Contacto, AptoCredito, AceptaPermuta…).

## 2. Qué ve el usuario

**Dónde:** `/properties/[id]/marketing/mercadolibre` y `/properties/[id]/marketing/argenprop`, en el `ManageListingPanel` de cada portal (aviso con `external_id`).

1. Botón **"Editar datos del aviso"** arriba del panel. No aparece si el aviso está cerrado definitivamente (ML `closed`; Argenprop `eliminado`). Con aviso pausado/suspendido, sí.
2. Al tocarlo: "Trayendo el aviso de MercadoLibre…" (o Argenprop).
3. Pantalla de edición con dos bloques:
   - **Título y descripción** tal como están en el portal. Si la descripción de la ficha es distinta, botón **"Usar la descripción de la ficha"**.
   - **Datos del portal**: la misma lista del paso Campos del wizard (obligatorios + recomendados, control `AttrField`), cargada con los valores del portal. Lo que el portal no tiene queda vacío.
   - Un dato que el portal no tiene y la plataforma sí conoce (columnas de la ficha, `portal_data` de la visita) aparece completado con la etiqueta **"Se va a agregar"**.
4. Botón **"Guardar cambios (N)"**, N = cantidad de datos distintos de lo leído. Deshabilitado con N = 0.
5. Antes de enviar, resumen: "Vas a cambiar en MercadoLibre: Expensas: vacío → 600.000 ARS · Apto crédito: vacío → Sí". Confirmar / Volver (confirmación dentro de la página, no `confirm()`).
6. Éxito: "Listo, el aviso se actualizó" + enlace "Ver en MercadoLibre/Argenprop". Si cambiaron las expensas: "También quedaron en la ficha y se van a mandar a <otro portal> en unos minutos".
7. Error del portal: motivo en castellano (`mensajeYDetalle` / `explicarErrorArgenprop`), lo escrito no se pierde, se puede reintentar. La ficha no se toca.
8. Si el último envío automático falló (ver §4), el panel lo muestra con el motivo y un botón **"Reintentar"**.
9. **Roles:** los mismos que hoy pueden publicar (`puedeDifundir(..., 'difundir')`). Abogado: 403 y sin botón.

**Nuevo en el wizard de Argenprop (al publicar y al editar):** campos "Apto crédito" (→ `AptoCredito` del aviso) y "Apto profesional" (→ característica `APTO_PROFESIONAL`, solo en las categorías cuyo catálogo la tiene: DEPARTAMENTO y DEPARTAMENTO_TIPO_CASA).

**Nuevo en ML (al publicar y al editar):** las expensas sin moneda se completan con " ARS" (default_unit de ML).

## 3. Qué pasa por detrás

### 3.1 Regla general: leer → aplicar → enviar completo
Cada envío a un portal (edición manual o automática) sigue este orden:
1. Leer el aviso vivo del portal.
2. Aplicar SOLO los cambios pedidos.
3. Enviar el aviso con todo lo escribible (no solo lo cambiado), para que el resultado no dependa de si el portal fusiona o reemplaza.

- **ML:** `PUT /items/{id}` con `title` (si cambió) y `attributes` = todos los atributos del ítem vivo que la categoría deja escribir (se excluyen `read_only`, `fixed` y los calculados `HAS_LOWER_PRICE`, `BASE_PRICE`, `PRICE_TO_PAY`, `HAS_DISCOUNT`), con los cambios aplicados y `normalizeUnit`. Descripción por `PUT /items/{id}/description` solo si cambió. Precio/fotos solo en el envío automático (§4).
- **Argenprop:** `PUT /v1/avisos` con el aviso vivo convertido al formato de envío (`SubTipo`→`Subtipo`, `Localizacion` solo con Ids, `Multimedia` tal cual, `Contacto`, `AptoCredito`, `AceptaPermuta`) y los cambios aplicados. Los valores que el GET devuelve con otra forma (`Muy_Bueno`, `Frente`) se normalizan al Id del catálogo (`MUY_BUENO`, `FRENTE`) por comparación sin mayúsculas.

### 3.2 Edición manual
- `GET /api/properties/[id]/ml-aviso` y `/ap-aviso`: lee el aviso vivo + schema de la categoría; devuelve `{ titulo, descripcion, valores, sugeridos, schema, estado, descripcionFicha }`. `valores` = lo que tiene el portal; `sugeridos` = lo que la plataforma sabe y el portal no.
- `POST` a la misma ruta con `{ cambios: { titulo?, descripcion?, valores: Record<id, valor|null> } }` (solo lo cambiado respecto de lo leído). El servidor vuelve a leer el aviso vivo, aplica `cambios` (§3.1), envía, registra `property_publish_events` (`event_type:'updated'`, payload con los ids cambiados, actor = usuario).
- Si entre `cambios` está la expensa (`MAINTENANCE_FEE` / `EXPENSAS`), DESPUÉS del éxito en el portal se escribe `properties.expensas` (número). Eso dispara el envío automático de expensas al otro portal (§4). Título y descripción editados acá NO se escriben en la ficha.
- Validación Zod en el servidor: ids que existan en el schema de la categoría, título ≤ máximo del portal, descripción ≤ 5000.

### 3.3 Módulos puros (en `lib/portals/`, con tests)
- `mercadolibre/edicion.ts`: `valoresDesdeItem(item, schema)`, `armarActualizacionMl(itemVivo, cambios, schema)`.
- `argenprop/edicion.ts`: `valoresDesdeAviso(aviso, schema)`, `armarAvisoActualizado(avisoVivo, cambios)`.
- `edicion-comun.ts`: `diferencias(inicial, actual)` (lo cambiado, para el contador y el resumen), `sugeridosPara(valoresPortal, conocidos)`.

## 4. Envío automático cuando cambia la ficha

- **Trigger** `requeue_listings_on_update` (migración nueva, `CREATE OR REPLACE`): solo reacciona a `asking_price`, `photos` y `expensas`. Además de `needs_update=true` acumula en `metadata.cambios_ficha` (array sin repetidos) cuáles cambiaron: `precio`, `fotos`, `expensas`. Título, descripción, amenities, video y recorrido dejan de disparar. La parte de `needs_unpublish` queda igual.
- **Worker** `processUpdates`: por cada listing, lee el aviso vivo, aplica SOLO `cambios_ficha` con los valores de la ficha (ML: `price`, `pictures`, `MAINTENANCE_FEE`; Argenprop: `Precio.Monto`, `Multimedia` FOTO, `EXPENSAS`) y envía (§3.1). Si no hay diferencia con lo vivo, no envía y limpia la marca.
- Un listing marcado `needs_update` sin `cambios_ficha` (marcas viejas) se limpia sin enviar: no hay forma de saber qué cambió y reenviar todo es justo lo que se evita.
- **Fallos:** `metadata.intentos_actualizacion` +1 y `last_error` con el motivo. A los 3 intentos deja de reintentar (`needs_update` false, marca `actualizacion_fallida` con motivo) y el panel lo muestra con "Reintentar" (vuelve a marcar `needs_update` con los mismos `cambios_ficha`, intentos en 0).
- Zonaprop queda como está (su adapter no está habilitado; sus marcas pendientes no se tocan).

## 5. Qué queda afuera (Parte 2 u otra)
- Diccionario común: cargar un dato una vez para los dos portales; comodidades de la ficha (`properties.amenities`) → portales; el resto del catálogo de Argenprop (≈150 datos).
- Apto crédito/profesional en casas de ML (ML los marca `hidden`; hay que probar si los acepta).
- Actualizar la ficha con lo que dice el portal (salvo expensas).
- Editar fotos, video o precio desde "Editar datos del aviso".
- Zonaprop.

## 6. Criterios de aceptación
1. En la pantalla de ML de una propiedad publicada aparece "Editar datos del aviso"; en una cerrada, no.
2. Al abrirla, título, descripción y cada dato coinciden con lo que muestra `GET /items/{id}` en ese momento.
3. Un dato que el portal no tiene y la ficha sí aparece con "Se va a agregar".
4. El contador de "Guardar cambios" cuenta exactamente los datos cambiados; con 0 está deshabilitado.
5. Al guardar un cambio de expensas en ML, en ML queda `MAINTENANCE_FEE = "<n> ARS"` y todos los demás atributos del ítem quedan iguales que antes (comparación del ítem antes/después).
6. Idem 5 en Argenprop con `EXPENSAS`: `AptoCredito`, las demás características, fotos y localización quedan iguales.
7. Tras guardar expensas en un portal, `properties.expensas` tiene el valor y, en ≤ 5 min, el otro portal también (y nada más cambió en él).
8. Cambiar el precio en la ficha llega a los dos portales y no cambia título, descripción ni datos de ninguno.
9. Publicar en Argenprop después de ML (o editar título/descripción en la ficha) NO modifica el aviso de ML.
10. Un rechazo del portal muestra el motivo en castellano y no toca la ficha.
11. Un envío automático que falla 3 veces queda visible en el panel con el motivo; "Reintentar" lo vuelve a intentar.
12. En el wizard de Argenprop aparecen "Apto crédito" y "Apto profesional" (en depto y PH) y llegan al aviso.
13. Expensas escritas sin moneda en ML se publican como "<n> ARS".
14. Un usuario abogado recibe 403 en las rutas nuevas y no ve el botón.
15. Queda un `property_publish_events` por cada edición con quién y qué ids cambiaron.

## 7. Pruebas y QA
- TDD de los módulos de §3.3 y de la lógica del worker (casos: vacío, dato nuevo, dato cambiado, dato vaciado, atributos de solo lectura, valores con tildes en NFD, aviso sin descripción, cambios concurrentes).
- **Primera tarea del plan (sonda):** con un aviso `[TEST]` en ML confirmar (a) que el PUT con la lista completa no pierde nada y (b) qué pasa al vaciar un atributo. Si ML no permite vaciar, en la pantalla de ML un dato que el portal ya tiene se puede cambiar pero no dejar vacío.
- **QA real aprobado por el dueño:** publicar un aviso `[TEST]` en ML y en Argenprop desde la vista previa, editarlo, comparar antes/después en cada portal, y cerrarlo/eliminarlo al terminar (ocupa un cupo de ML mientras dura).
- Verificación final en producción: completar expensas y apto crédito de Doblas 248 (valor de expensas a confirmar con el dueño: hoy $600.000 en Argenprop, igual que Díaz Vélez).
- Reporte final: tabla criterio → cómo se probó → resultado.

## 8. Riesgos / pre-flight
- **Migración antes del deploy:** el trigger nuevo y el worker nuevo van juntos; el worker debe tolerar marcas viejas sin `cambios_ficha` (§4).
- **Límite de tiempo de Netlify:** cada request hace ≤ 3 llamadas a un portal (leer ítem, leer descripción, enviar), sin IA.
- **Productor/consumidor:** `metadata.needs_update` lo escriben el trigger y "Reintentar"; lo leen `processUpdates` y el panel. Grep de `needs_update` y `adapter.update(` antes de cambiar.
- **Portales reales:** solo el aviso `[TEST]` del QA; nunca editar avisos reales en pruebas antes del deploy.
- **Seguridad:** rutas con `requireAuth` + `puedeDifundir`; valores validados contra el schema; la descripción del portal se muestra como texto, nunca como HTML.
