/// <reference types="jasmine" />

/*
 * Instrumento2Service real: qué pide al backend y cómo traduce sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../../shared/session';
import { ComparativaService } from '../comparativa/comparativa.service';
import { Expert, Instrument2Detail, Instrument2Item } from './instrumento-2.model';
import { INSTRUMENT_NOT_FOUND, INSTRUMENT_NOT_READY, Instrumento2Service } from './instrumento-2.service';

describe('Instrumento2Service', () => {
  let service: Instrumento2Service;
  let backend: HttpTestingController;

  function setup(role = 'Administrador'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: Instrumento2Service, useClass: Instrumento2Service },
        { provide: SESSION, useValue: { role, email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(Instrumento2Service);
    backend = TestBed.inject(HttpTestingController);
  }

  // Fecha local, para que la prueba no dependa de la zona horaria del equipo.
  const savedAt = new Date(2026, 9, 6, 11, 50).toISOString();
  const row = (id: number, estado: string) => ({
    id,
    estado,
    ocupacion: `7334-${id}-1`,
    codigoOriginal: '7334',
    panelOrigen: 'CNO',
    nombre: 'Trabajadores del campo',
    nivelCualificacion: 'Nivel 3',
    areaDesempeno: 'Explotación primaria',
    descripcion: 'Realizan las faenas del cultivo.',
    fechaRegistro: '2026-09-22',
    trazabilidad: 'CIUO 9211',
    observacion: 'Revisar el nivel',
    fecha: savedAt,
    analista: 'admin@sena.edu.co',
    funciones: [{ codigo: 'F-7334.01', descripcion: 'Preparar la tierra' }],
    denominaciones: [],
    habilidades: [],
    conocimientos: [],
    ocupacionesRelacionadas: [],
    ocupaciones: [
      { codigo: `7334-${id}-1`, codigoOriginal: '7334', nombre: 'Trabajadores del campo', panelOrigen: 'CNO', nivelCualificacion: 'Nivel 3', areaDesempeno: 'Explotación primaria' },
      { codigo: `61121-${id}-2`, codigoOriginal: '61121', nombre: 'Agricultores de plantaciones', panelOrigen: 'CUOC', nivelCualificacion: 'Nivel 2', areaDesempeno: null }
    ]
  });

  afterEach(() => {
    backend.verify();
  });

  it('should list only what already reached Instrumento 2, newest first, with a readable date', () => {
    setup();
    let items: Instrument2Item[] = [];
    service.list().subscribe((result) => (items = result));
    backend.expectOne('/api/instrumento2').flush([
      // Borradores que siguen en Comparativa: no entran a esta bandeja.
      row(1, 'PENDIENTE'),
      row(2, 'EN_REVISION'),
      row(3, 'GUARDADO'),
      row(4, 'ENVIADO_EXPERTO'),
      row(5, 'AJUSTES_SOLICITADOS'),
      row(6, 'VALIDADO'),
      row(7, 'APROBADO_FINAL'),
      // Instrumento antiguo sin resumen ni fecha: se muestra con su ocupación principal.
      { ...row(8, 'GUARDADO'), ocupaciones: undefined, fecha: null, analista: null }
    ]);

    expect(items.map((item) => [item.id, item.state])).toEqual([
      [8, 'GUARDADO'],
      [7, 'APROBADO_FINAL'],
      [6, 'VALIDADO'],
      [5, 'AJUSTES_SOLICITADOS'],
      [4, 'ENVIADO_EXPERTO'],
      [3, 'GUARDADO']
    ]);
    expect(items[5]).toEqual(jasmine.objectContaining({ analyst: 'admin@sena.edu.co', day: '06 oct 2026', time: '11:50 a. m.' }));
    expect(items[5].occupations.map((item) => [item.catalog, item.code, item.name])).toEqual([
      ['CNO', '7334', 'Trabajadores del campo'],
      ['CUOC', '61121', 'Agricultores de plantaciones']
    ]);
    expect(items[0]).toEqual(jasmine.objectContaining({ analyst: '', day: '', time: '' }));
    expect(items[0].occupations.map((item) => [item.catalog, item.code, item.name])).toEqual([['CNO', '7334', 'Trabajadores del campo']]);
  });

  it('should open an instrument with its occupations complete and the analyst remark', () => {
    setup();
    let detail: Instrument2Detail | undefined;
    service.detail(3).subscribe((result) => (detail = result));
    const second = { ...row(3, 'GUARDADO'), ocupacion: '61121-3-2', codigoOriginal: '61121', panelOrigen: 'CUOC', nombre: 'Agricultores de plantaciones', funciones: [] };
    backend.expectOne('/api/instrumento2/3/comparacion').flush([row(3, 'GUARDADO'), second]);

    expect(detail).toEqual(jasmine.objectContaining({ id: 3, state: 'GUARDADO', analyst: 'admin@sena.edu.co', day: '06 oct 2026', observation: 'Revisar el nivel' }));
    expect(detail?.occupations[0]).toEqual(
      jasmine.objectContaining({
        catalog: 'CNO',
        code: '7334',
        level: 'Nivel 3',
        area: 'Explotación primaria',
        description: 'Realizan las faenas del cultivo.',
        functions: [{ code: 'F-7334.01', text: 'Preparar la tierra' }],
        registeredAt: '22/09/2026',
        traceability: 'CIUO 9211'
      })
    );
    expect(detail?.occupations[1]).toEqual(jasmine.objectContaining({ catalog: 'CUOC', code: '61121', functions: [] }));

    const errors: string[] = [];
    service.detail(99).subscribe({ error: (e: Error) => errors.push(e.message) });
    backend.expectOne('/api/instrumento2/99/comparacion').flush({ message: 'No' }, { status: 404, statusText: 'Not Found' });
    service.detail(98).subscribe({ error: (e: Error) => errors.push(e.message) });
    backend.expectOne('/api/instrumento2/98/comparacion').flush([]);
    expect(errors).toEqual([INSTRUMENT_NOT_FOUND, INSTRUMENT_NOT_FOUND]);
  });

  it('should list the available experts, or tell that the server does not allow choosing them', () => {
    setup();
    let experts: Expert[] | null | undefined;
    service.experts().subscribe((result) => (experts = result));
    backend.expectOne('/api/instrumento2/expertos-disponibles').flush([{ idUsuario: 7, nombre: 'Experto Sena', correo: 'experto@sena.edu.co' }]);
    expect(experts).toEqual([{ id: 7, name: 'Experto Sena', email: 'experto@sena.edu.co' }]);

    // La copia local del backend toma la ruta como /:id (400): se envía como antes, sin elegir.
    service.experts().subscribe((result) => (experts = result));
    backend.expectOne('/api/instrumento2/expertos-disponibles').flush({ message: 'Validation failed' }, { status: 400, statusText: 'Bad Request' });
    expect(experts).toBeNull();
  });

  it('should send only the marked occupations to the chosen experts', () => {
    setup();
    service.sendToExpert(3, { occupations: ['1111-3-1'], experts: [7, 9] }).subscribe();
    const request = backend.expectOne('/api/instrumento2/3/enviar-experto');
    expect(request.request.body).toEqual({ ocupaciones: ['1111-3-1'], expertos: [7, 9] });
    request.flush(row(3, 'ENVIADO_EXPERTO'));
  });

  it('should send to the expert, tell Comparativa its list is stale, and translate the refusals', () => {
    setup();
    const invalidate = spyOn(TestBed.inject(ComparativaService), 'invalidate');
    let sent: Instrument2Item | undefined;
    service.sendToExpert(3).subscribe((result) => (sent = result));
    const request = backend.expectOne('/api/instrumento2/3/enviar-experto');
    expect(request.request.method).toBe('POST');
    request.flush(row(3, 'ENVIADO_EXPERTO'));
    expect(sent).toEqual(jasmine.objectContaining({ id: 3, state: 'ENVIADO_EXPERTO' }));
    expect(invalidate).toHaveBeenCalledTimes(1);

    const errors: string[] = [];
    for (const [status, code] of [[409, INSTRUMENT_NOT_READY], [404, INSTRUMENT_NOT_FOUND]] as const) {
      service.sendToExpert(3).subscribe({ error: (e: Error) => errors.push(e.message) });
      backend.expectOne('/api/instrumento2/3/enviar-experto').flush({ message: 'No' }, { status, statusText: 'Error' });
      expect(errors.at(-1)).toBe(code);
    }
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
