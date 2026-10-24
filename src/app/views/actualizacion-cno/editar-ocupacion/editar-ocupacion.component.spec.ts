/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../../shared/auth/session.testing';
import { ActualizacionCnoService } from '../actualizacion-cno.service';
import { FakeActualizacionCnoService } from '../actualizacion-cno.testing';
import { EditarOcupacionComponent } from './editar-ocupacion.component';

describe('EditarOcupacionComponent', () => {
  let fixture: ComponentFixture<EditarOcupacionComponent>;
  let component: EditarOcupacionComponent;
  let compiled: HTMLElement;
  let fake: FakeActualizacionCnoService;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [EditarOcupacionComponent] });
    startTestSession();
    fake = TestBed.inject(ActualizacionCnoService) as unknown as FakeActualizacionCnoService;
    fixture = TestBed.createComponent(EditarOcupacionComponent);
    component = fixture.componentInstance;
    component.code = '1111';
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
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
  const tab = (label: string) => Array.from(compiled.querySelectorAll<HTMLButtonElement>('.ui-tab')).find((item) => clean(item.textContent)?.startsWith(label))!;

  it('should show the occupation with its six tabs and the summary', () => {
    expect(text('h1')).toBe('Ocupación (Editar)');
    expect(texts('.ui-tab')).toEqual(['Información básica', 'Denominaciones 2', 'Funciones 1', 'Habilidades 1', 'Conocimientos 1', 'Relacionadas 1']);
    expect((compiled.querySelector('#eo-code') as HTMLInputElement).value).toBe('1111');
    expect((compiled.querySelector('#eo-code') as HTMLInputElement).disabled).toBeTrue();
    expect((compiled.querySelector('#eo-name') as HTMLInputElement).value).toBe('Auxiliares contables');
    expect(texts('.eo-summary-list dd').slice(0, 3)).toEqual(['1111', 'Auxiliares contables', 'Finanzas y Administración']);
  });

  it('should edit the lists and save on the original occupation', fakeAsync(() => {
    const saved = spyOn(component.saved, 'emit');

    tab('Denominaciones').click();
    refresh();
    expect(texts('.eo-table tbody .ui-badge')).toEqual(['Activa', 'Inactiva']);
    button('+ Agregar denominación').click();
    refresh();
    const inputs = compiled.querySelectorAll<HTMLInputElement>('.eo-row-input');
    inputs[2].value = 'Tenedor de libros';
    inputs[2].dispatchEvent(new Event('input'));
    refresh();
    expect(texts('.eo-table tbody .ui-badge')[2]).toBe('Nueva');

    tab('Funciones').click();
    refresh();
    button('+ Agregar función').click();
    refresh();
    // La función nueva queda desplegada para escribirla; vacía no se puede guardar.
    button('Guardar cambios').click();
    refresh();
    expect(component.tab).toBe('functions');
    expect(text('.eo-error')).toBe('Completa o quita las funciones vacías.');
    const area = compiled.querySelector<HTMLTextAreaElement>('.eo-function-text')!;
    area.value = 'Conciliar las cuentas bancarias.';
    area.dispatchEvent(new Event('input'));
    refresh();

    // Conocimientos: se agregan desde el catálogo.
    tab('Conocimientos').click();
    refresh();
    button('+ Agregar conocimientos').click();
    refresh();
    expect(text('#cs-title')).toBe('Agregar conocimientos');
    const options = compiled.querySelectorAll<HTMLInputElement>('.cs-list input');
    expect(options[0].disabled).toBeTrue();
    options[1].click();
    refresh();
    button('Agregar (1)').click();
    refresh();
    expect(texts('.eo-linked-name')).toEqual(['Administración y gerencia', 'Anatomía']);

    // Relacionadas: se quita una.
    tab('Relacionadas').click();
    refresh();
    (compiled.querySelector('.eo-linked .eo-remove') as HTMLButtonElement).click();
    refresh();

    button('Guardar cambios').click();
    refresh(MOCK_LATENCY_MS);
    expect(saved).toHaveBeenCalledWith('1111');
    expect(fake.lastSaved?.areaName).toBe('Finanzas y Administración');
    expect(fake.lastSaved?.levelName).toBe('Nivel 2 (B) - Técnicos y supervisores');
    expect(fake.lastSaved?.occupation.denominations.map((row) => [row.code, row.text])).toEqual([
      ['D-1111.001', 'Auxiliar contable'],
      ['D-1111.002', 'Asistente contable'],
      ['', 'Tenedor de libros']
    ]);
    expect(fake.lastSaved?.occupation.functions.map((row) => row.text)).toEqual(['Registrar las transacciones financieras.', 'Conciliar las cuentas bancarias.']);
    expect(fake.lastSaved?.occupation.knowledge.map((item) => item.code)).toEqual(['1', '40']);
    expect(fake.lastSaved?.occupation.related).toEqual([]);
  }));

  it('should ask before leaving with unsaved changes', () => {
    const closed = spyOn(component.closed, 'emit');
    button('Volver a la lista').click();
    expect(closed).toHaveBeenCalledTimes(1);

    const name = compiled.querySelector<HTMLInputElement>('#eo-name')!;
    name.value = 'Auxiliares contables y financieros';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Volver a la lista').click();
    fixture.detectChanges();
    expect(text('#confirm-dialog-title')).toBe('¿Descartar los cambios?');
    button('Descartar').click();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});
