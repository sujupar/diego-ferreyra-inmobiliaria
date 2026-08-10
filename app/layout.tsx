import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diego Ferreyra Inmobiliaria",
  description: "Plataforma de gestión inmobiliaria — Tasaciones, Pipeline, Marketing",
};

/**
 * Viewport del sistema móvil.
 *
 * `viewportFit: 'cover'` deja que la app llegue hasta los bordes físicos del
 * teléfono (es lo que necesita el chat a pantalla completa). Se adopta JUNTO con
 * `env(safe-area-inset-*)` en `app/globals.css` y con el `pb-[var(--safe-b)]` de
 * todo lo que quede pegado a un borde: sin las dos mitades, el compositor y el
 * pie de los paneles se irían debajo de la barra de gestos del iPhone.
 *
 * `interactiveWidget: 'resizes-content'` hace que en Chrome Android el teclado
 * ACHIQUE el viewport de layout en vez de taparlo. iOS lo ignora — por eso
 * además existe `hooks/use-viewport-height.ts`, que mide el viewport visual.
 *
 * NO lleva `maximumScale` ni `userScalable`: bloquear el zoom es una falla de
 * accesibilidad. Si alguien los agrega para "que no se descuadre", el problema
 * real es un control con fuente menor a 16px (ver la regla de los 16px en
 * globals.css), no el zoom.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
