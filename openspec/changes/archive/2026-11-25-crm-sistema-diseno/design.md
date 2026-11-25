# Design

## Context

Ver `proposal.md` y el diseño general en
`docs/superpowers/specs/2026-11-25-ficha-contacto-llamadas-inicio-design.md` (§5.1).
La plataforma ya tiene identidad: tokens en `app/globals.css` (`--brand` azul
oklch(0.40 0.18 260), `--brand-soft`, primario carbón, radio 0.75rem, Geist), shadcn
new-york e íconos lucide. No se puede correr `next dev` local de forma confiable (iCloud +
tilde en la ruta), así que una maqueta dentro de la app sería lenta de iterar.

## Goals / Non-Goals

**Goals:**
- Que el dueño vea y toque las pantallas en su propio celular antes de que exista código.
- Que lo aprobado quede como reglas verificables (la spec) y capturas de referencia.

**Non-Goals:**
- Componentes de React, rutas o datos reales.
- Pixel-perfect final: la maqueta fija estructura, jerarquía y comportamiento.

## Decisions

1. **Maqueta = un único HTML estático autocontenido**, guardado en
   `openspec/changes/crm-sistema-diseno/maqueta/index.html` y publicado como página privada
   (artifact) para que el dueño la abra por link en computadora y celular.
   *Alternativa:* ruta `/maqueta` dentro de la app → obliga a deploy por cada ajuste y deja
   código descartable en producción. *Alternativa:* Figma → no hay acceso configurado.
2. **Los tokens se copian a mano de `globals.css`** a variables CSS de la maqueta (mismos
   valores oklch, radio, Geist con fallback del sistema). Así lo aprobado es reproducible
   con las clases que la app ya tiene.
3. **Una sola página con navegación interna** entre pantallas (Inicio por rol, Ficha,
   Tareas, campanita) y un conmutador de rol. Es responsive de verdad: el mismo HTML se
   reacomoda a 390 / 1024 / 1280, que es justo lo que se quiere aprobar.
4. **Datos ficticios pero verosímiles** (nombres inventados, barrios reales). Nunca datos
   de personas reales: la página sale del repo.
5. **Interacciones mínimas con JS plano:** abrir/cerrar hoja de registrar llamada, elegir
   resultado, ver el evento aparecer en la línea de tiempo, abrir campanita, completar
   tarea. Lo suficiente para contar los toques.
6. **Las decisiones del dueño se anotan en `aprobacion.md`** del change (fecha, qué pidió
   cambiar, qué quedó). Si un ajuste contradice la spec, se actualiza la spec en el mismo commit.

## Risks / Trade-offs

- [La maqueta promete algo que los datos reales no sostienen] → cada bloque de la maqueta
  se arma solo con campos que existen hoy o que el diseño general define (lista en §5 de ese doc).
- [La app final se desvía de la maqueta] → las capturas a 390 y 1280 quedan en el change y
  los auditores de los changes siguientes comparan contra ellas.
- [Rondas de ajuste sin fin] → cada ronda cierra con lista de cambios; lo que sea gusto
  menor (textos, espaciados) se anota y se resuelve en el change que construye la pantalla.
