# Auditoría

## Ronda 1: artefactos (auditor 1, 2026-11-27, sobre 402e5f21)

22 hallazgos. Todos se incorporaron a `proposal.md`, `design.md`, `specs/` y `tasks.md`.

| # | Sev. | Hallazgo | Resolución |
|---|---|---|---|
| 1 | Alta | El CHECK excluía la `o` minúscula, que el alfabeto de `lead_access_tokens` sí usa: ~16 % de los códigos fallarían | CHECK `^[A-HJ-NP-Za-km-z2-9]{10}$` y un test de la verificación con un código que lleva `o` (D2) |
| 2 | Alta | El trabajo de la cola no tiene dónde guardar "vuelta atrás" | La evidencia es `whatsapp_messages.template_name` más `console.warn`; se reescribió el escenario (D3) |
| 3 | Alta | La vuelta atrás no cubría una plantilla pausada, deshabilitada o frenada por marketing | `esRechazoDePlantilla` (132xxx, 131049, 131050) manda `tasacion_llamada_v1` en el mismo intento (D3, spec "Nadie se queda sin el primer mensaje") |
| 4 | Alta | La QA en la vista previa no ejercita el envío nuevo (la cola corre en producción) | Envío por script que llama al manejador contra el teléfono de Julián (tareas 7.2 y 7.3) |
| 5 | Alta | El video de ~110 MB podía no entrar en Storage | Verificado con la Management API: `fileSizeLimit` = 500 MB. Entra |
| 6 | Alta | La migración `20261127000003` choca con `feat/crm-tareas-y-campanita` | `20261128000001` y revisar todas las ramas (D2, tarea 2.1) |
| 7 | Media | "Dos dispositivos se suman" era falso: `watch_seconds` se queda con el máximo | Minutos = tramos de `watched_buckets` × duración; escenarios reescritos |
| 8 | Media | Crear el enlace y unir `bv:` no era atómico | RPC `obtener_o_crear` que siempre llama a `link_anon_to_contact` (idempotente) |
| 9 | Media | El video nuevo contaminaba `get_panel_video` y `/embudos` | `funnel=null` y exclusión de `bienvenida-%` en los dos lectores (D4, tareas 2.1 y 4.7) |
| 10 | Media | La cartera trae todo el alcance: los ids por URL desbordan la cabecera | RPC con los ids en el cuerpo, como fuente opcional (D6, spec "La marca no rompe la cartera") |
| 11 | Media | El mensaje pierde "Te llamará Paula", y faltaba la regla para cuando las dos salen MARKETING | Regla agregada (D1). Línea de Paula sumada al mensaje (el dueño dijo que sí, 2026-11-27) |
| 12 | Media | `PLANTILLAS_QUE_CONVERSAN` no se exporta, y una plantilla desconocida avisa en cada mensaje | Las dos van a `PLANTILLAS_QUE_SOLO_AVISAN`, con test de `modoDePlantilla` |
| 13 | Media | "Coordinó" solo por `scheduled_at` se quedaba corto | `scheduled_at` o una etapa de Coordinada en adelante, en procesos creados desde el envío (D7) |
| 14 | Media | "Recibió el enlace" no tenía dato | Columna `enviado_at`, que se escribe cuando Meta acepta |
| 15 | Baja | El `GRANT` a `anon` de la RPC permitía preguntar si un código existe | `REVOKE` y solo `service_role` |
| 16 | Baja | Faltaba un test de las rutas públicas | Test en la tarea 4.4 (ahora `/t/`) |
| 17 | Baja | La página no hereda el layout de las landings; faltaban privacidad y vista previa | Layout propio, `no-referrer`, sin Píxel, título sin nombre (spec "Lo que la página no tiene") |
| 18 | Baja | Textos contradictorios entre la propuesta, los specs y el diseño | Unificados: "Abrió el enlace del video de bienvenida", "debajo del nombre", panel sin `[TEST]` en la QA |
| 19 | Baja | El detalle con "mantener apretado" no se puede hacer (la fila es un enlace) | Requisito eliminado: el detalle vive en la línea de tiempo |
| 20 | Baja | La línea de tiempo no lee las columnas necesarias | D5 amplía `FilaVideo`, respeta el cursor y suma el ícono |
| 21 | Baja | No estaba dicho que el asesor puede crear enlaces | Explícito en el spec de la ficha; el servidor valida el proceso del embudo (400) |
| 22 | Baja | "Escribinos" abre una conversación sin dueño claro | Entra al Inbox como cualquier mensaje entrante; el agente no contesta (D4) |

### Ajustes del dueño sobre la maqueta (mismo día)

- Enlace corto `inmodf.com.ar/t/<código>`.
- Versión con el caso.
- Sin duración visible.
- "Qué pasa ahora" a los 30 s de video reproducido.
- Logo centrado.
- Titular y subtítulo centrados.

## Ronda 1b: auditor 2 (2026-11-27, sobre 82fe4cbe)

11 hallazgos. Todos incorporados. Además corrige tres resoluciones del auditor 1:
- la #3 en parte, porque 131049/131050 no llegan en el envío;
- la #9 era exagerada, porque el embudo nulo alcanzaba;
- la #6 quedó desactualizada, porque la migración de campanita ya está en main.

| # | Sev. | Hallazgo | Resolución |
|---|---|---|---|
| 1 | Alta | 131049/131050 los avisa Meta minutos después por el webhook, no en el envío | `esRechazoDePlantilla` = solo 132xxx; respaldo tardío D3b, igual que la encuesta; columnas `wamid`, `envio_fallido_at` y `respaldo_at` |
| 2 | Media | Si `marcar_enviado` lanzaba, la cola reintentaba y el WhatsApp salía dos veces | Best-effort con try/catch; escenario "No se duplica el mensaje" |
| 3 | Media | Adelantar inflaba el % y "lo terminó", y los controles nativos muestran la duración | `vslBar`, y todas las métricas desde `watched_buckets` |
| 4 | Media | Que el equipo abra el enlace contaba como la persona | Medición apagada con sesión de la plataforma, con aviso |
| 5 | Media | La rama estaba atrasada respecto de main | Rebase hecho (tarea 0.1) |
| 6 | Baja | El filtro SQL no hacía falta y arriesgaba el GRANT | Sin SQL; test de JS del embudo nulo |
| 7 | Baja | Quedaban textos viejos (`app/video`, `funnel={null}`, `/video/` en 8.1) | Corregidos |
| 8 | Baja | "Coordinada en adelante" sin enumerar | Lista explícita de etapas en D7 |
| 9 | Baja | Límite del bucket y subida de 110 MB | Bucket sin límite propio (leído), subida resumible TUS |
| 10 | Baja | "Un solo renglón" no era verificable; `.vcf` en las apps | El escenario pasa a "se ve completo y se puede tocar"; QA del `.vcf` en iOS y Android (7.4) |
| 11 | Baja | `video-keys.test.ts` no recorre `app/t` | Se amplía el recorrido (4.7) |

## Ronda 2: código (auditor 1, 2026-11-27, sobre d7d2a360)

Sin hallazgos altos. Pruebas: 385 ✓ y `tsc` ✓. Arreglos en ba33ac7c.

| # | Sev. | Hallazgo | Resolución |
|---|---|---|---|
| 1 | Media | Después de un primer freno, un segundo envío frenado no tenía respaldo | `marcar_enviado` reinicia `respaldo_at` y `envio_fallido_at` cuando cambia el `wamid`; verificado en la base |
| 2 | Media | Si el respaldo en línea fallaba, no había reintento | `tomar_respaldo` reencola el trabajo `whatsapp` con `sinVideo` (reintentos de la cola); en línea solo como último recurso |
| 3 | Baja | Sin `wamid` escrito no hay respaldo | Aceptado y documentado (Risks) |
| 4 | Baja | Cualquier `failed` leía la base | Se filtra por 131049/131050 antes de leer (test) |
| 5 | Baja | La página se redibujaba ~4 veces por segundo durante todo el video | Un aviso por segundo entero, y nada después de los 30 s |
| 6 | Baja | El margen de 5 min de "coordinó" se restaba dos veces | Un solo margen |
| 7 | Baja | Diferencias entre design y código | design.md actualizado |
| 8 | Baja | El antes/después necesitaba un commit | Fecha automática desde el primer envío (`fechaDelCambio`, test) |
| 9 | Baja | La fecha del evento de video es la primera medición | Aceptado: igual que las landings (Risks) |
| 10 | Baja | `.vcf` como adjunto en iPhone | `inline`; QA en iOS y Android (4.10) |
| 11 | Baja | Quien tenga el código puede inflar la medición | Aceptado y documentado (Risks) |
| 12 | Baja | Filas de más en `whatsapp_messages` tras 132xxx + falla pasajera | Aceptado y documentado (Risks) |

**QA en la vista previa (PR #103), con datos `[TEST]`:**
- página a 390 y a 1280 px;
- el bloque a los 30 s y desde el inicio al volver;
- aperturas por pestaña y ninguna para el equipo;
- tarjeta de Paula; código inexistente → 404; privacidad de la vista previa;
- línea de tiempo, tarjeta de la ficha y marca en la cartera;
- panel de Métricas vacío, como corresponde.
