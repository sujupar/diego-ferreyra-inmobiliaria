// Medidas de los controles de la ficha (maqueta `base.css`, `--ctl` y `--tap`).
// 44 px en toda pantalla táctil; 36 px solo con mouse (`raton:`, globals.css). No se
// decide por el ancho: una tablet táctil de 1024 px también necesita los 44 px (D6).
export const ALTO_CONTROL = 'h-11 raton:h-9'
export const ALTO_MINIMO_CONTROL = 'min-h-11 raton:min-h-9'
// Campos de texto: 16 px en táctil (si no, iPhone hace zoom al enfocar), 14 px con mouse.
export const LETRA_CAMPO = 'text-base raton:text-sm'

// Listas del CRM (crm-cartera-por-rol, D10 y spec "La cartera en el celular"): 44 px y 16 px
// en el celular y en toda pantalla táctil; 36 px y 14 px SOLO con mouse desde 768 px. Con
// mouse en una ventana angosta se sigue viendo el diseño del celular, entero.
export const ALTO_CONTROL_LISTA = 'h-11 md:raton:h-9'
export const ALTO_MINIMO_LISTA = 'min-h-11 md:raton:min-h-9'
export const LETRA_CAMPO_LISTA = 'text-base md:raton:text-sm'
