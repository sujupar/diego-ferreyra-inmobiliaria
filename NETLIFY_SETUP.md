# Configuración de Variables de Entorno en Netlify

Para que la aplicación funcione correctamente en Netlify, necesitas configurar las siguientes variables de entorno:

## Paso 1: Acceder a Configuración de Netlify

1. Ve a tu sitio en Netlify Dashboard
2. Navega a **Site configuration → Environment variables**
3. Haz clic en **Add a variable**

## Paso 2: Agregar Variables de Supabase

### NEXT_PUBLIC_SUPABASE_URL
- **Key:** `NEXT_PUBLIC_SUPABASE_URL`
- **Value:** Tu URL de proyecto Supabase (ejemplo: `https://xxxxx.supabase.co`)
- **Scope:** All scopes
- ℹ️ Encuentra esto en: [Supabase Dashboard](https://supabase.com/dashboard) → Tu Proyecto → Settings → API → Project URL

### NEXT_PUBLIC_SUPABASE_ANON_KEY
- **Key:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value:** Tu clave anónima/pública de Supabase
- **Scope:** All scopes
- ℹ️ Encuentra esto en: Supabase Dashboard → Tu Proyecto → Settings → API → Project API keys → `anon` `public`

### SUPABASE_SERVICE_ROLE_KEY
- **Key:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** Tu clave de servicio de Supabase
- **Scope:** All scopes
- ⚠️ **MUY IMPORTANTE:** Esta clave es secreta. Encuentra esto en: Supabase Dashboard → Tu Proyecto → Settings → API → Project API keys → `service_role` `secret`

## Paso 3: Agregar Variable de Gemini AI

### GEMINI_API_KEY
- **Key:** `GEMINI_API_KEY`
- **Value:** Tu API key de Google Gemini
- **Scope:** All scopes
- ℹ️ Obtén tu API key en: [Google AI Studio](https://makersuite.google.com/app/apikey)

## Paso 4: Redesplegar

Después de agregar todas las variables:

1. Guarda los cambios
2. Ve a **Deploys**
3. Haz clic en **Trigger deploy → Deploy site**

O simplemente haz un nuevo push a tu repositorio de GitHub y Netlify desplegará automáticamente.

## Verificación

Una vez desplegado, la aplicación debería funcionar correctamente. Si ves el mismo error, verifica que:

- ✅ Las variables estén escritas exactamente como se indica (respetando mayúsculas)
- ✅ Los valores sean correctos (copia-pega desde Supabase/Gemini)
- ✅ Las variables con prefijo `NEXT_PUBLIC_` estén disponibles en el cliente
- ✅ El deploy se haya completado después de agregar las variables

## Troubleshooting

Si aún tienes problemas:

1. Verifica los logs de build en Netlify
2. Asegúrate de que tu proyecto Supabase esté activo
3. Revisa que las API keys no hayan expirado
4. Comprueba que el plan de Netlify soporte variables de entorno (debería ser automático)

## Desarrollo Local

Para desarrollo local, crea un archivo `.env.local` en la raíz del proyecto:

```bash
cp .env.example .env.local
```

Y completa con tus valores reales.
