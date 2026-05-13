import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
    title: "Política de Privacidad · Diego Ferreyra Inmobiliaria",
    description:
        "Política de Privacidad de Diego Ferreyra Inmobiliaria — qué datos recolectamos, con qué finalidad, cómo los protegemos y cómo ejercer tus derechos.",
    robots: { index: true, follow: true },
}

const CONTACT_EMAIL = "contacto.julianparra@gmail.com"

export default function PrivacidadPage() {
    return (
        <main className="mx-auto max-w-3xl px-6 py-16 text-neutral-800">
            <header className="mb-10 border-b border-neutral-200 pb-6">
                <p className="text-sm uppercase tracking-widest text-neutral-500">
                    Diego Ferreyra Inmobiliaria · Martillero Público CUCICBA 8266
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
                    Política de Privacidad
                </h1>
                <p className="mt-3 text-sm text-neutral-500">
                    Última actualización: 13 de mayo de 2026
                </p>
            </header>

            <section className="prose prose-neutral max-w-none space-y-6 text-base leading-relaxed">
                <p>
                    Esta Política describe cómo Diego Ferreyra Inmobiliaria
                    (en adelante, "nosotros") recolecta, utiliza, almacena y protege los datos
                    personales de quienes interactúan con nuestros sitios web, formularios
                    publicitarios en Meta (Facebook e Instagram), WhatsApp y canales de
                    contacto. Esta política cumple con la{" "}
                    <span className="font-medium">
                        Ley 25.326 de Protección de los Datos Personales
                    </span>{" "}
                    de la República Argentina.
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    1. Responsable del tratamiento
                </h2>
                <p>
                    Diego Ferreyra, Martillero Público inscripto en CUCICBA bajo matrícula 8266,
                    con domicilio en la Ciudad Autónoma de Buenos Aires, Argentina. Para
                    cualquier consulta podés escribirnos a{" "}
                    <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                        {CONTACT_EMAIL}
                    </a>
                    .
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    2. Datos que recolectamos
                </h2>
                <ul className="list-disc space-y-1 pl-6">
                    <li>
                        <span className="font-medium">Datos de contacto</span>: nombre y apellido,
                        email, teléfono, ciudad o zona de tu propiedad.
                    </li>
                    <li>
                        <span className="font-medium">Datos de la propiedad</span>: dirección,
                        tipo, superficie, valor estimado, condiciones de venta — sólo cuando vos
                        nos los suministrás voluntariamente para solicitar una tasación o
                        cotización.
                    </li>
                    <li>
                        <span className="font-medium">Datos de navegación</span>: eventos del
                        Píxel de Meta y otras cookies analíticas (vista de página, clicks,
                        finalización de formulario).
                    </li>
                    <li>
                        <span className="font-medium">Datos de comunicación</span>: mensajes que
                        nos envíes por email, WhatsApp, formularios o redes sociales.
                    </li>
                </ul>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    3. Finalidades del tratamiento
                </h2>
                <p>Usamos tus datos exclusivamente para:</p>
                <ul className="list-disc space-y-1 pl-6">
                    <li>
                        Brindarte el servicio que pediste (tasación, asesoramiento, gestión de
                        venta o compra).
                    </li>
                    <li>
                        Contactarte por email, WhatsApp o teléfono respecto de tu consulta.
                    </li>
                    <li>
                        Optimizar nuestras campañas publicitarias en Meta y mejorar la
                        experiencia en nuestros sitios.
                    </li>
                    <li>
                        Generar audiencias personalizadas y similares (lookalike) en Meta Ads a
                        partir de información agregada y/o hasheada.
                    </li>
                </ul>
                <p>
                    No vendemos ni alquilamos tus datos personales a terceros.
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    4. Compartición con terceros
                </h2>
                <p>
                    Tus datos pueden ser procesados por proveedores de tecnología que actúan en
                    nuestro nombre, bajo acuerdos de confidencialidad y tratamiento de datos:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                    <li>
                        <span className="font-medium">Meta Platforms</span> (Facebook, Instagram,
                        Lead Forms y Pixel) para gestión de campañas publicitarias.
                    </li>
                    <li>
                        <span className="font-medium">Proveedores de email transaccional</span>{" "}
                        (Resend) para enviarte respuestas y notificaciones.
                    </li>
                    <li>
                        <span className="font-medium">Proveedores de CRM y base de datos</span>{" "}
                        (Supabase, GoHighLevel) para gestionar internamente tu consulta.
                    </li>
                </ul>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    5. Plazo de conservación
                </h2>
                <p>
                    Conservamos tus datos por el tiempo necesario para cumplir las finalidades
                    descriptas o las obligaciones legales y contables aplicables. Cuando dejes
                    de ser cliente o solicites la eliminación de tus datos, los suprimiremos
                    según el procedimiento de la sección 7.
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    6. Tus derechos
                </h2>
                <p>
                    Podés ejercer en cualquier momento tus derechos de acceso, rectificación,
                    actualización y supresión de tus datos personales, escribiéndonos a{" "}
                    <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                        {CONTACT_EMAIL}
                    </a>
                    . El titular de los datos personales tiene la facultad de ejercer el derecho
                    de acceso de forma gratuita a intervalos no inferiores a seis meses, salvo
                    que se acredite un interés legítimo al efecto, conforme lo establecido en el
                    artículo 14, inciso 3 de la Ley 25.326.
                </p>
                <p>
                    La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de
                    Control de la Ley 25.326, tiene la atribución de atender las denuncias y
                    reclamos que interpongan quienes resulten afectados en sus derechos por
                    incumplimiento de las normas vigentes en materia de protección de datos
                    personales.
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    7. Eliminación de tus datos
                </h2>
                <p>
                    Detalle completo del procedimiento de eliminación, plazos y alcance en
                    nuestra página de{" "}
                    <Link
                        href="/eliminacion-de-datos"
                        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    >
                        Eliminación de datos de usuario
                    </Link>
                    .
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    8. Seguridad
                </h2>
                <p>
                    Aplicamos medidas técnicas y organizativas razonables para proteger tus
                    datos contra accesos no autorizados, pérdida o alteración. Aun así, ninguna
                    transmisión por Internet es 100% segura — en caso de cualquier incidente que
                    pueda afectar a tus datos, te notificaremos de acuerdo con la normativa
                    vigente.
                </p>

                <h2 className="mt-10 text-xl font-semibold text-neutral-900">
                    9. Cambios en esta política
                </h2>
                <p>
                    Esta política puede actualizarse para reflejar cambios legales o
                    tecnológicos. La versión vigente siempre será la publicada en esta página,
                    con la fecha de última actualización indicada arriba.
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
