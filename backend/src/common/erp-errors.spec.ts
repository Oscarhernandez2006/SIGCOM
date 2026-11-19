import { ERP_CONNECTION_ERROR_MESSAGE, userFacingErpError } from './erp-errors';

describe('userFacingErpError', () => {
  it('reemplaza las fallas técnicas por el aviso para el usuario', () => {
    for (const m of [
      'The origin web server returned an invalid or incomplete response to Cloudflare.',
      'Request failed with status code 502',
      'timeout of 60000ms exceeded',
      '<!DOCTYPE html><html>…',
      '',
      undefined,
    ]) {
      expect(userFacingErpError(m)).toBe(ERP_CONNECTION_ERROR_MESSAGE);
    }
  });

  it('conserva los rechazos de Siesa porque dicen qué corregir', () => {
    const m =
      'Siesa rechazó el pedido (ventas/pedidos-opn): el tercero vendedor no existe';
    expect(userFacingErpError(m)).toBe(m);
  });
});
