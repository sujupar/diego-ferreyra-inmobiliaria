import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    normalizarEmail,
    construirEnlaceRestablecer,
    superaLimiteDeEnvios,
    VENTANA_LIMITE_MS,
} from '@/lib/auth/recuperar-contrasena'
import { notifyPasswordReset, TIPO_NOTIFICACION_RESET } from '@/lib/email/notifications/password-reset'
import { contarEnviosRecientes } from '@/lib/email/log'

/**
 * Pide el enlace para elegir una contraseña nueva. Pública (ver API_PUBLICAS en
 * lib/supabase/middleware.ts): la llama alguien que perdió el acceso.
 *
 * La respuesta es SIEMPRE la misma, exista o no el email. Si respondiera distinto,
 * esta ruta serviría para averiguar qué emails tienen cuenta en el CRM.
 *
 * El enlace lo genera Supabase con `generateLink` (que NO manda nada) y el email
 * sale por Resend: el envío propio de Supabase tiene un tope de 2 emails por hora
 * para TODO el proyecto, sale en inglés y desde un dominio que cae en spam.
 */

const RESPUESTA = { ok: true }
/** Debe coincidir con `mailer_otp_exp` de la config de Auth de Supabase (3600 s). */
const VENCE_EN_MINUTOS = 60
const TIEMPO_MINIMO_MS = 2500

const Cuerpo = z.object({ email: z.string().max(320) })

export async function POST(request: NextRequest) {
    let crudo: unknown
    try {
        crudo = await request.json()
    } catch {
        return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
    }
    const parseado = Cuerpo.safeParse(crudo)
    const email = parseado.success ? normalizarEmail(parseado.data.email) : null
    if (!email) {
        return NextResponse.json({ error: 'Escribí un email válido.' }, { status: 400 })
    }

    const inicio = Date.now()
    try {
        await mandarEnlaceSiCorresponde(email)
    } catch (err) {
        // Se registra y se responde lo mismo: un error distinto delataría que el
        // email existe (solo los que existen llegan hasta el envío).
        console.error('[recuperar-contrasena] fallo inesperado:', err instanceof Error ? err.message : err)
    }
    // Mismo contenido no alcanza: un email sin cuenta vuelve enseguida y uno con
    // cuenta espera a Resend, así que midiendo el tiempo se averiguaría quién
    // tiene cuenta. Toda respuesta tarda al menos TIEMPO_MINIMO_MS (el envío real
    // mide ~1 s: p95 de Resend 0,77 s + las consultas).
    const restante = TIEMPO_MINIMO_MS - (Date.now() - inicio)
    if (restante > 0) await new Promise((r) => setTimeout(r, restante))
    return NextResponse.json(RESPUESTA)
}

async function mandarEnlaceSiCorresponde(email: string): Promise<void> {
    const admin = createAdminClient()

    // Límite por email, contado en la base: un límite en memoria no sirve en
    // serverless (cada instancia tiene la suya). Se cuentan también los fallidos:
    // son intentos igual.
    // LIMITACIÓN CONOCIDA: es "contar y después mandar", sin candado. N pedidos
    // SIMULTÁNEOS para el mismo email leen 0 y pasan todos: le llegan N emails (y
    // solo el último enlace sirve, porque cada generateLink rota el token). No da
    // acceso a nada; con ~8 cuentas internas no justificó una función atómica en
    // Postgres. Si alguna vez molesta: reservar el cupo con un INSERT antes de enviar.
    const desde = new Date(Date.now() - VENTANA_LIMITE_MS).toISOString()
    const recientes = await contarEnviosRecientes(TIPO_NOTIFICACION_RESET, email, desde)
    if (recientes === null) {
        // Falla CERRADA: sin poder contar, no se manda. La persona reintenta en un rato.
        console.error('[recuperar-contrasena] no se pudo contar envíos recientes; no se manda')
        return
    }
    if (superaLimiteDeEnvios(recientes)) {
        console.warn(`[recuperar-contrasena] límite alcanzado para ${email}; no se manda`)
        return
    }

    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
    if (error || !data?.user || !data.properties?.hashed_token) {
        // Lo normal acá es que el email no tenga cuenta. No es un error del sistema.
        console.info(`[recuperar-contrasena] sin enlace para ${email}: ${error?.message ?? 'sin datos'}`)
        return
    }

    const { data: perfil } = await admin
        .from('profiles')
        .select('full_name, is_active')
        .eq('id', data.user.id)
        .maybeSingle()
    if (perfil && perfil.is_active === false) {
        console.info(`[recuperar-contrasena] cuenta desactivada (${data.user.id}); no se manda`)
        return
    }

    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar'
    const resultado = await notifyPasswordReset({
        userId: data.user.id,
        email,
        nombre: primerNombre(perfil?.full_name ?? null),
        enlace: construirEnlaceRestablecer(base, data.properties.hashed_token),
        venceEnMinutos: VENCE_EN_MINUTOS,
    })
    if (!resultado.ok) {
        console.error('[recuperar-contrasena] el email no salió:', resultado.errors.join(' | '))
    }
}

function primerNombre(nombreCompleto: string | null): string | null {
    const primero = nombreCompleto?.trim().split(/\s+/)[0]
    return primero ? primero : null
}
