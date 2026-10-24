/// <reference types="jasmine" />

/*
 * ActualizacionCnoService real: qué pide al backend y cómo traduce sus respuestas.
 */
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../../shared/session';
import { CatalogItem, OccupationDraft, PickOption, createEmptyOccupation } from './actualizacion-cno.model';
import { FileReview, UploadProgress } from './carga-cno/carga-cno.model';
import { EditableOccupation } from './editar-ocupacion/editar-ocupacion.model';
import { ActualizacionCnoService, CATALOG_CONFLICT, CATALOG_NOT_FOUND, CatalogError, INVALID_CATALOG_ITEM, OCCUPATION_CODE_TAKEN } from './actualizacion-cno.service';

describe('ActualizacionCnoService', () => {
  let service: ActualizacionCnoService;
  let backend: HttpTestingController;

  function setup(role = 'Administrador'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActualizacionCnoService, useClass: ActualizacionCnoService },
        { provide: SESSION, useValue: { role, email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ActualizacionCnoService);
    backend = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    backend.verify();
  });

  const page = (data: unknown[]) => ({ data, total: data.length, page: 1, limit: 500, totalPages: 1 });

  it('should list the official levels translated and ordered by code', () => {
    let items: CatalogItem[] = [];
    service.list('level').subscribe((result) => (items = result));

    const request = backend.expectOne((req) => req.url === '/api/cno/catalogos/niveles-cualificacion');
    expect(request.request.params.get('limit')).toBe('500');
    expect(request.request.params.has('incluirCopias')).toBeFalse();
    request.flush(
      page([
        { codCualificacion: '10', nivelesCualificacion: 'Diez', descripcion: null, esCopia: false, codOriginal: null },
        { codCualificacion: '2', nivelesCualificacion: 'Dos', descripcion: 'Técnicos', creadoEn: '2026-10-16T10:00:00.000Z' }
      ])
    );

    expect(items).toEqual([
      { code: '2', name: 'Dos', description: 'Técnicos', registeredAt: '16/10/2026', active: true },
      { code: '10', name: 'Diez', description: '', registeredAt: '', active: true }
    ]);
  });

  it('should read each catalog with its own field names', () => {
    const results: Record<string, CatalogItem[]> = {};
    service.list('area').subscribe((items) => (results['area'] = items));
    service.list('skill').subscribe((items) => (results['skill'] = items));
    service.list('knowledge').subscribe((items) => (results['knowledge'] = items));

    backend.expectOne((req) => req.url === '/api/cno/catalogos/areas-desempeno').flush(page([{ codDesempeno: '3', nomDesempeno: 'Salud', descripcion: 'Servicios' }]));
    backend.expectOne((req) => req.url === '/api/cno/catalogos/habilidades').flush(page([{ codHabDest: 17, nombHabDest: 'Análisis', descHabDest: null }]));
    backend.expectOne((req) => req.url === '/api/cno/catalogos/conocimientos').flush(page([{ codConocimiento: 40, nombConocimiento: 'Anatomía', descConocimiento: 'Cuerpo' }]));

    expect(results['area']).toEqual([{ code: '3', name: 'Salud', description: 'Servicios', registeredAt: '', active: true }]);
    expect(results['skill']).toEqual([{ code: '17', name: 'Análisis', description: '', registeredAt: '', active: true }]);
    expect(results['knowledge']).toEqual([{ code: '40', name: 'Anatomía', description: 'Cuerpo', registeredAt: '', active: true }]);
  });

  it('should list every occupation page by page, without the system one, and reuse it', () => {
    let items: CatalogItem[] = [];
    service.occupations().subscribe((result) => (items = result));

    const first = backend.expectOne((req) => req.url === '/api/cno/ocupaciones' && req.params.get('page') === '1');
    expect(first.request.params.get('limit')).toBe('500');
    first.flush({
      data: [
        { codOcupacionCno: '3311', nombOcupacionCno: 'Auxiliares de enfermería', descripcion: 'Cuidados', estado: false, fechaRegistro: '2024-03-05' },
        { codOcupacionCno: '0000', nombOcupacionCno: 'Sistema', descripcion: null, estado: true, fechaRegistro: null }
      ],
      total: 3,
      page: 1,
      limit: 500,
      totalPages: 2
    });
    backend
      .expectOne((req) => req.url === '/api/cno/ocupaciones' && req.params.get('page') === '2')
      .flush({ data: [{ codOcupacionCno: '0011', nombOcupacionCno: 'Miembros', descripcion: null, estado: true, fechaRegistro: null }], total: 3, page: 2, limit: 500, totalPages: 2 });

    expect(items).toEqual([
      { code: '0011', name: 'Miembros', description: '', registeredAt: '', active: true },
      { code: '3311', name: 'Auxiliares de enfermería', description: 'Cuidados', registeredAt: '05/03/2024', active: false }
    ]);

    service.occupations().subscribe();
    backend.expectNone('/api/cno/ocupaciones');
    service.refreshOccupations();
    service.occupations().subscribe();
    backend.expectOne((req) => req.url === '/api/cno/ocupaciones').flush({ data: [], total: 0, page: 1, limit: 500, totalPages: 0 });
  });

  it('should delete an occupation and forget the saved list', () => {
    service.occupations().subscribe();
    backend.expectOne((req) => req.url === '/api/cno/ocupaciones').flush({ data: [], total: 0, page: 1, limit: 500, totalPages: 0 });

    let done = false;
    service.removeOccupation('9999').subscribe(() => (done = true));
    const request = backend.expectOne('/api/cno/ocupaciones/9999');
    expect(request.request.method).toBe('DELETE');
    request.flush({ message: 'Ocupación CNO 9999 eliminada correctamente' });
    expect(done).toBeTrue();

    service.occupations().subscribe();
    backend.expectOne((req) => req.url === '/api/cno/ocupaciones').flush({ data: [], total: 0, page: 1, limit: 500, totalPages: 0 });
  });

  it('should load the whole function catalog page by page', () => {
    let items: PickOption[] = [];
    service.functions().subscribe((result) => (items = result));
    backend
      .expectOne((req) => req.url === '/api/cno/catalogos/funciones' && req.params.get('page') === '1')
      .flush({ data: [{ codFuncion: 'F-1001', descFuncionCno: 'Planear' }], total: 2, page: 1, limit: 500, totalPages: 2 });
    backend
      .expectOne((req) => req.url === '/api/cno/catalogos/funciones' && req.params.get('page') === '2')
      .flush({ data: [{ codFuncion: 'F-1002', descFuncionCno: null }], total: 2, page: 2, limit: 500, totalPages: 2 });
    expect(items).toEqual([
      { code: 'F-1001', label: 'Planear' },
      { code: 'F-1002', label: '' }
    ]);
  });

  const occupation = (): OccupationDraft => ({
    ...createEmptyOccupation(),
    code: ' 1254 ',
    name: ' Analistas de datos ',
    areaCode: '1',
    levelCode: '2',
    registeredOn: '2026-10-16',
    traceability: ' Resolución 001 ',
    description: ' Analizan datos. ',
    denominations: ['Analista de datos'],
    functions: [
      { code: 'F-1002', text: 'Registrar' },
      { code: null, text: 'Construir tableros' }
    ],
    skills: [{ code: '17', label: 'Análisis' }],
    knowledge: [{ code: '40', label: 'Anatomía' }],
    related: [{ code: '1111', label: 'Auxiliares contables' }]
  });

  it('should register an occupation with the same body as the deployed form', () => {
    let code = '';
    service.createOccupation(occupation()).subscribe((result) => (code = result));

    const request = backend.expectOne('/api/cno/ocupaciones');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      codOcupacionCno: '1254',
      nombOcupacionCno: 'Analistas de datos',
      descripcion: 'Analizan datos.',
      estado: true,
      fechaRegistro: '2026-10-16',
      trazabilidad: 'Resolución 001',
      codDesempeno: '1',
      codCualificacion: '2',
      denominaciones: [{ descDenominacion: 'Analista de datos' }],
      funciones: [{ codFuncion: 'F-1002' }, { descFuncionCno: 'Construir tableros' }],
      habilidades: [{ codHabilidad: 17 }],
      conocimientos: [{ codConocimiento: 40 }],
      relacionadas: [{ codigoOcupacion: '1111', nombreCnoRelacionada: 'Auxiliares contables' }]
    });
    request.flush({ codOcupacionCno: '1254' });
    expect(code).toBe('1254');
  });

  it('should send the inactivation date of an inactive occupation and translate the errors', () => {
    const errors: unknown[] = [];
    service.createOccupation({ ...occupation(), active: false }).subscribe({ error: (error: unknown) => errors.push(error) });
    const request = backend.expectOne('/api/cno/ocupaciones');
    expect(request.request.body).toEqual(jasmine.objectContaining({ estado: false, fechaInactivacion: '2026-10-16' }));
    request.flush({ message: { message: 'Ya existe una ocupación CNO con código 1254' } }, { status: 409, statusText: 'Conflict' });

    service.createOccupation(occupation()).subscribe({ error: (error: unknown) => errors.push(error) });
    backend
      .expectOne('/api/cno/ocupaciones')
      .flush({ message: ['El nombre de la ocupación contiene caracteres no permitidos.'] }, { status: 400, statusText: 'Bad Request' });

    expect((errors[0] as CatalogError).message).toBe(OCCUPATION_CODE_TAKEN);
    expect((errors[1] as CatalogError).message).toBe(INVALID_CATALOG_ITEM);
    expect((errors[1] as CatalogError).serverMessage).toBe('El nombre de la ocupación contiene caracteres no permitidos.');
  });

  it('should review a file without saving anything, sending the column corrections', () => {
    const file = new File(['x'], 'niveles.xlsx');
    let review: FileReview | undefined;
    service.reviewUpload('nivel', file, { codigo: 'codigo' }).subscribe((result) => (review = result));

    const request = backend.expectOne('/api/cno/upload/nivel/validar');
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect((body.get('file') as File).name).toBe('niveles.xlsx');
    expect(body.get('mapeoManual')).toBe('{"codigo":"codigo"}');
    request.flush({
      valid: false,
      hoja: 'nivel_cualificacion',
      totalRecords: 3,
      validRecords: 2,
      invalidRecords: 1,
      columns: [{ clave: 'codigo', name: 'Código', header: 'codigo', found: true, required: true }],
      missingColumns: [],
      allColumns: [{ header: 'codigo', columnIndex: 0, mapped: true, mappedTo: 'codigo', mappedLabel: 'Código' }],
      totalColumnsDetected: 1,
      preview: { headers: ['codigo'], rows: [['7']] },
      errors: [{ row: 3, field: 'Código', value: '', message: 'Vacío', suggestion: 'Complétalo' }],
      pareceTipo: null,
      message: 'Se encontraron 1 registro(s) con inconsistencias de 3.'
    });

    expect(review).toEqual(
      jasmine.objectContaining({
        sheet: 'nivel_cualificacion',
        totalRecords: 3,
        columns: [{ key: 'codigo', name: 'Código', header: 'codigo', found: true, required: true }],
        allColumns: [{ header: 'codigo', mapped: true, mappedTo: 'codigo', mappedLabel: 'Código' }],
        looksLike: null
      })
    );
  });

  it('should upload a file and report the progress and the result', () => {
    const steps: UploadProgress[] = [];
    service.upload('area', new File(['x'], 'areas.xlsx')).subscribe((step) => steps.push(step));

    const request = backend.expectOne('/api/cno/upload/area');
    expect((request.request.body as FormData).has('mapeoManual')).toBeFalse();
    request.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    request.event({ type: HttpEventType.UploadProgress, loaded: 100, total: 100 });
    request.flush({
      message: 'Carga completada.',
      totalInserted: 2,
      totalUpdated: 1,
      totalSkipped: 0,
      totalUnreadable: 0,
      totalErrors: 0,
      totalWarnings: 0,
      elapsedMs: 10,
      sheets: [{ sheet: 'Area_desempeño', tableName: 'x', message: '', inserted: 2, updated: 1, skipped: 0, unreadable: 0, errors: [], warnings: [], skippedDetails: [] }]
    });

    expect(steps.map((step) => step.progress)).toEqual([45, 90, 100]);
    expect(steps[2].result).toEqual(jasmine.objectContaining({ inserted: 2, updated: 1, sheets: [jasmine.objectContaining({ sheet: 'Area_desempeño' })] }));
  });

  it('should download the template from the server, or the copy in the front when the server has none', () => {
    let blob: Blob | undefined;
    service.template('nivel').subscribe((result) => (blob = result));
    backend.expectOne('/api/cno/upload/plantilla/nivel').flush(new Blob(['x']), { status: 404, statusText: 'Not Found' });
    backend.expectOne('assets/plantillas/cno/Plantilla_CNO_nivel.xlsx').flush(new Blob(['plantilla']));
    expect(blob?.size).toBe(9);
  });

  it('should read an occupation to edit and save it on the original with the Análisis panel', () => {
    let occupation: EditableOccupation | undefined;
    service.occupationDetail('0011').subscribe((result) => (occupation = result));
    backend.expectOne('/api/cno/ocupaciones/0011').flush({
      codOcupacionCno: '0011',
      nombOcupacionCno: 'Miembros del poder ejecutivo',
      descripcion: 'Definen políticas.',
      estado: true,
      fechaRegistro: '2026-07-02',
      fechaInactivacion: null,
      trazabilidad: null,
      codAnteOcupacionCno: null,
      areaDesempeno: { codDesempeno: '0', nomDesempeno: 'Dirección y Gerencia' },
      nivelCualificacion: { codCualificacion: '0', nivelesCualificacion: 'Nivel 0' },
      denominaciones: [{ codDenominacionCno: 'D-0011.001', descDenominacion: 'Alcalde', estado: 1, fechaReg: null }],
      funciones: [{ codigo: 'F-0011.01', descFuncionCno: 'Promulgar leyes.', estado: 1 }],
      habilidades: [{ nombHabDest: 'Comunicación asertiva', habilidadDestreza: { codHabDest: 4 } }],
      conocimientos: [{ nombConocimiento: 'Administración', conocimiento: { codConocimiento: 1 } }],
      relacionadas: [{ codigoOcupacion: '0012', nombreCnoRelacionada: 'Personal directivo' }]
    });
    expect(occupation).toEqual(
      jasmine.objectContaining({ code: '0011', areaCode: '0', levelCode: '0', registeredAt: '02/07/2026', skills: [{ code: '4', label: 'Comunicación asertiva' }] })
    );

    occupation!.name = 'Miembros del poder ejecutivo y legislativo';
    occupation!.active = false;
    occupation!.denominations.push({ key: 99, code: '', text: 'Concejal', active: null, registeredAt: '' });
    service.saveOccupation(occupation!, 'Dirección y Gerencia', 'Nivel 0').subscribe();
    const request = backend.expectOne('/api/analisis/ocupacion-original');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      tipo: 'cno',
      panel: {
        codigo: '0011',
        nombre: 'Miembros del poder ejecutivo y legislativo',
        descripcion: 'Definen políticas.',
        nivelCualificacion: 'Nivel 0',
        areaDesempeno: 'Dirección y Gerencia',
        estado: 'Inactivo',
        trazabilidad: '',
        funciones: [{ codigo: 'F-0011.01', descripcion: 'Promulgar leyes.' }],
        denominaciones: [
          { codigo: 'D-0011.001', nombre: 'Alcalde' },
          { codigo: '', nombre: 'Concejal' }
        ],
        habilidades: [{ codigo: '4', nombre: 'Comunicación asertiva' }],
        conocimientos: [{ codigo: '1', nombre: 'Administración' }],
        ocupacionesRelacionadas: [{ codigo: '0012', nombre: 'Personal directivo' }]
      }
    });
    request.flush({ codigo: '0011' });
  });

  describe('CUOC', () => {
    it('should read a CUOC occupation with the state and date of its denominations and functions', () => {
      let occupation: EditableOccupation | undefined;
      service.occupationDetail('01100', 'cuoc').subscribe((result) => (occupation = result));
      backend.expectOne('/api/cuoc/ocupaciones/01100').flush({
        codOcupacionCuoc: '01100',
        nomOcupacionCuoc: 'Oficiales de las Fuerzas Militares',
        descOcupacionCuoc: 'Planean.',
        estado: true,
        areaCualificacion: { codigo: 'SEGU', descripcion: 'Seguridad' },
        nivelCompetencia: { codNivel: 4, nombreNivel: 'Nivel 4' },
        grupoPrimario: { codGrupoPrim: '0110', nomGrupoPrim: 'Oficiales de las fuerzas militares' },
        denominaciones: [{ codDenominacion: '01100.001', codigo: '01100.001', nombre: 'Almirante' }],
        funciones: [{ codigo: '1', descripcion: 'Planear.' }],
        habilidades: [],
        conocimientos: [{ codigo: 1, nombre: 'Educación militar' }],
        ocupacionesAfines: [{ codigo: '02100', nombre: 'Suboficiales' }]
      });
      backend.expectOne('/api/cuoc/denominaciones/ocupacion/01100').flush([
        { codDenominacion: '01100.002', nomDenominacion: 'Capitán', estado: 0, fechaRegistro: '2026-07-02T00:00:00.000Z' },
        { codDenominacion: '01100.001', nomDenominacion: 'Almirante', estado: 1, fechaRegistro: null }
      ]);
      backend.expectOne('/api/cuoc/funciones/ocupacion/01100').flush([{ codigo: 7, codFuncionCuoc: '1', nomFuncionCuoc: 'Planear.', estado: 1, fechaRegistro: null }]);

      expect(occupation?.denominations.map((row) => [row.code, row.text, row.active, row.registeredAt])).toEqual([
        ['01100.001', 'Almirante', true, ''],
        ['01100.002', 'Capitán', false, '02/07/2026']
      ]);
      expect(occupation?.functions.map((row) => [row.code, row.text, row.active])).toEqual([['1', 'Planear.', true]]);
      expect(occupation?.primaryGroup).toBe('0110 · Oficiales de las fuerzas militares');
      expect(occupation?.related).toEqual([{ code: '02100', label: 'Suboficiales' }]);
    });

    it('should read the CUOC catalogs with their own routes and fields', () => {
      const results: Record<string, CatalogItem[]> = {};
      service.list('level', 'cuoc').subscribe((items) => (results['level'] = items));
      service.list('area', 'cuoc').subscribe((items) => (results['area'] = items));
      service.list('skill', 'cuoc').subscribe((items) => (results['skill'] = items));

      // Los catálogos que no paginan no aceptan parámetros.
      const levels = backend.expectOne('/api/cuoc/niveles-competencia');
      expect(levels.request.params.keys()).toEqual([]);
      levels.flush([{ codNivel: 2, nombreNivel: 'Nivel 2', descripcion: 'Técnico' }, { codNivel: 1, nombreNivel: 'Nivel 1', descripcion: null }]);
      backend
        .expectOne((req) => req.url === '/api/cuoc/areas-cualificacion' && req.params.get('limit') === '500')
        .flush(page([{ codigo: 'AFDE', descripcion: 'Administración, finanzas y derecho' }]));
      backend.expectOne('/api/cuoc/destrezas/catalogo').flush([{ codHabDest: 4, nombHabDest: 'Comunicación asertiva', descHabDest: '' }]);

      expect(results['level'].map((item) => [item.code, item.name, item.description])).toEqual([
        ['1', 'Nivel 1', ''],
        ['2', 'Nivel 2', 'Técnico']
      ]);
      // El área de cualificación trae su nombre en "descripcion" y no tiene descripción propia.
      expect(results['area']).toEqual([{ code: 'AFDE', name: 'Administración, finanzas y derecho', description: '', registeredAt: '', active: true }]);
      expect(results['skill'][0].name).toBe('Comunicación asertiva');
    });

    it('should write the CUOC catalogs (an area has no description)', () => {
      service.create('area', { code: 'PRUE', name: 'Área de prueba', description: 'no viaja' }, 'cuoc').subscribe();
      const created = backend.expectOne('/api/cuoc/areas-cualificacion');
      expect(created.request.body).toEqual({ codigo: 'PRUE', nombre: 'Área de prueba' });
      created.flush({ codigo: 'PRUE', descripcion: 'Área de prueba' });

      service.update('knowledge', '7', { code: '7', name: 'Producción', description: 'Texto' }, 'cuoc').subscribe();
      const updated = backend.expectOne('/api/cuoc/conocimientos/catalogo/7');
      expect(updated.request.method).toBe('PATCH');
      updated.flush({ codConocimiento: 7, nombConocimiento: 'Producción', descConocimiento: 'Texto' });

      service.remove('level', '4', 'cuoc').subscribe();
      expect(backend.expectOne('/api/cuoc/niveles-competencia/4').request.method).toBe('DELETE');
    });

    it('should register a CUOC occupation with the same body as the deployed form', () => {
      const draft: OccupationDraft = {
        ...createEmptyOccupation(),
        code: '12345',
        name: 'Analistas de datos',
        areaCode: 'AFDE',
        levelCode: '3',
        registeredOn: '2026-10-16',
        traceability: 'Resolución 001',
        description: 'Analizan datos.',
        denominations: ['Analista de datos', 'Científico de datos'],
        functions: [
          { code: '7082', text: 'Abastecer las máquinas.' },
          { code: null, text: 'Construir tableros' }
        ],
        skills: [{ code: '4', label: 'Comunicación asertiva' }],
        knowledge: [{ code: '40', label: 'Anatomía' }]
      };
      service.createOccupation(draft, 'cuoc', 'Nivel 3').subscribe();

      const request = backend.expectOne('/api/cuoc/ocupaciones');
      expect(request.request.body).toEqual({
        codOcupacionCuoc: '12345',
        nomOcupacionCuoc: 'Analistas de datos',
        descOcupacionCuoc: 'Analizan datos.',
        estado: true,
        fechaRegistro: '2026-10-16',
        trazabilidad: 'Resolución 001',
        codigoAreaCuoc: 'AFDE',
        codNivel: 3,
        nombreNivel: 'Nivel 3',
        denominaciones: [
          { codDenominacion: '12345.001', nomDenominacion: 'Analista de datos', fuenteDenom: 'SENA' },
          { codDenominacion: '12345.002', nomDenominacion: 'Científico de datos', fuenteDenom: 'SENA' }
        ],
        funciones: [
          { codFuncionCuoc: '1', nomFuncionCuoc: 'Abastecer las máquinas.' },
          { codFuncionCuoc: '2', nomFuncionCuoc: 'Construir tableros' }
        ],
        destrezas: [{ codHabDest: 4 }],
        regConocimientos: [{ codConocimiento: 40 }]
      });
      request.flush({ codOcupacionCuoc: '12345' });
    });

    it('should list CUOC functions without repeated texts, and use the CUOC upload and template routes', () => {
      let options: PickOption[] = [];
      service.functions('cuoc').subscribe((result) => (options = result));
      backend.expectOne((req) => req.url === '/api/cuoc/funciones/consulta').flush({
        data: [
          { codigo: 1, nomFuncionCuoc: 'Planear' },
          { codigo: 2, nomFuncionCuoc: 'planear' },
          { codigo: 3, nomFuncionCuoc: 'Dirigir' }
        ],
        total: 3,
        page: 1,
        limit: 500,
        totalPages: 1
      });
      expect(options).toEqual([
        { code: '1', label: 'Planear' },
        { code: '3', label: 'Dirigir' }
      ]);

      service.reviewUpload('area', new File(['x'], 'a.xlsx'), {}, 'cuoc').subscribe();
      backend.expectOne('/api/cuoc/upload/area/validar');
      service.template('nivel', 'cuoc').subscribe();
      backend.expectOne('/api/cuoc/upload/plantilla/nivel').flush(new Blob(), { status: 404, statusText: 'Not Found' });
      backend.expectOne('assets/plantillas/cuoc/Plantilla_CUOC_nivel.xlsx').flush(new Blob(['x']));
    });
  });

  it('should create a level with its code and the trimmed texts', () => {
    let created: CatalogItem | undefined;
    service.create('level', { code: ' 7 ', name: ' Nivel 7 ', description: ' Nuevo ' }).subscribe((item) => (created = item));

    const request = backend.expectOne('/api/cno/catalogos/niveles-cualificacion');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ codigo: '7', nombre: 'Nivel 7', descripcion: 'Nuevo' });
    request.flush({ codCualificacion: '7', nivelesCualificacion: 'Nivel 7', descripcion: 'Nuevo' });

    expect(created).toEqual({ code: '7', name: 'Nivel 7', description: 'Nuevo', registeredAt: '', active: true });
  });

  it('should let the server number new skills and knowledge', () => {
    service.create('skill', { code: '99', name: 'Escucha', description: '' }).subscribe();

    const request = backend.expectOne('/api/cno/catalogos/habilidades');
    expect(request.request.body).toEqual({ nombre: 'Escucha', descripcion: '' });
    request.flush({ codHabDest: 43, nombHabDest: 'Escucha', descHabDest: '' });
  });

  it('should update name and description without the code', () => {
    service.update('area', '3', { code: '3', name: 'Salud humana', description: 'Servicios' }).subscribe();

    const request = backend.expectOne('/api/cno/catalogos/areas-desempeno/3');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ nombre: 'Salud humana', descripcion: 'Servicios' });
    request.flush({ codDesempeno: '3', nomDesempeno: 'Salud humana', descripcion: 'Servicios' });
  });

  it('should explain a rejected delete with the server message', () => {
    let error: unknown;
    service.remove('level', '1').subscribe({ error: (result: unknown) => (error = result) });

    const request = backend.expectOne('/api/cno/catalogos/niveles-cualificacion/1');
    expect(request.request.method).toBe('DELETE');
    request.flush(
      { statusCode: 409, message: { message: 'No se puede eliminar: 12 ocupación(es) usan el nivel "Nivel 1".' } },
      { status: 409, statusText: 'Conflict' }
    );

    expect(error).toEqual(jasmine.any(CatalogError));
    expect((error as CatalogError).message).toBe(CATALOG_CONFLICT);
    expect((error as CatalogError).serverMessage).toContain('12 ocupación(es)');
  });

  it('should translate a missing record', () => {
    let error: unknown;
    service.update('knowledge', '500', { code: '500', name: 'Nada', description: '' }).subscribe({ error: (result: unknown) => (error = result) });

    backend.expectOne('/api/cno/catalogos/conocimientos/500').flush({ message: 'No existe' }, { status: 404, statusText: 'Not Found' });

    expect((error as CatalogError).message).toBe(CATALOG_NOT_FOUND);
  });
});
