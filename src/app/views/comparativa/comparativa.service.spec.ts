/// <reference types="jasmine" />

/*
 * ComparativaService real: qué pide al backend (la bandeja de Instrumento 2) y
 * cómo traduce sus respuestas al modelo de la vista.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../../shared/session';
import { Comparison, ComparisonPage, ComparisonSummary, createEmptyQuery } from './comparativa.model';
import { COMPARISON_INCOMPLETE, COMPARISON_LOCKED, COMPARISON_NOT_FOUND, ComparativaService } from './comparativa.service';

describe('ComparativaService', () => {
  let service: ComparativaService;
  let backend: HttpTestingController;

  function setup(role = 'Administrador'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: ComparativaService, useClass: ComparativaService },
        { provide: SESSION, useValue: { role, email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ComparativaService);
    backend = TestBed.inject(HttpTestingController);
  }

  /** Una fila de `GET /api/instrumento2`: la ocupación principal y el resumen de todas. */
  const row = (id: number, estado: string, analista = 'admin@sena.edu.co') => ({
    id,
    estado,
    ocupacion: `0011-${id}-1`,
    codigoOriginal: '0011',
    panelOrigen: 'CNO',
    nombre: 'Directores generales',
    observacion: null,
    fecha: '2026-10-09T16:21:06.295Z',
    analista,
    funciones: [],
    denominaciones: [],
    habilidades: [],
    conocimientos: [],
    ocupacionesRelacionadas: [],
    ocupaciones: [
      { codigo: `0011-${id}-1`, codigoOriginal: '0011', nombre: 'Directores generales', panelOrigen: 'CNO', nivelCualificacion: 'Nivel 0', areaDesempeno: 'Dirección y Gerencia' },
      { codigo: `01100-${id}-2`, codigoOriginal: '01100', nombre: 'Oficiales de las Fuerzas Militares', panelOrigen: 'CUOC', nivelCualificacion: 'Nivel 4', areaDesempeno: null }
    ]
  });

  /** Una ocupación completa de `GET /api/instrumento2/:id/comparacion`. */
  const occupation = (estado: string, observacion: string | null) => ({
    id: 7,
    estado,
    ocupacion: '0011-7-1',
    codigoOriginal: '0011',
    panelOrigen: 'CNO',
    nombre: 'Directores generales',
    descripcion: 'Dirigen la organización.',
    nivelCualificacion: 'Nivel 0',
    codNivelCualificacion: 'N0',
    areaDesempeno: 'Dirección y Gerencia',
    fechaRegistro: '2026-09-22',
    trazabilidad: 'CIUO 1120',
    observacion,
    fecha: '2026-10-09T16:21:06.295Z',
    analista: 'admin@sena.edu.co',
    funciones: [{ codigo: 'F-0011.01', descripcion: 'Planear la operación' }],
    denominaciones: [{ codigo: 'D-0011.001', nombre: 'Gerente general' }],
    habilidades: [{ codigo: '42', nombre: 'Liderazgo' }],
    conocimientos: [{ codigo: '79', nombre: 'Administración' }],
    ocupacionesRelacionadas: [{ codigo: '0012', nombre: 'Directores financieros' }]
  });
  const second = { ...occupation('PENDIENTE', null), ocupacion: '01100-7-2', codigoOriginal: '01100', panelOrigen: 'CUOC', nombre: 'Oficiales de las Fuerzas Militares', funciones: [] };

  afterEach(() => {
    backend.verify();
  });

  it('should build the list, the search and the summary from one request, translating the backend states', () => {
    setup();
    let page: ComparisonPage | undefined;
    let summary: ComparisonSummary | undefined;
    service.list(createEmptyQuery()).subscribe((result) => (page = result));
    service.summary().subscribe((result) => (summary = result));
    // La lista y el resumen comparten la misma respuesta.
    backend.expectOne('/api/instrumento2').flush([
      row(1, 'PENDIENTE'),
      row(2, 'EN_REVISION', 'analista@sena.edu.co'),
      row(3, 'AJUSTES_SOLICITADOS'),
      row(4, 'GUARDADO'),
      row(5, 'VALIDADO'),
      row(6, 'ENVIADO_EXPERTO'),
      row(7, 'APROBADO_FINAL'),
      row(8, 'ALGO_NUEVO')
    ]);

    expect(summary).toEqual({ Recibido: 2, Editado: 2, 'En Instrumento 2': 1, Diligenciado: 1, Enviado: 2 });
    expect(page?.total).toBe(8);
    // De la más reciente a la más antigua.
    expect(page?.items.map((item) => item.id)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(page?.items[7]).toEqual(
      jasmine.objectContaining({ id: 1, status: 'Recibido', analyst: 'admin@sena.edu.co', date: '09/10/2026', observation: '' })
    );
    // El código que se muestra es el del catálogo, no el de la copia.
    expect(page?.items[7].occupations.map((item) => [item.catalog, item.code, item.name, item.level, item.area])).toEqual([
      ['CNO', '0011', 'Directores generales', 'Nivel 0', 'Dirección y Gerencia'],
      ['CUOC', '01100', 'Oficiales de las Fuerzas Militares', 'Nivel 4', '']
    ]);

    const find = (query: Partial<ReturnType<typeof createEmptyQuery>>) => {
      let ids: number[] = [];
      service.list({ ...createEmptyQuery(), ...query }).subscribe((result) => (ids = result.items.map((item) => item.id)));
      return ids;
    };
    expect(find({ text: '4' })).toEqual([4]);
    expect(find({ text: 'ANALISTA@' })).toEqual([2]);
    expect(find({ text: 'fuerzas militares', status: 'Editado' })).toEqual([3, 2]);
    expect(find({ text: '01100', page: 2, pageSize: 3 })).toEqual([5, 4, 3]);
    // Todo lo anterior salió de la respuesta ya recibida.
    backend.expectNone('/api/instrumento2');
  });

  it('should open a comparison with its occupations complete and its single observation', () => {
    setup();
    let comparison: Comparison | undefined;
    service.get(7).subscribe((result) => (comparison = result));
    backend.expectOne('/api/instrumento2/7/comparacion').flush([occupation('EN_REVISION', 'Revisar el nivel'), second]);

    expect(comparison).toEqual(jasmine.objectContaining({ id: 7, status: 'Editado', analyst: 'admin@sena.edu.co', date: '09/10/2026', observation: 'Revisar el nivel' }));
    expect(comparison?.occupations[0]).toEqual({
      catalog: 'CNO',
      code: '0011',
      copyCode: '0011-7-1',
      status: '',
      name: 'Directores generales',
      level: 'Nivel 0',
      levelCode: 'N0',
      area: 'Dirección y Gerencia',
      description: 'Dirigen la organización.',
      functions: [{ code: 'F-0011.01', text: 'Planear la operación' }],
      skills: [{ code: '42', text: 'Liderazgo' }],
      knowledge: [{ code: '79', text: 'Administración' }],
      denominations: [{ code: 'D-0011.001', text: 'Gerente general' }],
      related: [{ code: '0012', text: 'Directores financieros' }],
      registeredAt: '22/09/2026',
      traceability: 'CIUO 1120'
    });
    expect(comparison?.occupations[1]).toEqual(jasmine.objectContaining({ catalog: 'CUOC', code: '01100', functions: [] }));
    // Como en Análisis, solo la CNO lleva el código del nivel (en la CUOC ya va en el nombre: «Nivel 4»).
    expect(comparison?.occupations[1].levelCode).toBeUndefined();

    let error = '';
    service.get(99).subscribe({ error: (e: Error) => (error = e.message) });
    backend.expectOne('/api/instrumento2/99/comparacion').flush({ message: 'Instrumento no encontrado' }, { status: 404, statusText: 'Not Found' });
    expect(error).toBe(COMPARISON_NOT_FOUND);
  });

  it('should save each changed occupation and the single observation, send to Instrumento 2 and return the comparison', () => {
    setup();
    let saved: Comparison | undefined;
    const noLists = { functions: [], denominations: [], skills: [], knowledge: [], related: [] };
    const changes = [
      {
        copyCode: '0011-7-1', name: ' Directores ', level: 'Nivel 1', area: 'Dirección y Gerencia', description: 'Dirigen. ',
        // Una función del catálogo (con código), una nueva (sin código) y una fila vacía que no viaja.
        functions: [{ code: 'F-0011.01', text: 'Planear la operación ' }, { code: '', text: 'Evaluar resultados' }, { code: '', text: '  ' }],
        denominations: [{ code: '', text: 'Gerente' }],
        skills: [{ code: '42', text: 'Liderazgo' }],
        knowledge: [],
        related: [{ code: '0012', text: 'Directores financieros' }]
      },
      { copyCode: '01100-7-2', name: 'Oficiales', level: 'Nivel 4', area: 'Seguridad', description: '', ...noLists }
    ];
    service.saveChanges(7, changes, '  Revisar el nivel ').subscribe((result) => (saved = result));
    // Un PATCH por ocupación, uno tras otro; la observación (una sola por comparativa) va solo en el primero.
    const first = backend.expectOne('/api/instrumento2/7');
    expect(first.request.method).toBe('PATCH');
    expect(first.request.body).toEqual({
      codigoOcupacion: '0011-7-1', nombre: 'Directores', nivelCualificacion: 'Nivel 1', areaDesempeno: 'Dirección y Gerencia', descripcion: 'Dirigen.',
      funciones: [{ codigo: 'F-0011.01', descripcion: 'Planear la operación' }, { descripcion: 'Evaluar resultados' }],
      denominaciones: [{ nombre: 'Gerente' }],
      habilidades: [{ codigo: '42', nombre: 'Liderazgo' }],
      conocimientos: [],
      ocupacionesRelacionadas: [{ codigo: '0012', nombre: 'Directores financieros' }],
      observacion: 'Revisar el nivel'
    });
    first.flush(occupation('EN_REVISION', 'Revisar el nivel'));
    const secondPatch = backend.expectOne('/api/instrumento2/7');
    expect(secondPatch.request.body).toEqual({
      codigoOcupacion: '01100-7-2', nombre: 'Oficiales', nivelCualificacion: 'Nivel 4', areaDesempeno: 'Seguridad', descripcion: '',
      funciones: [], denominaciones: [], habilidades: [], conocimientos: [], ocupacionesRelacionadas: []
    });
    secondPatch.flush(occupation('EN_REVISION', 'Revisar el nivel'));
    backend.expectOne('/api/instrumento2/7/comparacion').flush([occupation('EN_REVISION', 'Revisar el nivel'), second]);
    expect(saved?.status).toBe('Editado');
    expect(saved?.occupations.length).toBe(2);
    expect(saved?.occupations[1].copyCode).toBe('01100-7-2');

    // Solo la observación: un único PATCH sin datos de ocupación.
    service.saveChanges(7, [], 'Nota').subscribe();
    const alone = backend.expectOne('/api/instrumento2/7');
    expect(alone.request.body).toEqual({ observacion: 'Nota' });
    alone.flush(occupation('EN_REVISION', 'Nota'));
    backend.expectOne('/api/instrumento2/7/comparacion').flush([occupation('EN_REVISION', 'Nota'), second]);

    let sent: Comparison | undefined;
    service.sendToInstrument2(7).subscribe((result) => (sent = result));
    const post = backend.expectOne('/api/instrumento2/7/guardar');
    expect(post.request.method).toBe('POST');
    post.flush(occupation('GUARDADO', 'Revisar el nivel'));
    backend.expectOne('/api/instrumento2/7/comparacion').flush([occupation('GUARDADO', 'Revisar el nivel'), second]);
    expect(sent?.status).toBe('En Instrumento 2');

    // Después de escribir, la lista se vuelve a pedir.
    service.summary().subscribe();
    backend.expectOne('/api/instrumento2').flush([]);
  });

  it('should translate the refusals of the server into stable codes', () => {
    setup();
    const answers: [number, string][] = [
      [409, COMPARISON_LOCKED],
      [400, COMPARISON_INCOMPLETE],
      [404, COMPARISON_NOT_FOUND]
    ];
    for (const [status, code] of answers) {
      let error = '';
      service.sendToInstrument2(7).subscribe({ error: (e: Error) => (error = e.message) });
      backend.expectOne('/api/instrumento2/7/guardar').flush({ message: { message: 'No' } }, { status, statusText: 'Error' });
      expect(error).toBe(code);
    }
  });

  it('should ask for the list again after a failure instead of keeping the error', () => {
    setup();
    let failed = false;
    service.summary().subscribe({ error: () => (failed = true) });
    backend.expectOne('/api/instrumento2').flush(null, { status: 500, statusText: 'Error' });
    expect(failed).toBeTrue();

    let total = -1;
    service.list(createEmptyQuery()).subscribe((page) => (total = page.total));
    backend.expectOne('/api/instrumento2').flush([row(1, 'PENDIENTE')]);
    expect(total).toBe(1);
  });
});
