import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
    title: "Eliminación de datos de usuario · Diego Ferreyra Inmobiliaria",
    description:
        "Cómo solicitar la eliminación de tus datos personales recolectados por Diego Ferreyra Inmobiliaria, incluyendo datos provenientes de Facebook / Instagram Ads y Meta Lead Forms.",
    robots: { index: true, follow: true },
}

const CONTACT_EMAIL = "contacto.julianparra@gmail.com"
const SUBJECT = "Solicitud de eliminación de datos personales"

export default function EliminacionDeDatosPage() {
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}`

    return (
        <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-800">
            <header className="mb-10 border-b border-neutral-200 pb-6">
                <p className="text-sm uppercase tracking-widest text-neutral-500">
                    Diego Ferreyra Inmobiliaria · Martillero Público CUCICBA 8266
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                    Eliminación de datos de usuario
                </h1>
                <p className="mt-3 text-sm text-neutral-500">
                    Última actualización: 13 de mayo de 2026
                </p>
            </header>

            <section className="prose prose-neutral max-w-none space-y-6 text-base leading-relaxed">
                <p>
                    En Diego Ferreyra Inmobiliaria respetamos tu derecho de acceso, rectificación
                    y supresión de los datos personales que hayamos recolectado, conforme a la
                    Ley 25.326 de Protección de los Datos Personales de la República Argentina y
                    a las políticas de Meta Platforms para anunciantes que utilizan Facebook
                    Ads, Instagram Ads, Pixel de Meta y Lead Forms (Formularios Instantáneos).
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    ¿Qué datos recolectamos?
                </h2>
                <p>
                    Podemos haber recolectado tus datos a través de uno o más de los siguientes
                    canales:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                    <li>
                        Formularios de tasación o contacto en{" "}
                        <span className="font-medium">inmobiliariadiegoferreyra.com</span> o
                        landings asociadas.
                    </li>
                    <li>
                        Formularios Instantáneos de Meta (Facebook / Instagram Ads) en los que
                        completaste tu nombre, email, teléfono y/o ciudad.
                    </li>
                    <li>
                        Eventos del Píxel de Meta sobre tu navegación en nuestras páginas (vistas,
                        clicks, completar formulario).
                    </li>
                    <li>
                        Mensajes que nos enviaste por WhatsApp, email o redes sociales (Facebook,
                        Instagram).
                    </li>
                </ul>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    ¿Cómo solicitar la eliminación?
                </h2>
                <p>Tenés dos formas de hacerlo:</p>
                <ol className="list-decimal space-y-2 pl-6">
                    <li>
                        <span className="font-medium">Por email</span> a{" "}
                        <a
                            href={mailto}
                            className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        >
                            {CONTACT_EMAIL}
                        </a>
                        , con el asunto{" "}
                        <span className="font-medium">"{SUBJECT}"</span>.
                    </li>
                    <li>
                        <span className="font-medium">Por WhatsApp</span> al teléfono que figura
                        en nuestro sitio o redes oficiales, indicando que querés ejercer tu
                        derecho de supresión.
                    </li>
                </ol>
                <p>Para procesar tu pedido necesitamos que nos indiques al menos:</p>
                <ul className="list-disc space-y-1 pl-6">
                    <li>Tu nombre y apellido.</li>
                    <li>El email o teléfono con el que te contactamos.</li>
                    <li>
                        Si recordás, la fuente (formulario Meta Ads, landing, contacto directo,
                        etc.) y la fecha aproximada.
                    </li>
                </ul>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    Plazo y alcance
                </h2>
                <p>
                    Una vez recibida la solicitud, eliminaremos tus datos personales de nuestros
                    sistemas dentro de los <span className="font-medium">30 días corridos</span>,
                    incluyendo registros en nuestro CRM, listas de remarketing y audiencias
                    personalizadas creadas en Meta a partir de tu información.
                </p>
                <p>
                    La eliminación incluye los datos que nos diste directamente y las
                    coincidencias en audiencias personalizadas en Meta Ads. Conservaremos
                    únicamente la información mínima necesaria por obligación legal o contable
                    (por ejemplo, comprobantes de operaciones inmobiliarias ya cerradas), por el
                    plazo que la normativa argentina exija.
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    Eliminación desde Facebook / Instagram
                </h2>
                <p>
                    Si interactuaste con un Formulario Instantáneo de Meta y querés eliminar tus
                    datos también desde Meta, podés hacerlo desde la configuración de tu cuenta
                    de Facebook o Instagram, en{" "}
                    <span className="font-medium">
                        Configuración → Tu información en Facebook → Acceder a tu información
                    </span>
                    , o contactando directamente a Meta.
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    Más información
                </h2>
                <p>
                    Consultá nuestra{" "}
                    <Link
                        href="/privacidad"
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                        Política de Privacidad
                    </Link>{" "}
                    para más detalle sobre qué información tratamos, con qué finalidad y por
                    cuánto tiempo.
                </p>
            </section>

            <footer className="mt-16 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
                <p>
                    Diego Ferreyra · Martillero Público · CUCICBA 8266 · Ciudad Autónoma de
                    Buenos Aires, Argentina.
                </p>
            </footer>
        </main>
    )
}
