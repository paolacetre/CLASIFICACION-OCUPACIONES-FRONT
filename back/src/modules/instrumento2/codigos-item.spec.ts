import { codigoItem, ordenarPorSecuencia, secuenciaDeCodigo } from './codigos-item';

describe('codigos-item · códigos de función y denominación', () => {
  describe('secuenciaDeCodigo', () => {
    it.each([
      ['1222-7-1-D12', 12],
      ['1222-7-1-F3', 3],
      ['F-0011.01', 1],
      ['D-0011.010', 10],
      ['01100.004', 4],
      ['7', 7],
    ])('lee la secuencia de "%s" → %d', (codigo, esperado) => {
      expect(secuenciaDeCodigo(codigo)).toBe(esperado);
    });

    it('devuelve null si el código no tiene números o no existe', () => {
      expect(secuenciaDeCodigo('sin-numero')).toBeNull();
      expect(secuenciaDeCodigo(null)).toBeNull();
      expect(secuenciaDeCodigo(undefined)).toBeNull();
    });
  });

  describe('ordenarPorSecuencia', () => {
    it('ordena numéricamente, no como texto (D1, D2, D10 y no D1, D10, D2)', () => {
      const items = ['X-D10', 'X-D2', 'X-D1', 'X-D11'].map((codigo) => ({ codigo }));
      expect(ordenarPorSecuencia(items, (i) => i.codigo).map((i) => i.codigo)).toEqual([
        'X-D1',
        'X-D2',
        'X-D10',
        'X-D11',
      ]);
    });

    it('deja al final los ítems sin secuencia y conserva el orden en empates', () => {
      const items = [{ c: 'sin' }, { c: 'A-2' }, { c: 'B-1' }, { c: 'C-1' }];
      expect(ordenarPorSecuencia(items, (i) => i.c).map((i) => i.c)).toEqual(['B-1', 'C-1', 'A-2', 'sin']);
    });

    it('no modifica el arreglo original', () => {
      const items = [{ c: '2' }, { c: '1' }];
      ordenarPorSecuencia(items, (i) => i.c);
      expect(items.map((i) => i.c)).toEqual(['2', '1']);
    });
  });

  describe('codigoItem', () => {
    it('funciones a 2 dígitos y denominaciones a 3, como el catálogo CNO', () => {
      expect(codigoItem('F', '0112', 1)).toBe('F-0112.01');
      expect(codigoItem('F', '0112', 12)).toBe('F-0112.12');
      expect(codigoItem('D', '0112', 3)).toBe('D-0112.003');
      expect(codigoItem('D', '01100', 120)).toBe('D-01100.120');
    });
  });
});
