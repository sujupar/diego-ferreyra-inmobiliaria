# Meta Ads — Configuración de credenciales

## Cómo obtener las credenciales

### 1. System User Token (NO usar tokens de usuario personal — expiran)

1. Andá a https://business.facebook.com/settings/system-users
2. Si no tenés un System User creado, click en **"Agregar"** y creá uno con role **"Administrador"**.
3. Click en el System User → **"Asignar activos"**: asignar la cuenta publicitaria y la página.
4. Click en **"Generar nuevo token"**:
   - App: la app de Meta Developers asociada al negocio.
   - Permisos requeridos: `ads_management`, `ads_read`, `pages_read_engagement`, `pages_manage_metadata`, `leads_retrieval`, `business_management`.
   - Caducidad: **"Nunca"** (importante).
5. Copialo (solo se ve una vez).

### 2. IDs auxiliares

| Variable | Cómo conseguirla | Formato |
|----------|------------------|---------|
| `META_AD_ACCOUNT_ID` | Business Manager → Configuración → Cuentas publicitarias → ID | `act_1234567890` (con prefijo `act_`) |
| `META_PAGE_ID` | Página de Facebook → About → Page ID | Número sin prefijo |
| `META_PIXEL_ID` | Events Manager → Datasets → ID del Pixel | Número sin prefijo |
| `META_BUSINESS_ID` | Business Settings → Información del negocio → ID | Número sin prefijo |

### 3. (Opcional pero recomendado) `GEMINI_API_KEY`

El wizard inteligente de Meta Ads usa Google Gemini vision para analizar fotos
de la propiedad y proponer highlights ("pileta", "balcón aterrazado", etc). Sin
esta key, el wizard funciona igual pero hace fallback a un análisis basado en
los amenities cargados — menos preciso.

- **Obtener**: https://aistudio.google.com/apikey → Create API key.
- **Variable**: `GEMINI_API_KEY` en Netlify (Diego ya la tiene cargada).
- **Modelo default**: `gemini-2.0-flash`. Override con `GEMINI_VISION_MODEL`
  (alternativas: `gemini-2.5-flash`, `gemini-1.5-pro`).
- **Costo**: gratis hasta 15 RPM en tier free, después ~$0.0001-0.005 por
  propiedad analizada.

## Dónde configurar las variables

**Las 5 variables van en Netlify, NO en Supabase.**

1. Netlify Dashboard → Site `inmodf` → **Site configuration** → **Environment variables**
2. Click en **"Add a variable"** → **"Add a single variable"** para cada una:
   - `META_ACCESS_TOKEN`
   - `META_AD_ACCOUNT_ID`
   - `META_PAGE_ID`
   - `META_PIXEL_ID`
   - `META_BUSINESS_ID`
3. **Scope: All scopes**. **Deploy contexts: All**.
4. **Redeploy del sitio:** Deploys → Trigger deploy → Deploy site. Las env vars solo aplican a builds nuevos.

## Por qué NO van en Supabase

- Los tokens de Meta son estáticos (System User Token "nunca expira") y no necesitan refresh dinámico.
- Mantenerlos solo en Netlify reduce la superficie de exposición: si un atacante roba un dump de Supabase, no obtiene el token.
- Distinto a MercadoLibre, que sí necesita refresh tokens dinámicos guardados en `portal_credentials`.

## Rotación de tokens

Si en algún momento hay que rotar:

1. Generar nuevo token desde el System User (paso 1.4 arriba).
2. Actualizar `META_ACCESS_TOKEN` en Netlify.
3. Redeploy.
4. Verificar funcionamiento con `/admin/pipeline-test`.
5. Una vez confirmado, revocar el token viejo desde **System Users → Tokens generados**.

## Verificar que las variables están funcionando

Después del deploy, andá a `/admin/pipeline-test`. En la sección **"Estado de conexiones"**:
- Si Meta Ads aparece en verde con "Variables de entorno configuradas" → todo OK.
- Si aparece en rojo con "Faltan variables…" → revisar Netlify, hacer redeploy.

## NUNCA hacer

- ❌ Commitear el token en `.env.local` y hacer push.
- ❌ Pegar el token en chat con AI assistants (incluyéndome a mí).
- ❌ Guardar el token en Supabase `portal_credentials` (queda en backups en texto plano).
- ❌ Compartirlo por Slack/email/Notion.

El token sale del System User una sola vez, va directo a Netlify, y nunca más se ve.

## Evento de conversión: `Lead` vs `CompleteRegistration`

Nuestras campañas tienen `objective: 'OUTCOME_LEADS'` y el AdSet usa
`promoted_object: { pixel_id, custom_event_type: 'LEAD' }`. Eso significa
que Meta optimiza para encontrar gente que dispare el evento `Lead` del
Pixel (cuando alguien completa el form de contacto en la landing).

### ¿Cuándo usar `LEAD`?

- ✅ Form de contacto en landing (nuestro caso actual).
- ✅ Click en WhatsApp / teléfono (también dispara `Lead`).
- ✅ Cualquier "soft conversion" donde la persona deja datos para que la contactemos.

### ¿Cuándo usar `CompleteRegistration`?

- Cuando la landing pide crear una cuenta de usuario.
- Cuando el visitante completa un onboarding multi-step (ej. cuestionario de
  pre-calificación crediticia con 5+ pasos).
- Para suscripciones a newsletter / programas de membresía.

### Nuestra recomendación: mantener `LEAD`

`Lead` es el evento estándar para inmobiliaria con landing + form de contacto.
Cambiar a `CompleteRegistration` solo tendría sentido si en el futuro el flow
de la landing se vuelve más profundo (ej. "Agendá visita virtual con
cuestionario de pre-aprobación"). Mientras la landing solo tenga un form de
contacto simple, `LEAD` es lo correcto.

### Si cambiás de evento

En `lib/marketing/meta-campaign-builder.ts`, modificar:
```ts
promoted_object: {
  pixel_id: pixelId,
  custom_event_type: 'LEAD', // ← cambiar acá
}
```

Y asegurar que el Pixel + CAPI estén disparando el evento correspondiente
en la landing (ver `components/landing/MetaPixel.tsx` + `lib/marketing/meta-capi.ts`).
