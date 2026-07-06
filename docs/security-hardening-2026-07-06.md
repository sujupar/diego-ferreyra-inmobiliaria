# Endurecimiento de seguridad — 2026-07-06

Auditoría profunda multi-agente (36 hallazgos confirmados: 6 críticos, 9 altos) +
remediación por olas sobre la rama `security/hardening-audit`. Principio rector:
**cerrar seguridad sin romper una sola funcionalidad**. Todos los llamadores legítimos
ya están autenticados (dashboard), así que los guards agregados son aditivos.

Verificación aplicada a cada ola: `tsc --noEmit` limpio + suite de tests (254/254 app).
El `next build` local NO corre por un bug de Turbopack con el acento NFD del path de la
carpeta (`Gestión` = `o`+U+0301) — es ambiental, Netlify (path ASCII) no se ve afectado.

---

## ⚠️ ACCIÓN REQUERIDA DEL USUARIO

### 1. Correr la migración en el SQL Editor de Supabase (CRÍTICO — hacer YA)

`supabase/migrations/20260706000001_profiles_prevent_privilege_escalation.sql`

Cierra la escalada de privilegios donde **cualquier usuario logueado podía ponerse
`role='admin'`** vía la API REST pública de Supabase. Hasta que esta migración corra,
el fix de código de las rutas admin NO alcanza: el atacante escala por PostgREST directo.

Verificación post-migración (con un JWT de asesor, debe fallar con 42501):
```sql
UPDATE public.profiles SET role='admin' WHERE id = auth.uid();
```

### 2. Confirmar el proyecto Supabase correcto antes de correr SQL

(Ver `crons_secret_landscape` en memoria — coexisten configuraciones.)

---

## Lo aplicado (código, en la rama — deploya al hacer merge a `main`)

### Ola 1 — agujeros críticos (commit `c2aa595`)
- **Borrados dos backdoors de creación de admin**: `POST /api/auth/setup` (creaba admin
  con contraseña arbitraria desde internet) y `POST /api/admin/seed` (creaba cuentas con
  `Test1234!` y las devolvía en la respuesta). Bootstrap ya cumplido, sin llamadores.
- **`requireAuth()` en rutas que estaban 100% abiertas** (service-role bypassa RLS):
  contacts (list + [id]), appraisals/[id] GET/DELETE, tasks/[id], users/advisors,
  metrics/*, marketing/reports, analyze-image, settings/{report-recipients,upload-market-image}.
- **SSRF en `/api/proxy-image`**: `requireAuth` + bloqueo de IP privadas/loopback/
  link-local (incl. metadata `169.254.169.254`) resolviendo el host antes y en cada
  redirect, cap de 10 MB, content-type `image/*`.
- **XSS almacenado** (URLs de media → `<iframe src>` en la landing pública): sanitización
  `https://` en escritura (`ml-preview` PATCH) y en lectura (`Tour3DEmbed`/`VideoEmbed`).

### Ola 1 DB — trigger anti-escalada (commit `9d59c8c`) → **correr a mano (ver arriba)**

### Ola 2 — IDOR / autorización a nivel de objeto (commit `0494fc7`)
- Helper `lib/auth/entity-access.ts`: solo el rol **asesor** se acota a filas propias
  (`assigned_to`; appraisals además por `user_id`); el resto de roles mantiene su acceso
  amplio actual → cero cambio de comportamiento para ellos. Falla cerrado.
- Aplicado a: properties/[id] (GET/PUT), deals/[id] (GET/PUT), appraisals/[id]
  (GET/PUT/PATCH/DELETE), properties/[id]/media/{upload-init,commit,route},
  meta-launch-v2/generate-batch (el `jobId` debe pertenecer a la propiedad).
- **`is_active`** ahora se enforza en `getUser()` → un usuario dado de baja se trata como
  no autenticado en todo consumidor (la impersonación por admin no se afecta).
- **Least-privilege vertical** (confirmado no-breaking por el gating del nav): metrics/* →
  `metrics.view`; settings/{report-recipients,upload-market-image} → `settings.manage`.

### Ola 3 — hardening estructural (commit `d961094`)
- **HSTS** en `netlify.toml` (ya existían X-Frame-Options/nosniff/Referrer/Permissions).
- **Bloqueo de SVG** en upload-market-image (image/svg+xml permitía XSS servido inline).
- **Contraseña ≥ 12** en accept-invite (ASVS L1).

---

## Pendiente — recomendado, NO aplicado (requiere decisión/validación del usuario)

Estos NO se auto-aplicaron porque cambian comportamiento o no se pueden verificar sin
riesgo. Ninguno es crítico; los críticos y altos ya están cerrados.

| # | Ítem | Por qué no se aplicó solo | Recomendación |
|---|------|---------------------------|---------------|
| #27 | RLS `visit_questionnaires` INSERT `WITH CHECK(true)` | El flujo legítimo de asesor completando el cuestionario de SU visita usa el cliente **autenticado** (no service-role), así que restringir la policy a "solo privilegiados" **rompería** ese flujo. | Policy scopeada al dueño de la visita. SQL sugerido abajo — **verificar el schema (visit_id / assigned_to) antes de correr**. |
| #20 / #21 | Rate limiting real (leads = Map in-proceso inútil en serverless; tracking sin límite) | Un limiter por IP sobre leads puede tirar leads legítimos de IPs NAT (oficinas); un write a DB por pageview en tracking daña la escala. `isDuplicate()` ya cubre el spam de leads. | Rate limiting en el **edge** (Netlify Rate Limiting / Cloudflare) o Upstash Redis para tracking. Es la respuesta correcta para "millones de usuarios". |
| #23 | Cuotas de costo LLM (generate-batch / optimize-avatar) | No es vulnerabilidad; requiere contador por propiedad/usuario/día + migración. | Contador de piezas por propiedad de por vida + rate-limit por usuario. |
| #25 | Content-Security-Policy | Una CSP mal calibrada rompe la app (Next inline scripts). Debe ir report-only → calibrar → enforce. | Arrancar report-only con la política starter de abajo; pasar a enforce tras días sin violaciones. |
| #26 | Pinear `@netlify/plugin-nextjs` | Pinear una versión equivocada puede romper el deploy; no sé cuál corre OK hoy. | Confirmar la versión actual en la UI de Netlify y pinearla en `package.json` devDependencies. |
| #30 | Mutación no atómica de `properties.photos` | Baja probabilidad (un asesor por propiedad); fix requiere RPC + migración. | RPC con `array_append`/`array_remove` o optimistic-lock por `version`. |

### SQL sugerido para #27 (VERIFICAR schema antes de correr)
```sql
-- Reemplaza el INSERT permisivo por uno scopeado al asesor de la visita.
-- Asume visit_questionnaires.visit_id → property_visits(id) con assigned_to.
DROP POLICY IF EXISTS vq_insert_authenticated ON visit_questionnaires;
CREATE POLICY vq_insert_scoped ON visit_questionnaires
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_privileged_user()
    OR EXISTS (
      SELECT 1 FROM property_visits v
      WHERE v.id = visit_questionnaires.visit_id
        AND v.assigned_to = auth.uid()
    )
  );
-- (La ruta pública /api/public/questionnaire/[token] usa service-role → no la afecta.)
```

### CSP starter (report-only) para #25
```toml
# En netlify.toml, dentro de [[headers]] for="/*", empezar en report-only:
Content-Security-Policy-Report-Only = "default-src 'self'; img-src 'self' data: https://*.supabase.co https://http2.mlstatic.com; frame-src https://*.matterport.com https://www.youtube.com https://player.vimeo.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co"
```

---

## Residual conocido tras las olas
- Un JWT de usuario desactivado sigue siendo válido para PostgREST directo hasta expirar
  (~1 h) — `getUser()` ya lo bloquea a nivel app. Para cierre total: revocar sesiones en
  la baja (Supabase admin) o chequear `is_active` en las policies RLS.
- CSP y rate limiting en edge quedan como los dos mayores endurecimientos pendientes para
  el objetivo de escala/seguridad absoluta.
