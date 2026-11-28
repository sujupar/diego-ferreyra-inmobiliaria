# Proposal

## Why

El dueño (2026-11-28): la lista del CRM tiene que mostrar siempre lo más nuevo primero, y
arriba aparecían procesos de junio con "Vencida hace 179 días" (14 Coordinadas a las que nadie
les cargó el resultado de la tasación). El dato es cierto, pero tapa lo nuevo.

## What Changes

- El orden por defecto de la cartera y de Contactos pasa a "Más nuevos primero" (primera opción
  del selector). El orden elegido manda en los grupos generales de cada vista; los grupos
  urgentes (sin primer contacto, vencidas, tasaciones de hoy y mañana) mantienen su orden.
- Grupo nuevo al final, antes de los cerrados: "Trabados · más de 30 días sin movimiento":
  abiertos sin contacto ni tasación en más de 30 días desde que entraron. Primero el que se
  movió más recientemente.

Aprobado por el dueño con las recomendaciones (30 días; los más nuevos primero).

## Impact

`lib/crm/cartera.ts` (`ultimoMovimiento`, `trabadoViejo`, `agrupar` con orden),
`lib/crm/cartera-url.ts`, `lib/crm/cartera-pantalla.ts`, `components/crm/cartera/`. Sin base.
