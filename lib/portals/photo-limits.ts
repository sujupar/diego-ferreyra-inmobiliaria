/**
 * Máximo de fotos que cada portal acepta POR AVISO.
 *
 * Se aplican al armar el payload — NUNCA sobre properties.photos. Truncar la
 * columna compartida fue el bug original: el wizard de ML persistía
 * slice(0, 12) y cada propiedad que pasaba por él quedaba con 12 fotos PARA
 * SIEMPRE, en todos los portales, la landing y Meta.
 *
 * ML: settings.max_pictures_per_item = 30, verificado el 2026-08-06 contra la
 * API real para nuestras categorías. scripts/verify-ml-categories.ts lo
 * re-verifica en cada corrida: si ML lo baja, ese script falla antes de que un
 * aviso salga rechazado.
 *
 * Módulo sin imports a propósito: lo consumen componentes cliente (StepImages)
 * y código de servidor por igual.
 */
export const ML_MAX_FOTOS_AVISO = 30
export const AP_MAX_FOTOS_AVISO = 30
