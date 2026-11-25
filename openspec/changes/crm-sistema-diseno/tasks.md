# Tasks

## 1. Base de la maqueta

- [x] 1.1 Crear `maqueta/index.html` con los tokens copiados de `app/globals.css` (brand, brand-soft, primario, radio, tipografía) y la estructura de barra superior + menú; verificar abriéndolo que se ve como la plataforma a 390 y 1280 px
- [x] 1.2 Agregar navegación interna entre pantallas y conmutador de rol (coordinadora, asesor, admin); verificar que cada enlace muestra su pantalla

## 2. Pantallas

- [x] 2.1 Ficha de contacto: tres columnas en 1280, dos en 1024, pestañas Actividad/Datos/Tareas + cabecera fija en 390; verificar los tres anchos sin scroll horizontal
- [x] 2.2 Nota rápida y Registrar llamada (composer en escritorio, hoja desde "+" en celular) con los 5 resultados y el caso "volver a llamar" que pide día y hora; verificar que "No atendió" se registra en 3 toques y aparece en la línea de tiempo
- [x] 2.3 Línea de tiempo con un ejemplo de cada tipo de evento (registro, llamada, nota, WhatsApp, cambio de etapa, tarea, video visto, email) y filtros; verificar que cada evento tiene ícono, título, autor y fecha
- [x] 2.4 Campanita (panel en escritorio, hoja en celular) con completar y posponer, y estado "todo al día"; verificar ambos estados
- [x] 2.5 Página de tareas agrupada en Vencidas / Hoy / Próximas / Sin fecha (plegado) con crear tarea; verificar en 390 y 1280
- [x] 2.6 Inicio de coordinadora, asesor y admin/dueño según §5.6 del diseño general; verificar que en 390 px el primer bloque visible es la lista de cosas para hacer
- [x] 2.7 Estados de carga, vacío y error de un bloque de ejemplo; verificar que el error ofrece Reintentar y no muestra ceros

## 3. Revisión con el dueño

- [x] 3.1 Publicar la maqueta como página privada y pasarle el link al dueño; verificar que abre en celular
- [x] 3.2 Aplicar las rondas de ajuste que pida y anotar cada una en `aprobacion.md`; verificar que cada pedido tiene su respuesta
- [x] 3.3 Con la aprobación explícita del dueño, guardar capturas de cada pantalla a 390 y 1280 en `maqueta/capturas/` y actualizar `specs/crm-sistema-diseno/spec.md` con lo que haya cambiado; verificar con `openspec validate crm-sistema-diseno --strict`

## 4. Auditoría doble

- [x] 4.1 Auditor 1 (agente nuevo, sin contexto) revisa la maqueta contra cada escenario de la spec y contra las anti-metas del diseño general; registra hallazgos en `auditoria.md`
- [x] 4.2 Corregir los hallazgos de peso; verificar cada uno en la maqueta
- [x] 4.3 Auditor 2 (otro agente nuevo) revisa la maqueta, la spec y la auditoría del auditor 1; registra en `auditoria.md`
- [x] 4.4 Repetir 4.2–4.3 hasta cero hallazgos de peso; verificar que `auditoria.md` cierra con ambos auditores conformes
- [ ] 4.5 Abrir el PR del change (solo documentos y maqueta) y mergearlo; verificar que producción no cambia

## Workflow follow-up

- Archivar el change después del merge, para que `openspec/specs/crm-sistema-diseno/spec.md` quede como spec vigente.
- El QA en la vista previa de Netlify no aplica a este change: no toca la aplicación. La verificación equivalente es la maqueta a 390 y 1280 px (tareas 2.x y 3.1).
