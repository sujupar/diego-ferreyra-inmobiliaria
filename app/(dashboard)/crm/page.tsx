import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth/get-user'
import { traducirParametrosViejos } from '@/lib/crm/cartera-url'
import { cargarCartera, leerOpcionesVerComo, type DatosCartera } from '@/lib/supabase/cartera'
import { CarteraCRM } from '@/components/crm/cartera/CarteraCRM'
import { SinAccesoLista } from '@/components/crm/cartera/SinAcceso'
import { TEXTO_PERSONA_INVALIDA } from '@/components/crm/cartera/textos'

// El CRM (crm-cartera-por-rol, D4 y D6). Componente de SERVIDOR: decide la vista por el
// rol de la sesión (el menú no es la barrera), lee la cartera con el MISMO servicio que la
// ruta `/api/crm/cartera` y le pasa a `CarteraCRM` SOLO datos planos. Un ícono, un
// componente o una función como prop de servidor a cliente deja la plataforma en blanco
// (CLAUDE.md, menú lateral 2026-08-07).
//
// `ver` (la persona de "Ver como") se lee de la dirección. A un asesor o una coordinadora
// que abren un enlace del dueño se les IGNORA: ven su propia vista, sin leer nada de la
// otra persona. Al dueño con una persona inválida se le arma su vista con el aviso.

export const dynamic = 'force-dynamic'

// 8 s + el plazo de 15 s de la segunda lectura = 23 s, debajo del techo de Netlify (~26 s).
const MARGEN_PARA_OTRA_LECTURA_MS = 8_000

// Fuera del componente: la página es de servidor y corre una vez por pedido, pero la regla
// de pureza de React no distingue. Medir el tiempo del pedido es justamente lo buscado.
function relojDeMargen(): () => boolean {
  const inicio = Date.now()
  return () => Date.now() - inicio < MARGEN_PARA_OTRA_LECTURA_MS
}

type Busqueda = Record<string, string | string[] | undefined>

function aParams(sp: Busqueda): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') p.append(k, v)
    else if (Array.isArray(v)) for (const x of v) p.append(k, x)
  }
  return p
}

export default async function CRMPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const user = await getUser()
  if (!user) redirect('/login')
  const quien = { id: user.id, role: user.profile.role }
  if (quien.role === 'abogado') redirect('/properties/review')
  if (!user.profile.is_active) return <SinAccesoLista titulo="No tenés acceso al CRM" />

  const params = aParams(await searchParams)
  // Un marcador guardado de la pantalla vieja: se traduce ANTES de leer nada. `redirect`
  // tira, así que no puede ir dentro del try de abajo.
  const traducida = traducirParametrosViejos(params)
  if (traducida) redirect(`/crm?${traducida.toString()}`)

  const esDueno = quien.role === 'admin' || quien.role === 'dueno'
  const pedido = (params.get('ver') ?? '').trim()
  const ver = esDueno && pedido ? pedido : null
  const ahora = new Date()

  let inicial: DatosCartera | null = null
  let aviso: string | null = null
  let opciones: { id: string; etiqueta: string }[] | null = null
  let sinVista = false
  let fallo = false
  // El plazo de 15 s de `cargarCartera` es POR LECTURA. Una segunda lectura encadenada a
  // una lenta pasaba el techo de Netlify (~26 s) y la persona veía un 504 en HTML en vez
  // del error de la pantalla con "Reintentar" (revisión adversarial, 9.1). Por eso la
  // segunda lectura solo se hace si la primera dejó margen; si no, la pantalla muestra el
  // error y "Reintentar" pide la ruta, que hace una sola lectura.
  const quedaMargen = relojDeMargen()
  try {
    let r = await cargarCartera({ quien, verComo: ver }, ahora)
    if (!r.ok && r.motivo === 'persona_invalida') {
      aviso = TEXTO_PERSONA_INVALIDA
      r = quedaMargen() ? await cargarCartera({ quien, verComo: null }, ahora) : r
    }
    if (r.ok) {
      inicial = r.datos
      opciones = r.datos.opcionesVerComo
    } else if (r.motivo !== 'persona_invalida') sinVista = true
  } catch (e) {
    fallo = true
    console.error('[/crm] no se pudo leer la cartera', e)
  }
  // Un rol sin vista (`agent`, `viewer`, uno nuevo): ni un dato.
  if (sinVista) return <SinAccesoLista titulo="No tenés acceso al CRM" />

  // Abierta ya mirando a otra persona (por ejemplo, al recargar): esa respuesta no trae las
  // opciones de "Ver como" (5.1), así que se leen aparte para que el selector no quede vacío.
  // Si la cartera falló o ya se usó el margen, no se lee: alcanza con la persona mirada.
  if (esDueno && !opciones && (fallo || !quedaMargen())) {
    const p = inicial?.vista.mirando ? inicial.vista.persona : null
    opciones = p ? [{ id: p.id, etiqueta: `${p.nombre} · ${p.rol === 'coordinador' ? 'coordinación' : 'asesor'}` }] : []
  }
  if (esDueno && !opciones) {
    try {
      opciones = await leerOpcionesVerComo(quien)
    } catch (e) {
      console.error('[/crm] no se pudieron leer las opciones de "Ver como"', e)
      const p = inicial?.vista.mirando ? inicial.vista.persona : null
      opciones = p ? [{ id: p.id, etiqueta: `${p.nombre} · ${p.rol === 'coordinador' ? 'coordinación' : 'asesor'}` }] : []
    }
  }

  return <CarteraCRM inicial={inicial} rol={quien.role} opcionesVerComo={esDueno ? opciones : null} avisoInicial={aviso} />
}
