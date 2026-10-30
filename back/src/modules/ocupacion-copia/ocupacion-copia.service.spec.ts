import { OcupacionCopiaService } from './ocupacion-copia.service';

describe('OcupacionCopiaService · extraerCodigoOriginal', () => {
  const service = new OcupacionCopiaService();

  it.each([
    ['2113-23-1', 23, '2113'],
    ['2113-23', 23, '2113'],
    // El panel coincide con el número de la comparativa: antes devolvía "1123-3"
    ['1123-3-3', 3, '1123'],
    ['0012-5-2', 5, '0012'],
  ])('"%s" (comparativa %d) → "%s"', (codigo, comparativa, esperado) => {
    expect(service.extraerCodigoOriginal(codigo, comparativa)).toBe(esperado);
  });

  it('un código que no es copia de esa comparativa se devuelve tal cual', () => {
    expect(service.extraerCodigoOriginal('2113', 23)).toBe('2113');
    expect(service.extraerCodigoOriginal('2113-9-1', 23)).toBe('2113-9-1');
  });

  it('sin comparativa no recorta nada', () => {
    expect(service.extraerCodigoOriginal('2113-23-1', null)).toBe('2113-23-1');
  });
});
