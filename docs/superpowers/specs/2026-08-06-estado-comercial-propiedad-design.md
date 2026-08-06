# Estado comercial de la propiedad — diseño

**Fecha:** 2026-08-06
**Estado:** diseño aprobado por el usuario (pendiente de plan de implementación)
**Alcance:** una sección clara en la ficha de propiedad para cambiar su estado comercial (disponible / reservada / vendida / dada de baja / descartada), con persistencia e historial auditable.

---

## 1. Problema

Hoy no existe forma de registrar qué pasó con una propiedad después de captarla. El sistema sabe conseguir la propiedad y difundirla, pero no sabe si se vendió.

- `properties.status` describe **el proceso de captación** (`draft` → `pending_docs` / `pending_photos` / `pending_review` → `approved`), no el destino comercial.
- El pipeline de deals (`lib/supabase/deals.ts`) termina en `captured`. Mide si conseguimos la propiedad; no tiene etapas de reserva ni venta.
- La única acción "post-captación" que existe es el botón **Descartar** al pie de la ficha, que escribe `status = 'descartada'`.

Sin este dato no se puede responder nada de lo que el negocio va a preguntar tarde o temprano: cuánto se vendió, a qué precio real contra el publicado, cuánto tardó cada propiedad entre captación y venta, cuántas se dieron de baja y por qué.

## 2. Por qué NO va dentro de `properties.status`

Es la decisión de fondo del diseño y está respaldada por código en producción, no por preferencia estética.

**`checkAndAdvanceProperty` borraría el estado solo.** En `lib/supabase/properties.ts`:

```ts
if (hasPhotos && legalApproved && prop.status !== 'approved') {
  await supabase.from('properties').update({ status: 'approved' }).eq('id', id)
  await firePropertyCapturedNotifications(id)
}
```

Se ejecuta en el commit de cualquier archivo multimedia. Si `status` valiera `'vendida'`, la secuencia sería: marcás vendida → alguien sube o borra una foto → **la venta se convierte en `approved` sin dejar rastro**, y encima se re-disparan los emails N8A/N8B de "captación completa" a todo el equipo.

**Hay un trigger de base que reacciona a `approved`.** `20260514000002_meta_trigger_on_capture.sql` dispara el aprovisionamiento de campaña Meta cuando `status` pasa a `'approved'` con legal aprobado. Volver a ese valor por accidente puede recrear una campaña de una propiedad ya vendida.

**`status = 'approved'` es un permiso, no una etiqueta.** Habilita la pestaña Difusión (`visibleTabs`) y marca la propiedad como disponible en la página pública de agenda de visitas (`app/v/[token]/page.tsx`: `available={property.status === 'approved'}`). Pisar ese valor con un estado comercial mezcla "¿está lista para difundirse?" con "¿sigue en venta?", que son preguntas distintas.

**Conclusión:** dos ejes independientes en dos columnas.

| Eje | Columna | Valores | Qué contesta |
|---|---|---|---|
| Captación | `status` (existe) | draft, pending_docs, pending_photos, pending_review, approved, rejected, active, descartada | ¿Terminamos de captarla? |
| Comercial | `commercial_status` (nuevo) | disponible, reservada, vendida, dada_de_baja, descartada | ¿Qué pasó con ella? |

## 3. Decisiones tomadas (usuario, 2026-08-06)

1. **Solo registrar el estado.** No se pausan avisos de portales ni campañas de Meta automáticamente; el usuario los sigue manejando donde ya lo hace. Nada se apaga solo.
2. **"Descartada" se unifica.** El botón "Descartar" del pie de la ficha desaparece y pasa a ser una opción más de la nueva sección.
3. **Cada cambio guarda:** estado, fecha, quién lo hizo y motivo (opcional). Si el estado es **vendida**, además el **precio real de venta** y la **fecha de la operación**.

## 4. Fuera de alcance

- Pausar/despublicar avisos o campañas al cambiar de estado (decisión 1).
- Vincular el contacto comprador (evaluado y descartado por ahora: obliga a tenerlo cargado y suma fricción).
- Métricas, tableros o reportes sobre estos datos. Esta entrega **genera** el dato; explotarlo es otro trabajo.
- Cambiar el flujo de captación, el pipeline de deals o el listado de propiedades.
- Estados comerciales en propiedades de alquiler con lógica propia (por ahora los mismos cinco valores sirven para venta y alquiler).

---

## 5. Modelo de datos

Migración `supabase/migrations/20260806000001_property_commercial_status.sql`.

### 5.1 Columnas nuevas en `properties`

```sql
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL DEFAULT 'disponible',
  ADD COLUMN IF NOT EXISTS sold_price NUMERIC,
  ADD COLUMN IF NOT EXISTS sold_currency TEXT,
  ADD COLUMN IF NOT EXISTS sold_at DATE;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_commercial_status_check
  CHECK (commercial_status IN ('disponible','reservada','vendida','dada_de_baja','descartada'));
```

El precio y la fecha de venta viven **también** en `properties` —no solo en el historial— porque son datos del estado actual que se van a filtrar y sumar (“cuánto vendimos este mes”) sin recorrer eventos.

`sold_currency` existe aparte de `properties.currency` porque la operación puede cerrarse en otra moneda que la publicada.

### 5.2 Tabla de historial `property_status_events`

Registro que solo crece; nunca se actualiza ni se borra.

```sql
CREATE TABLE IF NOT EXISTS public.property_status_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  reason        TEXT,
  sold_price    NUMERIC,
  sold_currency TEXT,
  sold_at       DATE,
  changed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_status_events_property
  ON public.property_status_events (property_id, created_at DESC);
```

`changed_by` va con `ON DELETE SET NULL` por la regla del proyecto: toda FK a `profiles(id)` debe serlo, o borrar un usuario desde Supabase Auth falla.

Los campos de venta se **copian** al evento además de guardarse en la propiedad: si mañana se corrige el precio, el historial conserva lo que se cargó en su momento.

### 5.3 RLS

Misma convención que las tablas recientes (`is_operations_user()`):

- `SELECT` para `authenticated` con `public.is_operations_user()` — el abogado no lee estos eventos.
- Sin política de `INSERT`: se escribe con la clave de servicio desde la ruta de API, igual que el resto de las mutaciones del sistema.

### 5.4 Backfill

```sql
UPDATE public.properties
   SET commercial_status = 'descartada'
 WHERE status = 'descartada' AND commercial_status = 'disponible';
```

Las descartadas de hoy quedan con el estado comercial correcto desde el minuto cero. No se generan eventos históricos retroactivos: no sabemos quién ni cuándo las descartó, e inventarlo sería peor que no tenerlo.

### 5.5 Aplicación de la migración

Se aplica desde acá con el patrón ya probado del proyecto (`scripts/apply-*-pg.ts`): conexión directa por el session pooler con `SUPABASE_DB_PASSWORD`. El script **verifica y aborta** si algo no cuadra: que las 4 columnas existan, que el CHECK liste los 5 valores, que la tabla de eventos exista y que el backfill haya alcanzado exactamente a las propiedades con `status='descartada'`.

**Gate de deploy:** la migración se corre **antes** de deployar el código. Sin las columnas, la ruta nueva falla; el resto de la app no se entera.

---

## 6. La redundancia deliberada de `descartada`

`descartada` va a quedar escrito en **las dos** columnas: `status` (como hoy) y `commercial_status` (nuevo).

**Por qué:** hay cinco lugares que leen `status === 'descartada'` — el badge del listado, el descarte masivo del listado, `isDiscarded` en la ficha, `nextStep()` y la vista `vw_properties_list`. Migrarlos todos ahora obliga a tocar el listado de propiedades, que otra sesión está editando en paralelo. La escritura doble mantiene todo funcionando sin tocar esos archivos.

**Regla:** `commercial_status` es la fuente de verdad para leer el estado comercial. `status = 'descartada'` es un espejo heredado que se escribe pero no se consulta desde código nuevo. Queda documentado en el CLAUDE.md para eliminarlo cuando se migren los cinco lectores.

Restaurar una propiedad descartada revierte ambas columnas: `status` vuelve a `draft` (comportamiento actual) y `commercial_status` a `disponible`.

---

## 7. Reglas de negocio

Viven en un módulo puro y testeado, `lib/properties/commercial-status.ts`, no desperdigadas en el JSX.

### 7.1 Qué significa cada estado

Definirlo es parte del diseño: si dos personas del equipo entienden distinto "dada de baja", el dato no sirve para nada.

| Estado | Significado | Sigue siendo nuestra |
|---|---|---|
| **Disponible** | En comercialización activa. Se difunde y se muestra. Es el estado por defecto. | Sí |
| **Reservada** | Hay una operación en curso (seña o reserva). No se ofrece a nuevos interesados, pero puede volver a Disponible si se cae. | Sí |
| **Vendida** | Operación cerrada. Es el único estado que pide precio real y fecha. | Se concretó |
| **Dada de baja** | El propietario la retiró o venció el contrato de exclusividad. Dejamos de comercializarla **sin haberla vendido**. | No |
| **Descartada** | Nunca se llegó a trabajar o se decidió no seguirla. Es el "Descartar" de hoy. | No |

La diferencia entre *dada de baja* y *descartada* importa para medir: una baja es una propiedad que tuvimos y perdimos; una descartada nunca entró al circuito comercial.

### 7.2 Reglas

- **Catálogo:** cada estado con su clave, etiqueta en castellano, color y la línea de la tabla de arriba. Un solo lugar donde agregar un estado futuro (ej. "alquilada").
- **Transiciones:** todas permitidas. No se modela una máquina de estados rígida porque la realidad del negocio no lo es (una reserva se cae, una venta se anula). El historial deja el rastro.
- **Requisitos por estado:**
  - `vendida` exige **precio real** (> 0) y **fecha de operación** (no futura).
  - Salir de `vendida` hacia cualquier otro estado exige **motivo**. Anular una venta registrada tiene que dejar explicado por qué.
  - El resto: motivo opcional.
- **Limpieza:** al salir de `vendida`, los campos `sold_*` de la propiedad se ponen en `NULL` (el dato queda en el evento histórico, que es donde corresponde).

---

## 8. Escritura: ruta propia

`POST /api/properties/[id]/commercial-status`

Cuerpo: `{ status, reason?, soldPrice?, soldCurrency?, soldAt? }`

1. `requireAuth()` + `canAccessProperty()` (mismo control que el resto de las mutaciones).
2. **403 al abogado**: no ve ni toca datos comerciales.
3. Valida con el módulo puro; si falla, `400` con el mensaje en castellano.
4. Actualiza `properties` (estado + campos de venta) e inserta el evento en `property_status_events`.
5. Si el estado es `descartada`, escribe además `status='descartada'`; si se sale de `descartada`, `status='draft'` (§6).

**Por qué una ruta propia y no el `PUT /api/properties/[id]` que ya existe:** ese PUT es genérico y tiene efectos secundarios (crea tareas y dispara emails cuando `status` pasa a `pending_review`). Meter el estado comercial ahí mezclaría responsabilidades y volvería frágil algo que tiene que ser simple y auditable.

**Atomicidad — limitación aceptada:** son dos escrituras (propiedad + evento) sin transacción, porque el cliente de Supabase no expone transacciones multi-tabla. Si la segunda falla, queda el estado sin su evento. Mitigación: el `UPDATE` va primero y el `INSERT` del evento después con reintento simple; si el evento igual falla, se loguea `console.error` y la ruta devuelve 200 con `{ warning }` — perder el registro histórico no justifica dejar al usuario sin poder cambiar el estado. Si el volumen algún día lo exige, se mueve a una función RPC de Postgres, que sí es atómica.

---

## 9. Interfaz

### 9.1 Tarjeta "Estado de la propiedad"

Arriba de todo en la pestaña **Propiedad** (la que se abre por defecto), antes de Descripción. No en una pestaña propia: el usuario pidió que sea "muy, muy clara", y una pestaña más esconde justo lo que hay que destacar.

Contenido:
- Estado actual grande, con su color y la línea que lo explica.
- Cinco opciones para cambiar, cada una con su etiqueta.
- Al elegir **vendida**: campos de precio real (con selector de moneda, por defecto la de publicación) y fecha de operación.
- Al elegir cualquier otro: campo de motivo (opcional, u obligatorio si se sale de vendida).
- Confirmación antes de guardar, mostrando el cambio en una frase (`"Disponible → Vendida"`).
- Debajo, plegado, el **historial**: cada cambio con fecha, quién y motivo.

### 9.2 Etiqueta en la cabecera

Junto al badge de captación en `PropertyIdentityBar`, un segundo badge con el estado comercial — **solo cuando no es `disponible`**, para no agregar ruido al caso normal. Así se ve el estado sin entrar a ninguna pestaña.

### 9.3 Lo que se saca

`PropertyArchiveFooter` pierde el botón "Descartar" y el de "Restaurar" (ahora son estados de la tarjeta). **Conserva "Eliminar definitivamente"**, que es otra cosa: borra la propiedad de la base, no cambia su estado.

---

## 10. Verificación

Turbopack no arranca en la carpeta del proyecto (bug con el acento de "Gestión" en el path), así que:

1. **Tests unitarios** del módulo puro: catálogo completo, requisitos de `vendida`, motivo obligatorio al salir de vendida, limpieza de `sold_*`, validación de fecha futura y precio ≤ 0.
2. **Test de componente** (happy-dom) de la tarjeta: que pida precio y fecha al elegir vendida, que bloquee guardar sin motivo al salir de vendida, que el abogado no la vea.
3. **Probe de render** con `renderToStaticMarkup` para los cinco estados.
4. **Verificación de la ruta contra la base real**, con un script tsx: cambia el estado de una propiedad de prueba, confirma por SQL que quedaron la columna y el evento, y revierte. El proyecto no tiene infraestructura para testear rutas de Next con Supabase mockeado, y montarla para esta entrega sería más frágil que verificar contra la base de verdad — que además es lo único que prueba que la migración corrió bien.
5. **Revisión visual del usuario** en el navegador antes de publicar.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| La migración no corre antes del deploy y la ruta falla | Script que aplica y **verifica**; el gate está escrito en el plan como primera tarea |
| Alguien marca "vendida" por error en la propiedad equivocada | Confirmación explícita antes de guardar + el cambio es reversible y queda registrado quién lo hizo |
| El evento histórico no se escribe (sin transacción) | Reintento + `console.error` + la respuesta avisa; el estado nunca queda a medias porque el UPDATE va primero |
| Otra sesión trabajando en paralelo sobre los mismos archivos | Todo el trabajo va en un worktree aislado sobre su propia rama; antes de mergear se verifica que el diff contenga solo archivos propios |
| El CHECK rechaza un valor si mañana se agrega un estado | El catálogo del módulo puro y el CHECK deben cambiarse juntos; queda advertido en el propio archivo de migración |
