/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../../shared/auth/session.testing';
import { ActualizacionCnoService } from '../actualizacion-cno.service';
import { FakeActualizacionCnoService } from '../actualizacion-cno.testing';
import { CargaCnoComponent } from './carga-cno.component';
import { verdictOf } from './carga-cno.model';

describe('CargaCnoComponent', () => {
  let fixture: ComponentFixture<CargaCnoComponent>;
  let component: CargaCnoComponent;
  let compiled: HTMLElement;
  let fake: FakeActualizacionCnoService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CargaCnoComponent] });
    startTestSession();
    fixture = TestBed.createComponent(CargaCnoComponent);
    component = fixture.componentInstance;
    fake = TestBed.inject(ActualizacionCnoService) as unknown as FakeActualizacionCnoService;
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => clearTestSession());

  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
  }

  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => clean(compiled.querySelector(selector)?.textContent);
  const texts = (selector: string) => Array.from(compiled.querySelectorAll(selector)).map((item) => clean(item.textContent));
  const button = (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => clean(item.textContent) === label) as HTMLButtonElement;
  const excel = (name = 'niveles.xlsx', size = 2048) => new File([new Uint8Array(size)], name);

  it('should offer the whole file and the five types like the deployed modal', () => {
    expect(text('#cc-title')).toBe('Cargar información CNO');
    expect(texts('.cc-option strong')).toEqual(['Todo el archivo', 'Nivel', 'Área de desempeño', 'Habilidades', 'Conocimientos', 'Ocupación']);
    expect(text('.cc-empty')).toContain('aquí verás el resultado de la revisión');
    expect(texts('.cc-left > .ui-hint')).toEqual(['Elige primero qué información vas a cargar.']);
    expect(button('Cargar información').disabled).toBeTrue();
  });

  it('should review the file of a type and show its columns, preview and errors before loading', fakeAsync(() => {
    (compiled.querySelectorAll('.cc-option')[1] as HTMLButtonElement).click();
    component.receive(excel());
    refresh();
    expect(text('.cc-placeholder strong')).toBe('Analizando archivo…');
    refresh(MOCK_LATENCY_MS);

    expect(text('.cc-right .ui-alert')).toBe('Se encontraron 1 registro(s) con inconsistencias de 3.');
    expect(texts('.cc-figures dd')).toEqual(['3', '3', '2', '1']);
    expect(texts('.cc-checks li .cc-grow')).toEqual(['Código de cualificación ↳ cod_cualificacion_cno', 'Nivel de cualificación ↳ niveles_cualificacion_cno', 'Descripción']);
    expect(button('Cargar información').disabled).toBeFalse();

    // «Configurar»: la columna que no corresponde se asigna a Descripción y se vuelve a revisar con esa corrección.
    button('Columnas detectadas (3) · 2 reconocidas').click();
    fixture.detectChanges();
    button('Configurar').click();
    fixture.detectChanges();
    component.configuringField = 'descripcion';
    fixture.detectChanges();
    button('Asignar «columna_extra»').click();
    refresh(MOCK_LATENCY_MS);
    expect(component.mapping).toEqual({ columna_extra: 'descripcion' });
    expect(texts('.cc-checks li .cc-grow')[2]).toBe('Descripción ↳ columna_extra');

    button('Registros con errores (1)').click();
    fixture.detectChanges();
    expect(texts('.cc-table tbody td')).toEqual(['3', 'Código de cualificación', '—', 'Campo obligatorio vacío.', 'Completa «Código de cualificación» en esta fila o elimínala del archivo.']);

    // Cargar envía la corrección y muestra el veredicto.
    const loaded = spyOn(component.loaded, 'emit');
    button('Cargar información').click();
    refresh(MOCK_LATENCY_MS);
    expect(fake.uploads).toEqual([{ type: 'nivel', mapping: { columna_extra: 'descripcion' } }]);
    expect(text('.cc-result .ui-alert strong')).toBe('Carga parcial: 1 filas no se cargaron');
    expect(loaded).toHaveBeenCalled();
    expect(button('Finalizar')).toBeTruthy();
  }));

  it('should not load a file that is not of the chosen type, nor one without rows', fakeAsync(() => {
    component.chooseType('area');
    component.receive(excel('otro.xlsx'));
    refresh(MOCK_LATENCY_MS);
    expect(text('.cc-right .ui-alert')).toBe('El archivo no corresponde a «Área de desempeño». Faltan: Código de cualificación, Nivel de cualificación. Parece ser de «Nivel».');
    expect(button('Cargar información').disabled).toBeTrue();

    component.receive(excel('vacio.xlsx'));
    refresh(MOCK_LATENCY_MS);
    expect(text('.cc-right .ui-alert')).toBe('La hoja se reconoció pero no tiene filas con datos.');
    expect(button('Cargar información').disabled).toBeTrue();
  }));

  it('should reject files that are not Excel or are too big', () => {
    component.chooseType('nivel');
    component.receive(excel('datos.csv'));
    fixture.detectChanges();
    expect(text('.cc-error')).toBe('El archivo debe ser Excel (.xlsx, .xls).');

    component.receive(excel('grande.xlsx', 11 * 1024 * 1024));
    fixture.detectChanges();
    expect(text('.cc-error')).toBe('El archivo pesa 11.0 MB y el máximo permitido es 10 MB.');
    expect(button('Cargar información').disabled).toBeTrue();
  });

  it('should load the whole file type by type, in order', fakeAsync(() => {
    component.chooseWhole();
    component.receive(excel('completo.xlsx'));
    fixture.detectChanges();
    expect(texts('.cc-order li')).toEqual(['Nivel', 'Área de desempeño', 'Habilidades', 'Conocimientos', 'Ocupación']);
    expect(button('Descargar plantilla completa')).toBeTruthy();

    button('Cargar todo el archivo').click();
    refresh(MOCK_LATENCY_MS * 6);
    expect(fake.uploads.map((upload) => upload.type)).toEqual(['nivel', 'area', 'habilidades', 'conocimientos', 'ocupacion']);
    expect(texts('.cc-result .cc-type-status small')).toEqual(Array(5).fill('2 creados · 0 actualizados'));
    expect(texts('.cc-figures dd').slice(0, 2)).toEqual(['10', '0']);
  }));

  it('should explain the result like the deployed form', () => {
    const base = { message: '', inserted: 0, updated: 0, skipped: 0, unreadable: 0, errors: 0, warnings: 0, sheets: [] };
    expect(verdictOf({ ...base, inserted: 3 }).state).toBe('ok');
    expect(verdictOf({ ...base, inserted: 3, warnings: 1 }).state).toBe('warning');
    expect(verdictOf({ ...base, inserted: 3, errors: 1 }).state).toBe('partial');
    expect(verdictOf({ ...base, skipped: 4 }).state).toBe('unchanged');
    expect(verdictOf(base).state).toBe('empty');
    expect(verdictOf({ ...base, errors: 2 }).state).toBe('failed');
  });
});
