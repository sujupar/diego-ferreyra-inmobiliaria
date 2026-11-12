# Recuperar contraseña — diseño (2026-11-12)

## Problema
Diego Ferreyra perdió su contraseña y no pudo recuperarla: la plataforma no tiene
pantalla para pedir un enlace ni para elegir una contraseña nueva. El enlace que manda
Supabase lo conectaba y lo dejaba en el login, sin dónde cambiarla. Hubo que ponerle una
contraseña temporal a mano.

## Resultado esperado
Cualquier usuario recupera el acceso solo, desde el login, sin que nadie del equipo
intervenga.

## Qué ve el usuario
1. **Login** (`/login`): debajo del botón "Ingresar", un enlace "¿Olvidaste tu contraseña?".
2. **Pedir enlace** (`/recuperar-contrasena`): campo email + botón "Enviarme el enlace".
   Al enviar SIEMPRE muestra lo mismo: "Si ese email tiene una cuenta, te mandamos un
   enlace. Vence en 1 hora. Revisá también la carpeta de spam." (no revela si el email
   existe). Enlace "Volver al login".
3. **Email** (Resend, desde `inmodf.com.ar`, en castellano): "Restablecé tu contraseña",
   botón "Elegir contraseña nueva", aviso de que vence en 1 hora y de que si no lo pidió
   lo ignore.
4. **Elegir contraseña** (`/restablecer-contrasena?token_hash=…`): "Contraseña nueva" +
   "Repetí la contraseña", botón "Guardar y entrar". Al guardar, entra directo a la
   plataforma. Si el enlace venció o ya se usó: "Este enlace venció o ya se usó" + botón
   "Pedir un enlace nuevo".
   Reglas de la contraseña: mínimo 8 caracteres, máximo 72, las dos iguales.

## Qué pasa por detrás
- `POST /api/auth/recuperar-contrasena` (pública): valida el email con Zod, genera el
  enlace con `auth.admin.generateLink({type:'recovery'})` (NO manda nada por Supabase) y
  manda el email propio por Resend. No manda si: el usuario no existe, está desactivado
  (`profiles.is_active=false`) o ya recibió 3 enlaces en los últimos 15 minutos (contado
  en `email_notifications_log`, así sobrevive entre instancias). La respuesta es idéntica
  en todos los casos.
- El enlace usa la URL fija de la app (`NEXT_PUBLIC_APP_URL`, default
  `https://inmodf.com.ar`), **nunca el Host del request**: si no, alguien podría pedir un
  reset con un Host falso y el email llevaría el token a un dominio ajeno.
- El email de recuperación **ignora el modo prueba**: un enlace que da acceso a una cuenta
  solo puede llegar al dueño de esa cuenta.
- El token se canjea recién al tocar "Guardar" (`verifyOtp` con `token_hash`), no al abrir
  la página: los antivirus de correo abren los enlaces antes que la persona y quemarían un
  enlace de un solo uso. Funciona aunque el email se abra en otro dispositivo (no depende
  de nada guardado en el navegador que lo pidió).
- Al guardar se cierran las demás sesiones abiertas de esa cuenta.
- Se cambia la plantilla de recuperación de Supabase (Management API) para que, si alguien
  manda el reset desde el Dashboard, también lleve a esta pantalla y en castellano.

## Queda afuera
- Cambiar la contraseña desde adentro de la plataforma (perfil).
- Login sin contraseña / enlace mágico.

## Criterios de aceptación
1. En `/login` aparece "¿Olvidaste tu contraseña?" y lleva a `/recuperar-contrasena`.
2. Con un email registrado, llega un email en castellano desde `inmodf.com.ar` y queda
   una fila `password_reset` con `status='sent'` en `email_notifications_log`.
3. Con un email que no existe, la pantalla muestra el mismo mensaje y no se manda nada.
4. El enlace abre `/restablecer-contrasena` sin pedir login; con contraseñas distintas o
   cortas, se avisa y no se guarda.
5. Al guardar, la persona entra a la plataforma y la contraseña nueva sirve en el login;
   la vieja no.
6. Un enlace ya usado (o inventado) muestra "Este enlace venció o ya se usó" con el botón
   para pedir otro.
7. El 4.º pedido en 15 minutos para el mismo email no manda nada.
8. Celular (390 px): las tres pantallas se ven bien y sin scroll horizontal.

## Riesgos anotados (pre-flight)
- Middleware cerrado por defecto: hay que agregar las 2 páginas y la ruta de API a las
  listas públicas, o redirigen al login (el mismo síntoma de hoy).
- La vista previa usa la base real: el QA se hace sobre el usuario "Claude · pruebas".
- Sin migración, sin env vars nuevas, sin IA.
