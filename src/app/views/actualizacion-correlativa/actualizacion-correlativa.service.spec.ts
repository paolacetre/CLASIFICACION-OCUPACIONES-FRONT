/// <reference types="jasmine" />

/*
 * ActualizacionCorrelativaService real: qué pide al backend y cómo traduce sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../../shared/session';
import { CorrelativeRelation, CorrelativeUploadProgress } from './actualizacion-correlativa.model';
import { ActualizacionCorrelativaService, CORRELATIVE_REJECTED, CorrelativeError, UPLOAD_REJECTED } from './actualizacion-correlativa.service';

describe('ActualizacionCorrelativaService', () => {
  let service: ActualizacionCorrelativaService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActualizacionCorrelativaService, useClass: ActualizacionCorrelativaService },
        { provide: SESSION, useValue: { role: 'Administrador', email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(ActualizacionCorrelativaService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('groups the occupation rows by CNO occupation, in code order', () => {
    let relations: CorrelativeRelation[] = [];
    service.relations().subscribe((value) => (relations = value));
    backend.expectOne('/api/correlativa/ocupaciones').flush([
      { codigo: 3, codOcupacionCno: '0012', nombOcupacionCno: 'Personal directivo', codOcupacionCuoc: '11120', nombOcupacionCuoc: 'Directores del gobierno' },
      { codigo: 1, codOcupacionCno: '0011', nombOcupacionCno: 'Miembros del poder ejecutivo', codOcupacionCuoc: '11110', nombOcupacionCuoc: null },
      { codigo: 4, codOcupacionCno: '0012', nombOcupacionCno: 'Personal directivo', codOcupacionCuoc: '11130', nombOcupacionCuoc: 'Jefes de comunidades' }
    ]);
    expect(relations.map((relation) => relation.cno.code)).toEqual(['0011', '0012']);
    expect(relations[0].cuoc).toEqual([{ code: '11110', name: '' }]);
    expect(relations[1].cuoc.map((item) => item.code)).toEqual(['11120', '11130']);
  });

  it('keeps the observation of each CNO, joining different ones without repeating them', () => {
    let relations: CorrelativeRelation[] = [];
    service.relations().subscribe((value) => (relations = value));
    backend.expectOne('/api/correlativa/ocupaciones').flush([
      { codigo: 1, codOcupacionCno: '0012', nombOcupacionCno: 'Personal directivo', codOcupacionCuoc: '11120', nombOcupacionCuoc: 'A', observacion: 'Revisar nombre' },
      { codigo: 2, codOcupacionCno: '0012', nombOcupacionCno: 'Personal directivo', codOcupacionCuoc: '11130', nombOcupacionCuoc: 'B', observacion: 'Revisar nombre' },
      { codigo: 3, codOcupacionCno: '0012', nombOcupacionCno: 'Personal directivo', codOcupacionCuoc: '11140', nombOcupacionCuoc: 'C', observacion: 'Validar con la mesa' },
      { codigo: 4, codOcupacionCno: '0011', nombOcupacionCno: 'Miembros', codOcupacionCuoc: '11110', nombOcupacionCuoc: 'D', observacion: null }
    ]);
    expect(relations.map((relation) => relation.observation)).toEqual(['', 'Revisar nombre; Validar con la mesa']);
  });

  it('sends back the observation the relation already had, so saving does not erase it', () => {
    service.save({ code: '0012', name: 'Personal directivo' }, [{ code: '11120', name: 'A' }], 'Revisar nombre').subscribe();
    const request = backend.expectOne('/api/correlativa/ocupaciones');
    expect(request.request.body.observacion).toBe('Revisar nombre');
    request.flush({ codOcupacionCno: '0012', total: 1 });
  });

  it('saves a correlative with the body the backend expects', () => {
    let done = false;
    service.save({ code: '0011', name: 'Miembros' }, [{ code: '11110', name: 'Directores' }, { code: '11120', name: 'Gobierno' }]).subscribe(() => (done = true));
    const request = backend.expectOne('/api/correlativa/ocupaciones');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      codOcupacionCno: '0011',
      nombOcupacionCno: 'Miembros',
      cuoc: [{ codigo: '11110', nombre: 'Directores' }, { codigo: '11120', nombre: 'Gobierno' }]
    });
    request.flush({ codOcupacionCno: '0011', total: 2 });
    expect(done).toBeTrue();
  });

  it('turns a 400 on save into CORRELATIVE_REJECTED with the server message', () => {
    let error: unknown;
    service.save({ code: '9999', name: '' }, [{ code: '11110', name: '' }]).subscribe({ error: (value) => (error = value) });
    backend
      .expectOne('/api/correlativa/ocupaciones')
      .flush({ message: { message: "La ocupación CNO '9999' no existe en el catálogo." } }, { status: 400, statusText: 'Bad Request' });
    expect(error instanceof CorrelativeError).toBeTrue();
    expect((error as CorrelativeError).message).toBe(CORRELATIVE_REJECTED);
    expect((error as CorrelativeError).serverMessage).toContain('9999');
  });

  it('uploads one type and summarizes the result', () => {
    const states: CorrelativeUploadProgress[] = [];
    service.upload('ocupacion', new File(['x'], 'correlativa.xlsx')).subscribe((state) => states.push(state));
    const request = backend.expectOne('/api/correlativa/upload/ocupacion');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBeTruthy();
    request.flush({
      message: 'Se importaron 2 registros de ocupación.',
      totalInserted: 2,
      totalSkipped: 1,
      sheets: [{ errors: [], skippedDetails: ['Fila 4: falta el código CUOC'], warnings: [] }]
    });
    const last = states[states.length - 1];
    expect(last.done).toBeTrue();
    expect(last.result).toEqual({
      message: 'Se importaron 2 registros de ocupación.',
      inserted: 2,
      skipped: 1,
      errors: [],
      skippedDetails: ['Fila 4: falta el código CUOC'],
      warnings: []
    });
  });

  it('turns a rejected file into UPLOAD_REJECTED with the server message', () => {
    let error: unknown;
    service.upload('conocimiento', new File(['x'], 'otro.xlsx')).subscribe({ error: (value) => (error = value) });
    backend
      .expectOne('/api/correlativa/upload/conocimiento')
      .flush({ message: { message: 'El archivo no corresponde al tipo Conocimiento.' } }, { status: 400, statusText: 'Bad Request' });
    expect((error as CorrelativeError).message).toBe(UPLOAD_REJECTED);
    expect((error as CorrelativeError).serverMessage).toContain('Conocimiento');
  });

  it('falls back to the bundled template when the server has none', () => {
    let blob: Blob | undefined;
    service.template('denominacion').subscribe((value) => (blob = value));
    backend.expectOne('/api/correlativa/upload/plantilla/denominacion').flush(new Blob(), { status: 404, statusText: 'Not Found' });
    backend.expectOne('assets/plantillas/correlativa/Plantilla_Correlativa_denominacion.xlsx').flush(new Blob(['xlsx']));
    expect(blob).toBeTruthy();
  });
});
