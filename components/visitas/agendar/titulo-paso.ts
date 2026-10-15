/**
 * Lugar para la X de cerrar de la ventana de agendar. En celular la X se agranda a
 * 44 px (arriba a la derecha) y pisa lo que esté ARRIBA del contenido: el título del
 * paso (o el aviso/cargando que lo reemplaza). Solo eso lleva el margen — antes
 * estaba en todo el contenido y le comía 40 px a cada fila de la lista de
 * interesados en una pantalla de 360 px (revisión final, grupo F).
 */
export const LUGAR_PARA_LA_X = 'max-md:pr-16'

/** Clases del `<h2>` de cada paso (el foco va ahí al cambiar de paso: `tabIndex={-1}`). */
export const CLASE_TITULO_PASO = 'text-xl font-semibold outline-none max-md:pr-16'
