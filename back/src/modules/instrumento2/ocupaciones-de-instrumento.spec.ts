import { Instrumento } from './entities/instrumento.entity';
import {
  codigoRealDeCopia,
  codigosOcupacionesDeInstrumento,
  ocupacionDeItem,
  panelDeOcupacion,
} from './ocupaciones-de-instrumento';

/** Instrumento mínimo con los slots de su comparativa. */
function instrumento(
  slots: Partial<{
    cno: string;
    cno2: string;
    cno3: string;
    cuoc: string;
    cuoc2: string;
    cuoc3: string;
  }>,
  ocupacion = slots.cno ?? slots.cuoc ?? '',
): Instrumento {
  return {
    idInstrumento: 9,
    ocupacion,
    comparativaOcupacion: {
      codigo: 9,
      ocupacionCno: slots.cno ? { codOcupacionCno: slots.cno } : undefined,
      codOcupacionCno2: slots.cno2 ?? null,
      codOcupacionCno3: slots.cno3 ?? null,
      ocupacionCuoc: slots.cuoc ? { codOcupacionCuoc: slots.cuoc } : undefined,
      codOcupacionCuoc2: slots.cuoc2 ?? null,
      codOcupacionCuoc3: slots.cuoc3 ?? null,
    },
  } as unknown as Instrumento;
}

describe('ocupaciones-de-instrumento', () => {
  describe('codigosOcupacionesDeInstrumento', () => {
    it('tres ocupaciones CNO, en el orden de sus slots', () => {
      const row = instrumento({ cno: '5113-9-1', cno2: '6212-9-2', cno3: '9112-9-3' });
      expect(codigosOcupacionesDeInstrumento(row)).toEqual(['5113-9-1', '6212-9-2', '9112-9-3']);
    });

    it('solo CUOC', () => {
      const row = instrumento({ cuoc: '01100-4-1', cuoc2: '01200-4-2' });
      expect(codigosOcupacionesDeInstrumento(row)).toEqual(['01100-4-1', '01200-4-2']);
    });

    it('combinadas: primero CNO y luego CUOC', () => {
      const row = instrumento({ cno: '1121-4-1', cuoc: '01100-4-2', cno2: '2138-4-3' });
      expect(codigosOcupacionesDeInstrumento(row)).toEqual(['1121-4-1', '2138-4-3', '01100-4-2']);
    });

    it('una sola ocupación', () => {
      expect(codigosOcupacionesDeInstrumento(instrumento({ cno: '1121-4-1' }))).toEqual(['1121-4-1']);
    });

    it('no repite códigos y limpia espacios', () => {
      const row = instrumento({ cno: ' 1121-4-1 ', cno2: '1121-4-1' });
      expect(codigosOcupacionesDeInstrumento(row)).toEqual(['1121-4-1']);
    });

    it('sin comparativa (instrumentos antiguos) usa la ocupación del instrumento', () => {
      const row = { idInstrumento: 1, ocupacion: '0112-3' } as Instrumento;
      expect(codigosOcupacionesDeInstrumento(row)).toEqual(['0112-3']);
    });
  });

  describe('ocupacionDeItem', () => {
    const row = instrumento({ cno: '1121-4-1', cno2: '2138-4-2' });

    it('respeta la ocupación del ítem', () => {
      expect(ocupacionDeItem('2138-4-2', row)).toBe('2138-4-2');
    });

    it('sin ocupación (datos anteriores a la migración 028) es la principal', () => {
      expect(ocupacionDeItem(null, row)).toBe('1121-4-1');
      expect(ocupacionDeItem('  ', row)).toBe('1121-4-1');
    });
  });

  describe('panelDeOcupacion', () => {
    const row = instrumento({ cno: '1121-4-1', cuoc: '01100-4-2' });

    it('distingue el catálogo por el slot', () => {
      expect(panelDeOcupacion(row, '1121-4-1')).toBe('CNO');
      expect(panelDeOcupacion(row, '01100-4-2')).toBe('CUOC');
    });
  });

  describe('codigoRealDeCopia', () => {
    it.each([
      ['0112-14', 14, '0112'],
      ['0112-14-2', 14, '0112'],
      ['01100-7-1', 7, '01100'],
      // El panel coincide con el número de la comparativa: antes salía "1123-3"
      ['1123-3-3', 3, '1123'],
      // Sufijo desfasado de registros históricos: corta en el primer guion
      ['0212-26', 25, '0212'],
      ['0112', 14, '0112'],
    ])('"%s" (comparativa %d) → "%s"', (codigo, comparativa, esperado) => {
      expect(codigoRealDeCopia(codigo, comparativa)).toBe(esperado);
    });

    it('sin código devuelve vacío', () => {
      expect(codigoRealDeCopia(null, 3)).toBe('');
    });
  });
});
