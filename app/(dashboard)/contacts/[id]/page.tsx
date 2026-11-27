import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { enlaceVolver } from '@/lib/crm/cartera-url'
import { FichaContacto } from '@/components/crm/ficha/FichaContacto'
import { ContactoNoEncontrado, SinAcceso } from '@/components/crm/ficha/Pantallas'

// Ficha de un contacto (crm-ficha-y-llamadas, D5). Componente de SERVIDOR: decide el
// permiso (el menú no es la barrera) y le pasa a `FichaContacto` SOLO datos planos: el
// id, el rol, el id del usuario, el booleano `abrirEditor` y el "Volver" ya validado. Un
// ícono, un componente o una función como prop de servidor a cliente deja la pantalla en
// blanco, y ningún test lo detecta (CLAUDE.md, menú lateral 2026-08-07).
//
// `?edit=1` se lee ACÁ (no con `useSearchParams`, que en Next 16 obliga a un <Suspense> y
// fallaría recién en el build de Netlify). Lo usa `/tasks` para las tareas `update_contact`
// ligadas solo a un contacto.
//
// `?volver=` (crm-cartera-por-rol, D11): lo pone cada fila del CRM y de Contactos. Viene
// de la dirección, o sea de cualquiera: `enlaceVolver` acepta SOLO `/crm` o `/contacts` de
// esta plataforma (si no, la ficha sería un redirector abierto). Inválido → sin enlace.
export default async function FichaContactoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string | string[]; volver?: string | string[]; registrar?: string | string[] }>
}) {
  const user = await requireAuth()
  if (alcanceContactos(user.profile.role) === 'ninguno') return <SinAcceso />
  const [{ id }, sp] = await Promise.all([params, searchParams])
  // Para un asesor, uno ajeno y uno inexistente ven lo mismo. Para el resto, que no exista
  // lo dice la ruta de la ficha (404) y la pantalla muestra lo mismo.
  if (!(await canAccessContact(user, id))) return <ContactoNoEncontrado />
  const v = enlaceVolver(typeof sp.volver === 'string' ? sp.volver : null)
  return (
    <FichaContacto
      key={id}
      contactoId={id}
      rol={user.profile.role}
      usuarioId={user.id}
      abrirEditor={sp.edit === '1'}
      // El "Registrar" del Inicio: la ficha arranca con "Registrar llamada" abierto (crm-inicio, D4).
      abrirLlamada={sp.registrar === '1'}
      // El "‹" de la spec es el ícono de la flecha (FichaCabecera); el texto es "Volver al CRM".
      volver={v ? { href: v.href, texto: v.texto } : null}
    />
  )
}
