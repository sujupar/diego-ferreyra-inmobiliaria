/**
 * Project ID de Microsoft Clarity (mapa de calor + grabaciones de las landings).
 * Es un valor PÚBLICO (va en el script del cliente). Se puede overridear por la
 * env `NEXT_PUBLIC_CLARITY_PROJECT_ID`; si no, usa el ID del proyecto del cliente.
 */
export const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 'xa61mzhqr8'
