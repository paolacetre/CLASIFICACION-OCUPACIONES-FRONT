/// <reference types="jasmine" />

/*
 * ReportesService real y las reglas del Resumen (evaluación, clasificación y coincidencia).
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReportRecord, classify, coincidenceScore, evaluate, gradeCounts } from './reportes.model';
import { ReportesService } from './reportes.service';

describe('Reportes: reglas del reporte', () => {
  const states = (...values: Array<'aplica' | 'propuesta_mejora' | 'requiere_ajuste' | 'no_aplica' | 'sin_dato'>) => values.map((state) => ({ state }));

  it('gives the result with the three real grades, like the verdict of the expert validation', () => {
    expect(evaluate(states('aplica', 'aplica'))).toBe('aplica');
    expect(evaluate(states('aplica', 'propuesta_mejora'))).toBe('propuesta_mejora');
    // «Requiere ajuste» (de validaciones guardadas antes) cuenta como propuesta de mejora.
    expect(evaluate(states('aplica', 'requiere_ajuste'))).toBe('propuesta_mejora');
    // Con algún No aplica, el resultado es No aplica (es lo que hace que se pidan ajustes).
    expect(evaluate(states('aplica', 'no_aplica', 'propuesta_mejora'))).toBe('no_aplica');
    expect(evaluate(states('no_aplica'))).toBe('no_aplica');
    expect(evaluate(states('sin_dato'))).toBe('sin_evaluacion');
    expect(gradeCounts(states('aplica', 'no_aplica', 'aplica', 'propuesta_mejora'))).toEqual([
      { state: 'aplica', count: 2 },
      { state: 'propuesta_mejora', count: 1 },
      { state: 'no_aplica', count: 1 }
    ]);
  });

  it('classifies by the share of «Aplica» and scores coincidence', () => {
    expect(classify(states('aplica', 'aplica', 'aplica', 'no_aplica'))).toBe('alta');
    expect(classify(states('aplica', 'no_aplica'))).toBe('media');
    expect(classify(states('aplica', 'no_aplica', 'no_aplica', 'no_aplica'))).toBe('baja');
    expect(classify([])).toBe('sin_clasificar');
    expect(coincidenceScore(states('aplica', 'propuesta_mejora', 'no_aplica', 'requiere_ajuste'))).toBe(47.5);
  });
});

describe('ReportesService', () => {
  let service: ReportesService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ReportesService, useClass: ReportesService }, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ReportesService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('splits the criteria of each submission by occupation and numbers them by family', () => {
    let records: ReportRecord[] = [];
    service.list().subscribe((value) => (records = value));
    backend.expectOne('/api/resumen').flush([
      {
        token: '12',
        instrumentoOrigen: 'I2',
        fecha: '2026-10-20T10:00:00Z',
        horaInicio: '2026-10-20T10:00:00Z',
        horaFinalizacion: '2026-10-20T11:00:00Z',
        nombreApellidos: 'Experto De Prueba',
        email: 'admin@sena.edu.co',
        telefono: '3000000001',
        departamento: 'Antioquia',
        municipio: 'Medellín',
        empresaEntidad: 'SENA',
        cargo: 'Experto temático',
        profesion: 'Ingeniero',
        sector: '',
        ocupacionCno: 'Contadores',
        codOcupacionCNO: '1111',
        codOcupacionCUOC: '11110',
        experto: 'Experto Sena',
        ocupaciones: [
          {
            codigo: '1111-12-1',
            codigoOriginal: '1111',
            nombre: 'Contadores',
            panelOrigen: 'CNO',
            respuestas: [
              { criterioId: 'nombre', estado: 'aplica', comentario: '', valor: 'Contadores' },
              { criterioId: 'area_desempeno', estado: 'aplica', comentario: '', valor: 'Finanzas' },
              { criterioId: 'funcion_1', estado: 'propuesta_mejora', comentario: 'Precisar', valor: 'Analizar' },
              { criterioId: 'funcion_2', estado: 'aplica', comentario: '', valor: 'Registrar' },
              // Contexto que no es un criterio del reporte: no entra.
              { criterioId: 'cod_ocupacion_cno', estado: 'aplica', comentario: '', valor: '1111' }
            ],
            formularioOriginal: { nivel_cualificacion: 'Nivel 1' }
          },
          {
            codigo: '11110-12-4',
            codigoOriginal: '11110',
            nombre: 'Directores',
            panelOrigen: 'CUOC',
            respuestas: [{ criterioId: 'nombre', estado: 'no_aplica', comentario: '', valor: 'Directores' }]
          }
        ],
        formularioOriginal: { observacionesExperto: 'Bien' }
      },
      { token: '10', instrumentoOrigen: 'I2', fecha: '', horaInicio: '', horaFinalizacion: '', ocupaciones: [] }
    ]);
    expect(records.map((record) => [record.id, record.group])).toEqual([
      [1, 10],
      [2, 12]
    ]);
    const [cno, cuoc] = records[1].occupations;
    expect([cno.code, cno.catalog, cno.name, cno.level]).toEqual(['1111', 'CNO', 'Contadores', 'Nivel 1']);
    expect(cno.criteria[2].id).toBe('1111-12-1::funcion_1');
    expect(cno.criteria.map((item) => [item.family, item.n, item.state])).toEqual([
      ['name', 0, 'aplica'],
      ['area', 0, 'aplica'],
      // «Con propuesta de mejora» se muestra como tal (ya no como «Parcial»).
      ['functions', 1, 'propuesta_mejora'],
      ['functions', 2, 'aplica']
    ]);
    expect(cno.evaluation).toBe('propuesta_mejora');
    expect([cuoc.code, cuoc.catalog, cuoc.evaluation]).toEqual(['11110', 'CUOC', 'no_aplica']);
    expect(records[1].evaluation).toBe('no_aplica');
    expect(records[1].observations).toBe('Bien');
  });
});
