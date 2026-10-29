/// <reference types="jasmine" />

/*
 * CorrelativaService real: qué pide al backend y cómo traduce sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CorrelativaPage, createEmptyQuery } from './correlativa.model';
import { CorrelativaService } from './correlativa.service';

describe('CorrelativaService', () => {
  let service: CorrelativaService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: CorrelativaService, useClass: CorrelativaService }, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(CorrelativaService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('maps the occupation rows with the description of each side and the observation', () => {
    let page: CorrelativaPage | undefined;
    service.search('ocupacion', createEmptyQuery()).subscribe((value) => (page = value));
    backend.expectOne('/api/correlativa/ocupaciones').flush([
      {
        codigo: 7,
        codOcupacionCno: '0011',
        nombOcupacionCno: 'Miembros del poder ejecutivo',
        descOcupacionCno: 'Formulan leyes y políticas públicas.',
        codOcupacionCuoc: '11110',
        nombOcupacionCuoc: 'Directores formuladores',
        descOcupacionCuoc: null,
        observacion: 'Revisar con la mesa sectorial'
      }
    ]);
    expect(page?.items).toEqual([
      {
        id: 7,
        cnoOccupationCode: '0011',
        name: 'Miembros del poder ejecutivo',
        cnoDescription: 'Formulan leyes y políticas públicas.',
        cuocOccupationCode: '11110',
        cuocName: 'Directores formuladores',
        cuocDescription: '',
        observation: 'Revisar con la mesa sectorial'
      }
    ]);
  });

  it('brings every page of the denominations, 500 at a time, with the CUOC denomination code', () => {
    let page: CorrelativaPage | undefined;
    service.search('denominacion', createEmptyQuery()).subscribe((value) => (page = value));
    const row = (codigo: number) => ({
      codigo,
      codOcupacionCno: '0011',
      codDenominacionCno: `D-0011.00${codigo}`,
      descDenominacionCno: 'Alcalde',
      codOcupacionCuoc: '11110',
      codDenominacionCuoc: `11110.00${codigo}`,
      descDenominacionCuoc: 'Alcalde',
      estado: null,
      observacion: null
    });
    backend
      .expectOne((request) => request.url === '/api/correlativa' && request.params.get('page') === '1' && request.params.get('limit') === '500')
      .flush({ data: [row(1)], total: 2, page: 1, limit: 500, totalPages: 2 });
    backend
      .expectOne((request) => request.url === '/api/correlativa' && request.params.get('page') === '2')
      .flush({ data: [row(2)], total: 2, page: 2, limit: 500, totalPages: 2 });
    expect(page?.total).toBe(2);
    expect(page?.items.map((item) => ('cuocDenominationCode' in item ? item.cuocDenominationCode : ''))).toEqual(['11110.001', '11110.002']);
  });
});
