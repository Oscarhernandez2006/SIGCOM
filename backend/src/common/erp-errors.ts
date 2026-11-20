/** Mensaje para el usuario cuando falla la comunicación con Siesa. */
export const ERP_CONNECTION_ERROR_MESSAGE =
  'Problemas para enviar su pedido. Comuníquese con el departamento de ' +
  'Tecnología y Desarrollo de Grupo Santacruz.';

/**
 * Mensaje que se guarda en el pedido y ve el usuario cuando falla la subida a
 * Siesa. Los rechazos de Siesa ("Siesa rechazó el pedido…") se conservan porque
 * indican qué corregir (vendedor, fecha, O.C.); las fallas técnicas (Cloudflare,
 * 502/504, tiempos de espera, respuestas HTML) se reemplazan por un aviso claro.
 * El detalle técnico queda en los logs del servidor.
 */
export function userFacingErpError(message: string | null | undefined): string {
  const text = (message ?? '').trim();
  if (/^siesa rechaz/i.test(text)) return text;
  return ERP_CONNECTION_ERROR_MESSAGE;
}

/**
 * Rechazo de Siesa porque el documento YA existe ("ya fue actualizado por
 * otra importación"): un envío anterior sí entró aunque su respuesta se
 * perdió (p. ej. por Cloudflare). No es un consecutivo repetido.
 */
export function isAlreadyImportedError(
  message: string | null | undefined,
): boolean {
  return /actualizado por otra importaci/i.test(message ?? '');
}
