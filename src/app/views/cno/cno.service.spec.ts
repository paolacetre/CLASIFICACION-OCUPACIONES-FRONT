/// <reference types="jasmine" />

/*
 * CnoService real: qué pide al backend y cómo traduce sus respuestas al modelo de la vista.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CnoFilterOptions, CnoOccupationDetail, CnoPage } from './cno.model';
import { CnoService, OCCUPATION_NOT_FOUND, isActiveState } from './cno.service';

describe('CnoService', () => {
  let service: CnoService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: CnoService, useClass: CnoService }, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CnoService);
    backend = TestBed.inject(HttpTestingController);
  });
  afterEach(() => backend.verify());

  const page = <T>(data: T[]) => ({ data, total: data.length, page: 1, limit: 100, totalPages: 1 });

  it('should load the level and area catalogues in one page each', () => {
    let levels: string[] = [];
    let areas: string[] = [];
    service.catalogs().subscribe((catalogs) => {
      levels = catalogs.levels.map((level) => `${level.id}:${level.name}`);
      areas = catalogs.areas.map((area) => `${area.id}:${area.name}`);
    });
    const levelsRequest = backend.expectOne((request) => request.url === '/api/cno/catalogos/niveles-cualificacion');
    expect(levelsRequest.request.params.get('limit')).toBe('100');
    levelsRequest.flush(page([{ codCualificacion: 'Nivel 1 (A)', nivelesCualificacion: 'Profesionales', descripcion: null }]));
    backend.expectOne((request) => request.url === '/api/cno/catalogos/areas-desempeno').flush(page([{ codDesempeno: '3', nomDesempeno: 'Salud', descripcion: 'Área de salud' }]));

    expect(levels).toEqual(['Nivel 1 (A):Profesionales']);
    expect(areas).toEqual(['3:Salud']);
  });

  it('should offer the filter options: levels by their code (filtering by name), areas and functions', () => {
    let options: CnoFilterOptions | undefined;
    service.filterOptions().subscribe((result) => (options = result));
    backend.expectOne((request) => request.url === '/api/cno/catalogos/niveles-cualificacion').flush(
      page([
        { codCualificacion: 'Nivel 2 (B)', nivelesCualificacion: 'Técnicos y supervisores', descripcion: null },
        { codCualificacion: 'Nivel 1 (A)', nivelesCualificacion: 'Profesionales, Dirección y Gerencia', descripcion: null },
        { codCualificacion: 'C1', nivelesCualificacion: 'Copia de Análisis', descripcion: null, esCopia: true }
      ])
    );
    backend.expectOne((request) => request.url === '/api/cno/catalogos/areas-desempeno').flush(page([{ codDesempeno: '3', nomDesempeno: 'Salud', descripcion: null }]));
    backend.expectOne('/api/cno/funciones/opciones').flush([{ codigo: 'F-2111.01', nombre: 'Diseñar investigaciones' }]);

    expect(options?.levels).toEqual([
      { value: 'Profesionales, Dirección y Gerencia', label: 'Nivel 1 (A)' },
      { value: 'Técnicos y supervisores', label: 'Nivel 2 (B)' }
    ]);
    expect(options?.areas).toEqual([{ value: 'Salud', label: 'Salud' }]);
    expect(options?.functions).toEqual([{ value: 'F-2111.01', label: 'F-2111.01 · Diseñar investigaciones' }]);
  });

  it('should keep the other filters when one list of options fails', () => {
    let options: CnoFilterOptions | undefined;
    service.filterOptions().subscribe((result) => (options = result));
    backend.expectOne((request) => request.url === '/api/cno/catalogos/niveles-cualificacion').flush(page([]));
    backend.expectOne((request) => request.url === '/api/cno/catalogos/areas-desempeno').flush(page([{ codDesempeno: '3', nomDesempeno: 'Salud', descripcion: null }]));
    backend.expectOne('/api/cno/funciones/opciones').flush(null, { status: 500, statusText: 'Error' });
    expect(options?.functions).toEqual([]);
    expect(options?.areas.length).toBe(1);
  });

  it('should send text, filters, page and order to the consult endpoint, leaving out the empty ones', () => {
    let result: CnoPage | undefined;
    service
      .search({ query: ' fisic ', level: 'Profesionales', area: '', status: '', function: 'F-2111.01', page: 2, pageSize: 25, sort: 'name', ascending: false })
      .subscribe((value) => (result = value));

    const request = backend.expectOne((req) => req.url === '/api/cno/ocupaciones/consulta');
    const params = request.request.params;
    expect(params.keys().sort()).toEqual(['direccion', 'funcion', 'limit', 'nivel', 'orden', 'page', 'q']);
    expect([params.get('q'), params.get('nivel'), params.get('funcion'), params.get('page'), params.get('limit'), params.get('orden'), params.get('direccion')]).toEqual([
      'fisic', 'Profesionales', 'F-2111.01', '2', '25', 'nombre', 'DESC'
    ]);
    request.flush({
      data: [
        {
          codigo: '2111',
          nombre: 'Físicos y astrónomos',
          codNivelCualificacion: 'Nivel 1 (A)',
          nivelCualificacion: 'Profesionales',
          areaDesempeno: null,
          estado: 'Activo',
          denominaciones: 27,
          funciones: 5,
          habilidades: 5,
          conocimientos: 5
        }
      ],
      total: 5,
      page: 2,
      limit: 25,
      totalPages: 1
    });

    expect(result?.total).toBe(5);
    expect(result?.items[0]).toEqual({
      code: '2111',
      name: 'Físicos y astrónomos',
      level: 'Profesionales',
      levelCode: 'Nivel 1 (A)',
      area: '',
      status: 'Activo',
      registeredAt: '',
      denominationsCount: 27,
      functionsCount: 5,
      skillsCount: 5,
      knowledgeCount: 5
    });
  });

  it('should translate the occupation profile, with the code and the state of each component', () => {
    let detail: CnoOccupationDetail | undefined;
    service.detail('2111').subscribe((result) => (detail = result));
    backend.expectOne('/api/cno/ocupaciones/2111').flush({
      codOcupacionCno: '2111',
      nombOcupacionCno: 'Físicos y astrónomos',
      descripcion: 'Dirigen investigaciones.',
      nomDesempeno: 'Ciencias Naturales',
      nivelesCualificacion: 'Profesionales',
      estado: false,
      fechaRegistro: null,
      fechaInactivacion: '2026-01-10',
      trazabilidad: null,
      codAnteOcupacionCno: '2111-X',
      areaDesempeno: { codDesempeno: '2', nomDesempeno: 'Ciencias Naturales, Aplicadas y Relacionadas', descripcion: null },
      nivelCualificacion: { codCualificacion: 'Nivel 1 (A)', nivelesCualificacion: 'Profesionales', descripcion: 'Nivel 1 (A): funciones complejas.' },
      denominaciones: [
        { codDenominacionCno: 'D-2111.001', descDenominacion: 'Geofísico', estado: 1, fechaReg: '2026-10-19' },
        { codDenominacionCno: 'D-2111.002', descDenominacion: 'Astrólogo', estado: 0, fechaReg: null }
      ],
      funciones: [
        { codigo: 'F-2111.01', descFuncionCno: 'Diseñar investigaciones', estado: 1 },
        { codigo: 'F-2111.02', descFuncionCno: 'Calibrar telescopios', estado: 'Inactivo' }
      ],
      habilidades: [{ nombHabDest: 'Comprensión de lectura', habilidadDestreza: { codHabDest: 1 } }],
      conocimientos: [{ nombConocimiento: 'Física', conocimiento: { codConocimiento: 15 } }],
      relacionadas: [{ codigoOcupacion: '2114', nombreCnoRelacionada: 'Meteorólogos' }]
    });

    expect(detail).toEqual(
      jasmine.objectContaining({
        code: '2111',
        status: 'Inactivo',
        level: 'Profesionales',
        levelCode: 'Nivel 1 (A)',
        area: 'Ciencias Naturales, Aplicadas y Relacionadas',
        areaCode: '2',
        levelDescription: 'Nivel 1 (A): funciones complejas.',
        registeredAt: '',
        inactiveAt: '10/01/2026',
        previousCode: '2111-X',
        denominations: [
          { code: 'D-2111.001', text: 'Geofísico', active: true, registeredAt: '19/10/2026' },
          { code: 'D-2111.002', text: 'Astrólogo', active: false, registeredAt: '' }
        ],
        functions: [
          { code: 'F-2111.01', text: 'Diseñar investigaciones', active: true },
          { code: 'F-2111.02', text: 'Calibrar telescopios', active: false }
        ],
        skills: [{ code: '1', text: 'Comprensión de lectura', active: true }],
        knowledge: [{ code: '15', text: 'Física', active: true }],
        related: [{ code: '2114', name: 'Meteorólogos' }],
        denominationsCount: 2
      })
    );
    expect(detail && 'occupationalField' in detail).toBeFalse();
  });

  it('should read the state of a function or denomination as the backend sends it', () => {
    expect([1, true, 'Activo', '1', null, undefined, ''].map(isActiveState)).toEqual([true, true, true, true, true, true, true]);
    expect([0, false, 'Inactivo', 'inactiva', '0', 'false'].map(isActiveState)).toEqual([false, false, false, false, false, false]);
  });

  it('should answer OCCUPATION_NOT_FOUND when the server says 404', () => {
    let error = '';
    service.detail('zzzz').subscribe({ error: (e: Error) => (error = e.message) });
    backend.expectOne('/api/cno/ocupaciones/zzzz').flush({ statusCode: 404 }, { status: 404, statusText: 'Not Found' });
    expect(error).toBe(OCCUPATION_NOT_FOUND);
  });
});
