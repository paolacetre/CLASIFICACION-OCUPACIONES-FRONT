/// <reference types="jasmine" />

import { analyzeSheets, normalizeHeader } from './carga-correlativa.excel';

describe('carga-correlativa.excel', () => {
  const denominationHeaders = [
    'Código ocupación CNO',
    'Código denominación CNO',
    'Descripción denominación CNO',
    'Código ocupación CUOC',
    'Código denominación CUOC',
    'Descripción denominación CUOC',
    'Estado',
    'Observación'
  ];

  it('normalizes headers like the backend', () => {
    expect(normalizeHeader('  Código   Ocupación-CNO ')).toBe('codigo ocupacion cno');
  });

  it('accepts an occupation file with the header row below a title and counts its rows', () => {
    const analysis = analyzeSheets(
      [
        {
          name: 'Correlativa',
          rows: [
            ['Correlativa CNO - CUOC'],
            [],
            ['Código ocupación CNO', 'Nombre ocupación CNO', 'Código ocupación CUOC', 'Nombre ocupación CUOC'],
            ['0011', 'Miembros del poder ejecutivo', '11110', 'Directores formuladores'],
            [null, null, null, null],
            ['0012', 'Personal directivo', '11120', 'Directores del gobierno']
          ]
        }
      ],
      'ocupacion'
    );
    expect(analysis.ok).toBeTrue();
    expect(analysis.sheet).toBe('Correlativa');
    expect(analysis.totalRows).toBe(2);
    expect(analysis.ignored).toEqual([]);
    expect(analysis.columns.map((column) => column.key)).toEqual(['codOcupacionCno', 'nombOcupacionCno', 'codOcupacionCuoc', 'nombOcupacionCuoc']);
    expect(analysis.sample[1]).toEqual({ codOcupacionCno: '0012', nombOcupacionCno: 'Personal directivo', codOcupacionCuoc: '11120', nombOcupacionCuoc: 'Directores del gobierno' });
  });

  it('lists the columns that do not belong to the chosen type (as the deployed version does)', () => {
    const analysis = analyzeSheets([{ name: 'Hoja1', rows: [denominationHeaders] }], 'ocupacion');
    expect(analysis.ok).toBeTrue();
    expect(analysis.totalRows).toBe(0);
    // La observación también es una columna de la carga de ocupaciones (backend nuevo), así que se lee.
    expect(analysis.ignored).toEqual([
      'Código denominación CNO',
      'Descripción denominación CNO',
      'Código denominación CUOC',
      'Descripción denominación CUOC',
      'Estado'
    ]);
  });

  it('rejects a file without the required columns and suggests the type it matches', () => {
    const analysis = analyzeSheets([{ name: 'Hoja1', rows: [denominationHeaders, ['0011', '0011.001', 'Alcalde', '11110', '11110.001', 'Alcalde', 'Activo', '']] }], 'conocimiento');
    expect(analysis.ok).toBeFalse();
    expect(analysis.missing.map((column) => column.key)).toEqual(['codConocimientoCno', 'codConocimientoCuoc']);
    expect(analysis.looksLike).toBe('denominacion');
  });

  it('swaps CUOC denomination and occupation codes when they come inverted', () => {
    const analysis = analyzeSheets([{ name: 'Hoja1', rows: [denominationHeaders, ['0011', '0011.001', 'Alcalde', '11110.001', '11110', 'Alcalde', 'Activo', '']] }], 'denominacion');
    expect(analysis.sample[0]['codOcupacionCuoc']).toBe('11110');
    expect(analysis.sample[0]['codDenominacionCuoc']).toBe('11110.001');
  });
});
