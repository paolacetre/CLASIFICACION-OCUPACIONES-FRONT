/// <reference types="jasmine" />

/*
 * AnalisisService real: qué pide al backend al guardar un análisis y al crear
 * un nivel. Las ocupaciones salen de los dobles de CNO y CUOC, y la
 * comparativa que resulta, del doble de Comparativa.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { SESSION } from '../../shared/session';
import { ComparativaService } from '../comparativa/comparativa.service';
import { AnalysisLevel, AnalysisOccupation, AnalysisOptions } from './analisis.model';
import {
  ANALYSIS_REJECTED,
  AnalisisService,
  INVALID_LEVEL,
  INVALID_OCCUPATION_COUNT,
  LEVEL_NAME_TAKEN,
  MISSING_REQUIRED_FIELDS,
  SAVED_NOT_SENT
} from './analisis.service';

describe('AnalisisService', () => {
  let service: AnalisisService;
  let backend: HttpTestingController;

  function setup(role = 'Administrador'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalisisService, useClass: AnalisisService },
        { provide: SESSION, useValue: { role, email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(AnalisisService);
    backend = TestBed.inject(HttpTestingController);
  }

  const occupation = (code: string, catalog: 'CNO' | 'CUOC', extra: Partial<AnalysisOccupation> = {}): AnalysisOccupation => ({
    catalog,
    code,
    status: 'Activo',
    name: ` Ocupación ${code} `,
    level: 'Nivel 1',
    area: 'Salud',
    description: ' Descripción ',
    functions: [{ code: `F-${code}.01`, text: 'Planear' }],
    skills: [{ code: '42', text: 'Liderazgo' }],
    knowledge: [{ code: '79', text: 'Administración' }],
    denominations: [{ code: `D-${code}.001`, text: 'Gerente' }],
    related: [{ code: `R-${code}.01`, text: 'Relacionada escrita a mano' }],
    registeredAt: '22/09/2026',
    traceability: ' CIUO 1120 ',
    ...extra
  });

  afterEach(() => {
    backend.verify();
  });

  it('should offer the levels of the catalogue plus the ones created for Análisis, and the areas', async () => {
    setup();
    const cno = firstValueFrom(service.options('CNO'));
    const levels = backend.expectOne((request) => request.url === '/api/cno/catalogos/niveles-cualificacion');
    expect(levels.request.params.get('incluirCopias')).toBe('true');
    expect(levels.request.params.get('limit')).toBe('100');
    levels.flush({ data: [{ codCualificacion: '0', nivelesCualificacion: 'Nivel 0' }, { codCualificacion: 'C1', nivelesCualificacion: 'Nivel propio' }], total: 2, page: 1, limit: 100, totalPages: 1 });
    const options: AnalysisOptions = await cno;
    expect(options.levels).toEqual(['Nivel 0', 'Nivel propio']);
    expect(options.areas.length).toBeGreaterThan(0);

    const cuoc = firstValueFrom(service.options('CUOC'));
    const cuocLevels = backend.expectOne((request) => request.url === '/api/cuoc/niveles-competencia');
    expect(cuocLevels.request.params.get('incluirCopias')).toBe('true');
    cuocLevels.flush([{ codNivel: 1, nombreNivel: 'Nivel 1' }, { codNivel: 1001, nombreNivel: 'Nivel propio CUOC' }]);
    expect((await cuoc).levels).toEqual(['Nivel 1', 'Nivel propio CUOC']);
  });

  it('should create a level only for Análisis in the catalogue it belongs to', () => {
    setup();
    let level: AnalysisLevel | undefined;
    service.createLevel('CNO', { name: ' Nivel propio ', description: ' Para pruebas ' }).subscribe((result) => (level = result));
    const cno = backend.expectOne('/api/cno/catalogos/niveles-cualificacion/copias');
    expect(cno.request.method).toBe('POST');
    expect(cno.request.body).toEqual({ nombre: 'Nivel propio', descripcion: 'Para pruebas' });
    cno.flush({ codCualificacion: 'C1', nivelesCualificacion: 'Nivel propio', descripcion: 'Para pruebas', esCopia: true });
    expect(level).toEqual({ code: 'C1', catalog: 'CNO', name: 'Nivel propio', description: 'Para pruebas' });

    service.createLevel('CUOC', { name: 'Nivel CUOC', description: '' }).subscribe((result) => (level = result));
    backend.expectOne('/api/cuoc/niveles-competencia/copias').flush({ codNivel: 1001, nombreNivel: 'Nivel CUOC', descripcion: null });
    expect(level).toEqual({ code: '1001', catalog: 'CUOC', name: 'Nivel CUOC', description: '' });

    const errors: string[] = [];
    const fail = (e: Error) => errors.push(e.message);
    // Sin nombre o con una descripción demasiado larga no se llama al servidor.
    service.createLevel('CNO', { name: '  ', description: '' }).subscribe({ error: fail });
    service.createLevel('CNO', { name: 'Largo', description: 'x'.repeat(1001) }).subscribe({ error: fail });
    service.createLevel('CNO', { name: 'Nivel 0', description: '' }).subscribe({ error: fail });
    backend.expectOne('/api/cno/catalogos/niveles-cualificacion/copias').flush({ message: 'Ya existe' }, { status: 409, statusText: 'Conflict' });
    expect(errors).toEqual([INVALID_LEVEL, INVALID_LEVEL, LEVEL_NAME_TAKEN]);
  });

  it('should save the edited copies in the three slots of the backend and return the comparison it created', fakeAsync(() => {
    setup();
    const comparativa = TestBed.inject(ComparativaService);
    const invalidate = spyOn(comparativa, 'invalidate').and.callThrough();
    let id = 0;
    service.save([occupation('2111', 'CNO'), occupation('01100', 'CUOC')]).subscribe((comparison) => (id = comparison.id));

    const request = backend.expectOne('/api/analisis/guardar');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.panelSeleccionado).toBe('left');
    expect(request.request.body.relacion).toBeNull();
    // Las fechas no viajan: la copia conserva las de la ocupación original.
    expect(request.request.body.cno).toEqual({
      codigo: '2111',
      nombre: 'Ocupación 2111',
      descripcion: 'Descripción',
      nivelCualificacion: 'Nivel 1',
      areaDesempeno: 'Salud',
      estado: 'Activo',
      trazabilidad: 'CIUO 1120',
      funciones: [{ codigo: 'F-2111.01', descripcion: 'Planear' }],
      denominaciones: [{ codigo: 'D-2111.001', nombre: 'Gerente' }],
      habilidades: [{ codigo: '42', nombre: 'Liderazgo' }],
      conocimientos: [{ codigo: '79', nombre: 'Administración' }],
      ocupacionesRelacionadas: [{ codigo: 'R-2111.01', nombre: 'Relacionada escrita a mano' }]
    });
    // El segundo espacio se llama "cuoc" pero es solo una posición.
    expect(request.request.body.cuoc.codigo).toBe('01100');
    // La comparativa creada es el instrumento 2 que responde el servidor (aquí, una del doble de Comparativa).
    request.flush({ instrumentoId: 3, comparativaCodigo: 9, paneles: [] });
    tick();

    expect(id).toBe(3);
    expect(invalidate).toHaveBeenCalled();

    // Con tres ocupaciones, la tercera va en "relacion".
    service.save([occupation('2111', 'CNO'), occupation('2112', 'CNO'), occupation('01100', 'CUOC')]).subscribe();
    const three = backend.expectOne('/api/analisis/guardar');
    expect([three.request.body.cno.codigo, three.request.body.cuoc.codigo, three.request.body.relacion.codigo]).toEqual(['2111', '2112', '01100']);
    three.flush({ instrumentoId: 3 });
    tick();
  }));

  it('should also leave the comparison in Instrumento 2, and say when it was saved but not sent', fakeAsync(() => {
    setup();
    const comparativa = TestBed.inject(ComparativaService);
    let status = '';
    service.sendToInstrument2([occupation('2111', 'CNO'), occupation('01100', 'CUOC')]).subscribe((comparison) => (status = comparison.status));
    backend.expectOne('/api/analisis/guardar').flush({ instrumentoId: 3 });
    tick(MOCK_LATENCY_MS);
    expect(status).toBe('En Instrumento 2');

    // La comparativa 4 del doble ya la tiene el experto: el segundo paso falla, pero el análisis ya se guardó.
    let error = '';
    service.sendToInstrument2([occupation('2111', 'CNO'), occupation('01100', 'CUOC')]).subscribe({ error: (e: Error) => (error = e.message) });
    backend.expectOne('/api/analisis/guardar').flush({ instrumentoId: 4 });
    tick(MOCK_LATENCY_MS);
    expect(error).toBe(SAVED_NOT_SENT);
    expect(comparativa).toBeTruthy();
  }));

  it('should refuse an incomplete analysis before calling the server, and translate the server refusal', () => {
    setup();
    const errors: string[] = [];
    const fail = (e: Error) => errors.push(e.message);
    service.save([occupation('2111', 'CNO')]).subscribe({ error: fail });
    service.save([occupation('2111', 'CNO'), occupation('01100', 'CUOC', { description: '  ' })]).subscribe({ error: fail });
    backend.expectNone('/api/analisis/guardar');

    service.save([occupation('2111', 'CNO'), occupation('01100', 'CUOC')]).subscribe({ error: fail });
    backend
      .expectOne('/api/analisis/guardar')
      .flush({ message: { message: 'Ninguno de los códigos proporcionados corresponde a una ocupación CNO o CUOC existente.' } }, { status: 400, statusText: 'Bad Request' });
    expect(errors).toEqual([INVALID_OCCUPATION_COUNT, MISSING_REQUIRED_FIELDS, ANALYSIS_REJECTED]);
  });

  it('should export what is on screen as a CSV built in the browser', async () => {
    setup();
    const file = await firstValueFrom(service.export([occupation('2111', 'CNO', { name: 'Con "comillas"' })]));
    expect(file.fileName).toBe('analisis-ocupaciones.csv');
    const csv = await file.blob.text();
    expect(csv).toContain('"Catálogo";"Código";"Ocupación"');
    expect(csv).toContain('"CNO";"2111";"Con ""comillas"""');
    expect(csv).toContain('"F-2111.01 Planear"');
  });
});
