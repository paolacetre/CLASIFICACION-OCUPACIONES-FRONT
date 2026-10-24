/// <reference types="jasmine" />

/*
 * ValidacionesService real: qué pide al backend y cómo traduce sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../../shared/session';
import { Review, ReviewItem, ReviewRecord, emptyInformant } from './validaciones.model';
import { REVIEW_NOT_SENT, ReviewError, ValidacionesService } from './validaciones.service';

describe('ValidacionesService', () => {
  let service: ValidacionesService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ValidacionesService, useClass: ValidacionesService },
        { provide: SESSION, useValue: { role: 'Administrador', email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ValidacionesService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  const i2 = (id: number, estado: string, fecha: string) => ({
    id,
    estado,
    ocupacion: `0211-${id}-1`,
    codigoOriginal: '0211',
    panelOrigen: 'left',
    nombre: 'Gerentes de ingeniería',
    analista: 'analista@sena.edu.co',
    fecha,
    ocupaciones: [
      { codigo: `0211-${id}-1`, codigoOriginal: '0211', nombre: 'Gerentes de ingeniería', panelOrigen: 'CNO' },
      { codigo: `21321-${id}-2`, codigoOriginal: '21321', nombre: 'Agrónomos', panelOrigen: 'CUOC' }
    ],
    ocupacionesEnviadas: null as string[] | null
  });

  it('joins both instruments from the moment they reach the expert, most recent first, with only the occupations sent', () => {
    let records: ReviewRecord[] = [];
    service.list().subscribe((value) => (records = value));
    backend.expectOne('/api/instrumento2').flush([
      i2(1, 'GUARDADO', '2026-10-01T10:00:00Z'),
      { ...i2(2, 'ENVIADO_EXPERTO', '2026-10-02T10:00:00Z'), ocupacionesEnviadas: ['0211-2-1'] },
      i2(3, 'AJUSTES_SOLICITADOS', '2026-10-05T10:00:00Z'),
      i2(4, 'APROBADO_FINAL', '2026-10-03T10:00:00Z')
    ]);
    backend.expectOne('/api/instrumento3').flush([
      { id: 7, estado: 'ENVIADO_EXPERTO', fecha: '2026-10-04T10:00:00Z', analista: 'ana@sena.edu.co', nombreOcupacion: 'Desarrolladores', codOcupacionCNO: '2512' },
      { id: 8, estado: 'BORRADOR', fecha: '2026-10-06T10:00:00Z', nombreOcupacion: 'Borrador' }
    ]);
    expect(records.map((record) => [record.kind, record.id, record.state])).toEqual([
      ['I2', 3, 'edited'],
      ['I3', 7, 'received'],
      ['I2', 4, 'sent'],
      ['I2', 2, 'received']
    ]);
    expect(records[0].occupations).toEqual([
      { code: '0211', name: 'Gerentes de ingeniería' },
      { code: '21321', name: 'Agrónomos' }
    ]);
    expect(records[3].occupations).toEqual([{ code: '0211', name: 'Gerentes de ingeniería' }]);
  });

  it('builds the items of every occupation from the snapshot, named as the server names them, and restores what was saved', () => {
    const record: ReviewRecord = { id: 3, kind: 'I2', state: 'received', occupations: [], analyst: '', date: '' };
    let review: Review | undefined;
    service.review(record).subscribe((value) => (review = value));
    backend.expectOne('/api/instrumento2/3').flush({
      ...i2(3, 'ENVIADO_EXPERTO', ''),
      ocupacionesEnviadas: ['0211-3-1', '21321-3-2'],
      preguntas: [
        { identificador: 'nombre', detalle: 'Gerentes de ingeniería', codOcupacion: '0211-3-1' },
        { identificador: 'descripcion', detalle: 'Dirigen proyectos.', codOcupacion: '0211-3-1' },
        { identificador: 'nivel_cualificacion', detalle: 'Nivel 4', codOcupacion: '0211-3-1' },
        { identificador: 'area_desempeno', detalle: '', codOcupacion: '0211-3-1' },
        { identificador: 'trazabilidad', detalle: 'Creada desde 0211', codOcupacion: '0211-3-1' },
        { identificador: 'funcion', detalle: 'Planear', codigo: 'F-0211.01', codOcupacion: '0211-3-1' },
        { identificador: 'funcion', detalle: 'Dirigir', codigo: 'F-0211.02', codOcupacion: '0211-3-1', inactivo: true },
        { identificador: 'nombre', detalle: 'Agrónomos', codOcupacion: '21321-3-2' },
        { identificador: 'descripcion', detalle: '', codOcupacion: '21321-3-2' },
        { identificador: 'area_desempeno', detalle: 'Ciencias', codOcupacion: '21321-3-2' },
        { identificador: 'habilidad', detalle: 'Comunicación', codigo: '5', codOcupacion: '21321-3-2' }
      ]
    });
    backend.expectOne('/api/instrumento2/3/validacion-experta').flush({
      estado: 'en_revision',
      observaciones: 'Revisar funciones',
      campos: [{ campo: 'funcion_2', estado: 'requiere_ajuste', comentario: 'Precisar el alcance', codOcupacion: '0211-3-1' }],
      datosGenerales: { nombreApellidos: 'Ana Ruiz', departamento: 'Antioquia' },
      infoOcupaciones: [{ codOcupacion: '21321-3-2', descripcion: 'Estudian los cultivos.' }]
    });

    const [first, second] = review?.occupations ?? [];
    expect(review?.occupations.map((occupation) => [occupation.code, occupation.copyCode, occupation.adjustable])).toEqual([
      ['0211', '0211-3-1', true],
      ['21321', '21321-3-2', true]
    ]);
    // La trazabilidad es contexto: no se califica. Descripción y área van aunque estén vacías.
    expect(first.items.map((item) => item.field)).toEqual(['nombre', 'descripcion', 'nivel_cualificacion', 'area_desempeno', 'funcion_1', 'funcion_2']);
    expect(first.items.find((item) => item.field === 'funcion_1')?.value).toBe('F-0211.01 - Planear');
    expect(first.items.find((item) => item.field === 'funcion_2')?.inactive).toBeTrue();
    expect(second.items.map((item) => [item.id, item.criterion, item.n])).toEqual([
      ['21321-3-2::nombre', 1, undefined],
      ['21321-3-2::descripcion', 4, undefined],
      ['21321-3-2::area_desempeno', 2, undefined],
      ['21321-3-2::habilidad', 7, undefined]
    ]);
    expect(first.level).toBe('Nivel 4');
    expect(review?.grades['0211-3-1::funcion_2']).toEqual({ grade: 'requiere_ajuste', detail: 'Precisar el alcance' });
    expect(review?.proposals['21321-3-2']).toEqual({ description: 'Estudian los cultivos.' });
    expect(review?.informant.fullName).toBe('Ana Ruiz');
    expect(review?.observations).toBe('Revisar funciones');
  });

  const reviewItem = (occupationCode: string, field: string, section: ReviewItem['section'], value: string): ReviewItem => ({
    id: occupationCode ? `${occupationCode}::${field}` : field,
    field,
    occupationCode,
    section,
    labelKey: 'validaciones.item.function',
    criterion: 5,
    value,
    inactive: false
  });

  it('saves each grade in the snapshot field of its occupation, with the proposals of area and description', () => {
    const record: ReviewRecord = { id: 3, kind: 'I2', state: 'received', occupations: [], analyst: '', date: '' };
    service
      .save(record, {
        verdict: 'ajustes_solicitados',
        informant: { ...emptyInformant(), fullName: 'Ana Ruiz', email: 'ana@sena.edu.co', department: 'Antioquia', municipality: 'Medellín' },
        observations: '  ',
        proposals: [{ occupationCode: '21321-3-2', description: 'Nueva descripción' }],
        items: [
          { ...reviewItem('0211-3-1', 'nombre', 'info', 'Gerentes'), grade: 'aplica', detail: '' },
          { ...reviewItem('0211-3-1', 'funcion_2', 'functions', 'Dirigir'), grade: 'requiere_ajuste', detail: ' Más preciso ' }
        ]
      })
      .subscribe();
    const request = backend.expectOne('/api/instrumento2/3/validacion-experta');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.estado).toBe('ajustes_solicitados');
    expect(request.request.body.observaciones).toBeUndefined();
    expect(request.request.body.datosGenerales).toEqual(jasmine.objectContaining({ nombreApellidos: 'Ana Ruiz', email: 'ana@sena.edu.co', departamento: 'Antioquia', municipio: 'Medellín' }));
    expect(request.request.body.infoOcupaciones).toEqual([{ codOcupacion: '21321-3-2', areaDesempeno: undefined, descripcion: 'Nueva descripción' }]);
    expect(request.request.body.campos).toEqual([
      { campo: 'nombre', estado: 'aplica', comentario: undefined, codOcupacion: '0211-3-1' },
      { campo: 'funcion_2', estado: 'requiere_ajuste', comentario: 'Más preciso', codOcupacion: '0211-3-1' }
    ]);
    request.flush({});
  });

  it('saves an Instrument 3 grade without an occupation (it has only one)', () => {
    const record: ReviewRecord = { id: 9, kind: 'I3', state: 'received', occupations: [], analyst: '', date: '' };
    service
      .save(record, { verdict: 'en_revision', informant: emptyInformant(), observations: '', proposals: [], items: [{ ...reviewItem('', 'funcion_1', 'functions', 'Programar'), grade: 'aplica', detail: '' }] })
      .subscribe();
    const request = backend.expectOne('/api/instrumento3/9/validacion-experta');
    expect(request.request.body.campos).toEqual([{ campo: 'funcion_1', estado: 'aplica', comentario: undefined, codOcupacion: undefined }]);
    expect(request.request.body.infoOcupaciones).toBeUndefined();
    request.flush({});
  });

  it('turns a 409 into REVIEW_NOT_SENT', () => {
    let error: unknown;
    const record: ReviewRecord = { id: 5, kind: 'I2', state: 'received', occupations: [], analyst: '', date: '' };
    service.save(record, { verdict: 'en_revision', informant: emptyInformant(), observations: '', proposals: [], items: [] }).subscribe({ error: (value) => (error = value) });
    backend.expectOne('/api/instrumento2/5/validacion-experta').flush({ message: 'no abierto' }, { status: 409, statusText: 'Conflict' });
    expect((error as ReviewError).message).toBe(REVIEW_NOT_SENT);
  });
});
