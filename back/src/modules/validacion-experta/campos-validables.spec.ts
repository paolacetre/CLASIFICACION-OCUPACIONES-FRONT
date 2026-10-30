import { camposValidablesDeSnapshot, claveCampo } from './campos-validables';

/**
 * Fija la regla de ids. El front la replica (front/.../campos-snapshot.ts) y
 * tiene su propio test con los MISMOS casos: si cambia en un lado y no en el
 * otro, ningún cierre de validación vuelve a pasar.
 */
describe('camposValidablesDeSnapshot', () => {
  const items = [
    { identificador: 'nombre', cod: 'A-1' },
    { identificador: 'funcion', cod: 'A-1' },
    { identificador: 'funcion', cod: 'A-1' },
    { identificador: 'trazabilidad', cod: 'A-1' },
    { identificador: 'nombre', cod: 'B-1' },
    { identificador: 'funcion', cod: 'B-1' },
    { identificador: 'funcion', cod: 'B-1' },
    { identificador: 'funcion', cod: 'B-1' },
    { identificador: 'observacion', cod: 'A-1' },
  ];

  it('numera las listas por ocupación y deja sin número los campos únicos', () => {
    const campos = camposValidablesDeSnapshot(items, (i) => i.cod);
    expect(campos.map((c) => claveCampo(c.codOcupacion, c.campo))).toEqual([
      'A-1::nombre',
      'A-1::funcion_1',
      'A-1::funcion_2',
      'B-1::nombre',
      'B-1::funcion_1',
      'B-1::funcion_2',
      'B-1::funcion_3',
    ]);
  });

  it('excluye los campos de contexto que no se califican', () => {
    const campos = camposValidablesDeSnapshot(items, (i) => i.cod).map((c) => c.campo);
    expect(campos).not.toContain('trazabilidad');
    expect(campos).not.toContain('observacion');
  });

  it('una lista de un solo ítem no se numera', () => {
    const campos = camposValidablesDeSnapshot([{ identificador: 'funcion' }], () => 'A');
    expect(campos).toEqual([{ codOcupacion: 'A', campo: 'funcion' }]);
  });
});
