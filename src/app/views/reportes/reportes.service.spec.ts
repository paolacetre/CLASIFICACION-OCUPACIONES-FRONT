/// <reference types="jasmine" />

/*
 * ReportesService real y las reglas del Resumen (evaluación, clasificación y coincidencia).
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReportRecord, classify, coincidenceScore, evaluate } from './reportes.model';
import { ReportesService } from './reportes.service';

describe('Reportes: reglas de la versión desplegada', () => {
  const states = (...values: Array<'aplica' | 'parcial' | 'requiere_ajuste' | 'no_aplica' | 'sin_dato'>) => values.map((state) => ({ state }));

  it('evaluates like evaluarCriterios', () => {
    expect(evaluate(states('aplica', 'aplica'))).toBe('aprobado');
    expect(evaluate(states('aplica', 'parcial'))).toBe('con_mejoras');
    expect(evaluate(states('aplica', 'requiere_ajuste'))).toBe('con_mejoras');
    expect(evaluate(states('aplica', 'no_aplica', 'parcial'))).toBe('parcial');
    expect(evaluate(states('no_aplica', 'parcial'))).toBe('no_aprobado');
    expect(evaluate(states('sin_dato'))).toBe('sin_evaluacion');
  });

  it('classifies by the share of «Aplica» and scores coincidence', () => {
    expect(classify(states('aplica', 'aplica', 'aplica', 'no_aplica'))).toBe('alta');
    expect(classify(states('aplica', 'no_aplica'))).toBe('media');
    expect(classify(states('aplica', 'no_aplica', 'no_aplica', 'no_aplica'))).toBe('baja');
    expect(classify([])).toBe('sin_clasificar');
    expect(coincidenceScore(states('aplica', 'parcial', 'no_aplica', 'requiere_ajuste'))).toBe(47.5);
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
      ['functions', 1, 'parcial'],
      ['functions', 2, 'aplica']
    ]);
    expect(cno.evaluation).toBe('con_mejoras');
    expect([cuoc.code, cuoc.catalog, cuoc.evaluation]).toEqual(['11110', 'CUOC', 'no_aprobado']);
    expect(records[1].evaluation).toBe('parcial');
    expect(records[1].observations).toBe('Bien');
  });
});
