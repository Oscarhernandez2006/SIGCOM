import { getOrderDocTypes, isNamNamDocType } from './companies';

describe('Ñam Ñam · tipo de documento en Siesa', () => {
  it('reconoce OPÑ aunque la Ñ llegue mal codificada', () => {
    expect(isNamNamDocType('OPÑ')).toBe(true);
    expect(isNamNamDocType(' opñ ')).toBe(true);
    expect(isNamNamDocType('OPN')).toBe(true);
    expect(isNamNamDocType('OP?')).toBe(true);
    expect(isNamNamDocType('OPÃ‘')).toBe(true);
  });

  it('no confunde los documentos de cortes y subproductos', () => {
    for (const t of ['PVA', 'SPB', 'SPP', 'OP', 'OPA', '', null, undefined]) {
      expect(isNamNamDocType(t)).toBe(false);
    }
  });

  it('solo Agropecuaria consulta los estados de OPÑ', () => {
    expect(getOrderDocTypes('3')).toEqual(['PVA', 'SPB', 'SPP', 'OPÑ']);
    expect(getOrderDocTypes('8')).toEqual(['PVA']);
    expect(getOrderDocTypes('MTAT')).toEqual(['PVA', 'SPB', 'SPP']);
  });
});
