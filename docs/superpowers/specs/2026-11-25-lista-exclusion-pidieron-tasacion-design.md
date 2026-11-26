# Lista "Pidieron tasación" actualizada sola todos los días — diseño

**Fecha:** 2026-11-25 · **Tamaño:** mediano (ruta nueva + job de pg_cron + llamada a Meta)

## Problema y resultado

- **Problema:** el público de Meta "DF · EXCLUIR Pidieron tasación" (`120248925449950656`) se subió a mano el 25/11 con 393 personas y queda fijo. Quien pida tasación después sigue viendo los anuncios de "pedí tu tasación", y se paga por mostrárselos.
- **Resultado:** cada madrugada la plataforma reemplaza esa lista por la versión del día. Cualquier solicitud nueva queda excluida de las campañas de tasación al día siguiente.

## Qué ve el usuario

Nada nuevo en pantalla. Lo único visible es que la lista de Meta se actualiza sola y que su tamaño crece con las solicitudes.

## Qué pasa por detrás

1. **Disparo:** pg_cron corre todos los días a las 06:30 UTC (03:30 de Argentina) y pega a `POST /api/cron/meta-exclusion-sync`.
2. **Quiénes entran.** Es la misma regla que se usó a mano el 25/11:
   - todos los contactos con un proceso `origin='embudo'`, en cualquier etapa;
   - todos los contactos con un proceso en etapa coordinada o más avanzada (`scheduled`, `not_visited`, `visited`, `appraisal_sent`, `followup`, `captured`), de cualquier origen.
3. **Quiénes quedan afuera:**
   - las pruebas: contactos de Julián, `[TEST` y cuentas `@passmail.com`;
   - quien no tiene ni un email válido ni un teléfono de 10 dígitos.
4. **Qué se manda a Meta:** el email en minúsculas y el teléfono como `549` + los últimos 10 dígitos (`phone_norm`), los dos cifrados en SHA-256. Es el mismo formato de la carga manual, así los que ya están siguen coincidiendo.
5. **Cómo se reemplaza:** con `POST /{público}/usersreplace`, el reemplazo completo de Meta. Saca a quien ya no corresponde, agrega a los nuevos y no reinicia el aprendizaje de los conjuntos que usan el público. Es una sola llamada: hasta 10.000 filas por tanda, y hoy son ~400.
6. **Freno de seguridad.** No se reemplaza nada si la lista calculada:
   - tiene 0 personas, o
   - tiene menos del 80 % de las que mandó la corrida anterior.

   Una consulta rota nunca vacía la exclusión. En ese caso la corrida queda anotada como error con el motivo.
7. **Registro:** cada corrida escribe una fila en `funnel_meta_sync_log`, que ya existe. Lleva la etapa `excluir_pidieron_tasacion`, cuántas personas se mandaron, el `num_received` de Meta, o el error.
8. **Modo prueba:** `?simular=1` calcula y devuelve los números sin llamar a Meta.

## Qué queda afuera

- **La sincronización por etapa vieja** (`meta-audience-sync`, públicos "CRM · …") no se toca. Corrió una sola vez, el 17/06, y nunca se programó.
- **La lista "DF · EXCLUIR Agendaron últimos 180 días"** no se borra ni se toca. Queda redundante.
- **No hay pantalla** de configuración ni avisos por email.
- **No se agrega el público a otros conjuntos.** Ya está en Validados, Pruebas y Remarketing.

## Criterios de aceptación

1. Con `?simular=1`, la ruta devuelve la cantidad de personas, ~393 hoy, y en Meta no cambia nada: el `time_updated` del público sigue igual.
2. En la corrida real, Meta responde `num_received` igual a la cantidad calculada y queda una fila en `funnel_meta_sync_log` sin error.
3. Una solicitud `[TEST` que entre por el embudo NO aparece en la cuenta. Una solicitud real nueva SÍ aparece en la corrida siguiente.
4. Si la cantidad cae por debajo del 80 % de la anterior (probado en la prueba unitaria y con un parámetro de prueba forzado), no se llama a Meta y el log dice por qué.
5. El job `meta-exclusion-sync` está en `cron.job`, y `net._http_response` muestra un 200 con `{"ok":true,"enviadas":…}` al día siguiente.
6. Sin el secreto, la ruta responde 403.

## Riesgos (pre-flight)

- **Permiso de Meta.** El token ya dio "(#3) Application does not have the capability" al editar conjuntos con la base de WhatsApp. `usersreplace` podría tener una restricción parecida. Se prueba PRIMERO contra el público real, reemplazándolo con los mismos datos de hoy, que es inocuo. Si falla, el plan B es `/users` (agregar) más `/users` DELETE (sacar) con un registro propio.
- **Tiempo de Netlify:** una consulta a Supabase más una llamada a Meta entran holgadas en el límite.
- **pg_cron/pg_net:** el job se programa DESPUÉS del deploy. Se verifica en `net._http_response` mirando el contenido, no solo el 200.
- **Datos personales:** a Meta solo viajan valores cifrados, nunca en claro, y no se escriben en los logs.
- **Mensajes a clientes:** no se envía nada a nadie.
