/**
 * Precio de una propiedad de COMPRA. Auditoría del 2026-10-03 (B4): si el
 * aviso no traía precio, el asistente armaba los escenarios con
 * `prop.price || 100000` — un USD 100.000 inventado que terminaba en el PDF
 * como "Publicación USD 100.000" y en la "diferencia en mano" del cliente.
 * Ahora una propiedad sin precio válido no se puede marcar hasta cargárselo.
 */
export function precioDeCompraValido(precio: number | null | undefined): number | null {
    return typeof precio === 'number' && Number.isFinite(precio) && precio > 0 ? precio : null
}
