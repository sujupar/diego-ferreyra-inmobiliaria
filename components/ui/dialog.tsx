"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          // TECHO DE ALTURA + SCROLL PROPIO. Sin esto el diálogo se recorta arriba y
          // abajo y no queda NADA que scrollear (Radix bloquea el scroll del body
          // mientras está abierto): 10 de los 13 diálogos del sistema dejaban el botón
          // de guardar fuera de la pantalla en un teléfono, y con el teclado abierto
          // era directamente inalcanzable. Se mide contra `--app-vh` —el alto REAL
          // visible, que publica `hooks/use-viewport-height.ts`— y no contra `vh`, que
          // en iOS es el viewport grande y miente ~110px.
          // Los 3 diálogos que ya traen su propio `max-h-*` siguen mandando: `cn()` es
          // tailwind-merge y la clase del consumidor pisa a la de acá.
          "max-h-[calc(var(--app-vh)-2rem)] overflow-y-auto overscroll-contain",
          // Por debajo de 640px deja de ser una tarjeta flotante y pasa a ser una hoja
          // anclada al borde inferior: se alcanza con el pulgar y queda una franja de
          // overlay arriba para cerrar tocando afuera.
          //
          // Es `max-sm:` y no `max-md:` por una razón verificada compilando el CSS de
          // verdad: Tailwind emite las variantes `max-*` ANTES que las `sm:`/`md:`, así
          // que un `max-md:max-w-none` perdería contra el `sm:max-w-lg` de arriba entre
          // 640 y 767px y quedaría una hoja a medio anclar. Con `max-sm:` los dos rangos
          // son excluyentes y el resultado es determinístico. Los teléfonos de
          // referencia (390 / 360 / 320px) caen todos de este lado.
          "max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none",
          "max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none",
          // La barra de gestos del iPhone se come el borde de abajo desde que hay
          // `viewport-fit=cover`. No usa la utilidad `pb-safe` (12px) porque acá el piso
          // ya lo pone el `p-6` del propio diálogo.
          "max-sm:pb-[max(1.5rem,var(--safe-b))]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Cerrar"
            // El área tocable era la del ícono (16px). En celular sube a 44px sin
            // agrandar el dibujo: la caja crece, la X sigue midiendo 16. El
            // `data-slot` además engancha el halo de `@media (pointer: coarse)` de
            // globals.css.
            className="absolute top-4 right-4 flex items-center justify-center rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground max-md:top-2 max-md:right-2 max-md:size-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
