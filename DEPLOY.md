# 🚀 Guía Rápida de Despliegue en Netlify

## ⚠️ Error Actual

Si ves este error:
```
Your project's URL and Key are required to create a Supabase client!
```

**Causa:** Las variables de entorno de Supabase no están configuradas en Netlify.

---

## ✅ Solución en 4 Pasos

### 1️⃣ Ir a Variables de Entorno en Netlify

1. Abre tu sitio en [Netlify Dashboard](https://app.netlify.com/)
2. Clic en **Site configuration** (menú izquierdo)
3. Clic en **Environment variables**
4. Clic en **Add a variable**

### 2️⃣ Obtener Credenciales de Supabase

Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard):

1. **Settings** (⚙️ icono en menú lateral)
2. **API**
3. Copia estos valores:

| Variable Netlify | Valor de Supabase | Ubicación |
|-----------------|-------------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key | Sección "Project API keys" |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret ⚠️ | Sección "Project API keys" (click "Reveal") |

### 3️⃣ Obtener API Key de Gemini

1. Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Crea o copia tu API key
3. Agrégala en Netlify como `GEMINI_API_KEY`

### 4️⃣ Agregar en Netlify

Para cada variable:

1. **Add a variable**
2. **Key:** (nombre exacto de la tabla arriba)
3. **Value:** (pega el valor copiado)
4. **Scopes:** Deja "All scopes" seleccionado
5. **Create variable**

**Total: 4 variables a agregar**

---

## 🔄 Redesplegar

Después de agregar las 4 variables:

**Opción A - Automático:**
```bash
git commit --allow-empty -m "trigger deploy" && git push
```

**Opción B - Manual:**
1. En Netlify Dashboard
2. **Deploys** → **Trigger deploy** → **Deploy site**

---

## ✅ Verificación

Tu sitio debería funcionar correctamente. Si no:

1. **Revisa que las 4 variables existan** en Netlify
2. **Verifica mayúsculas/minúsculas** (deben ser exactas)
3. **Comprueba que no haya espacios** al inicio/final de los valores
4. **Espera a que termine el deploy** (1-3 minutos)

---

## 📝 Checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` agregada
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` agregada
- [ ] `SUPABASE_SERVICE_ROLE_KEY` agregada ⚠️
- [ ] `GEMINI_API_KEY` agregada
- [ ] Deploy triggereado
- [ ] Sitio funcionando ✅

---

## 🆘 Ayuda Adicional

Si sigues teniendo problemas:

1. Verifica los **logs de build** en Netlify → Deploys → [último deploy] → Deploy log
2. Asegúrate de que tu **proyecto Supabase esté activo**
3. Revisa que las **API keys no hayan expirado**

**Documentación completa:** Ver `NETLIFY_SETUP.md`
