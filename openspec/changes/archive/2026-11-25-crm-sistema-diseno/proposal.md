# Proposal

## Why

Vamos a construir cinco piezas de CRM (ficha de contacto, registro de llamadas, línea de
tiempo, tareas con campanita e Inicio) que tienen que verse y comportarse como una sola
cosa, al estilo Follow Up Boss, y funcionar perfecto en el celular. Si cada pieza decide su
propio layout se corrige cinco veces; conviene acordar el diseño una vez, con el dueño
mirándolo, antes de programar.

## What Changes

- Maqueta navegable (no es código de la plataforma) de: ficha de contacto, nota rápida y
  registrar llamada, campanita, página de tareas e Inicio de coordinadora, asesor y
  admin/dueño. Cada pantalla en celular (390 px) y escritorio (1280 px), con los colores,
  tipografía e íconos que la plataforma ya usa.
- Rondas de ajuste con el dueño hasta su aprobación explícita.
- Las reglas aprobadas quedan escritas como especificación (`crm-sistema-diseno`): qué va
  en cada columna, cómo se reacomoda por ancho de pantalla, estados de carga/vacío/error,
  tamaños táctiles, cómo se muestra cada resultado de llamada y cada tipo de evento.
- **Queda afuera:** todo código de la aplicación (componentes, rutas, base). Los
  componentes se construyen en el change que los usa por primera vez, siguiendo esta spec.
  Tampoco se define paleta nueva ni modo oscuro propio: se usan los tokens existentes.

Roles: la maqueta la aprueba el dueño/admin. Lo diseñado lo usarán coordinador, asesor,
admin y dueño; el abogado no ve nada de este módulo.

## Capabilities

### New Capabilities
- `crm-sistema-diseno`: reglas visuales y de comportamiento que deben cumplir todas las
  pantallas del módulo CRM (layout por ancho, estados, accesibilidad táctil, lenguaje visual
  de llamadas, eventos y tareas).

### Modified Capabilities

Ninguna (es la primera spec del proyecto).

## Impact

- Archivos nuevos solo dentro de `openspec/changes/crm-sistema-diseno/` (maqueta y capturas).
- Ningún cambio en producción, base de datos ni dependencias.
- Bloquea el inicio de `crm-ficha-y-llamadas`, `crm-tareas-y-campanita` y `crm-inicio`.
