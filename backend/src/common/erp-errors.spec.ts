import {
  ERP_CONNECTION_ERROR_MESSAGE,
  isAlreadyImportedError,
  userFacingErpError,
} from './erp-errors';

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

  it('reconoce el rechazo de documento ya importado', () => {
    expect(
      isAlreadyImportedError(
        'Siesa rechazó el pedido (ventas/pedidos-subproductos-porcino): (301-SPP-00012470) Documento pedido: El documento no fue procesado porque ya fue actualizado por otra importación.',
      ),
    ).toBe(true);
    expect(isAlreadyImportedError('El número de la O.C. ya existe')).toBe(
      false,
    );
    expect(isAlreadyImportedError(null)).toBe(false);
  });
});
