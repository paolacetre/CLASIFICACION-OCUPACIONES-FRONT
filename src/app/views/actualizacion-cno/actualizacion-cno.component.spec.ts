/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { ToastService } from '../../shared/toast/toast.service';
import { ActualizacionCnoComponent, CNO_TAB_STORAGE_KEY } from './actualizacion-cno.component';

describe('ActualizacionCnoComponent', () => {
  let fixture: ComponentFixture<ActualizacionCnoComponent>;
  let component: ActualizacionCnoComponent;
  let compiled: HTMLElement;
  let toastService: ToastService;

  afterEach(() => {
    sessionStorage.removeItem(CNO_TAB_STORAGE_KEY);
    clearTestSession();
  });

  beforeEach(async () => {
    sessionStorage.removeItem(CNO_TAB_STORAGE_KEY);
    await create();
  });

  async function create(): Promise<void> {
    TestBed.configureTestingModule({ imports: [ActualizacionCnoComponent] });
    startTestSession();
    fixture = TestBed.createComponent(ActualizacionCnoComponent);
    component = fixture.componentInstance;
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  }

  /** Deja pasar la consulta o escritura pendiente y repinta. */
  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
  }

  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const text = (selector: string) => clean(compiled.querySelector(selector)?.textContent)?.replace(/,(?=\S)/g, ', ');
  const texts = (selector: string) => Array.from(compiled.querySelectorAll(selector)).map((item) => clean(item.textContent));
  const button = (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => clean(item.textContent) === label) as HTMLButtonElement;
  const type = (selector: string, value: string) => {
    const input = compiled.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('should show the header, the tabs and the qualification levels like the deployed screen', () => {
    expect(text('h1')).toBe('Actualización - CNO');
    expect(text('.ui-page-subtitle')).toBe('Gestiona y actualiza la Clasificación Nacional de Ocupaciones (CNO).');
    expect(button('Cargar Excel')).toBeTruthy();
    expect(button('Agregar ocupación')).toBeTruthy();
    expect(texts('.ui-tab')).toEqual(['Nivel de cualificación', 'Área de desempeño', 'Habilidades', 'Conocimientos', 'Ocupación']);
    expect(texts('.acno-table th')).toEqual(['', 'Nivel', 'Nombre', 'Descripción', 'Fecha de registro', 'Acciones']);
    expect(texts('.acno-code')).toEqual(['0', '1', '2', '3', '4', '6']);
    expect(text('.acno-count')).toBe('6 registros encontrados, 0 inactivos');
    expect(button('Agregar Nivel de cualificación')).toBeTruthy();
    expect(texts('tbody tr:first-child .acno-actions button')).toEqual(['Editar', 'Eliminar']);
    expect(text('.ui-pagination > span')).toBe('Mostrando 1 a 6 de 6 registros');
    expect(texts('.ui-page-btn.active')).toEqual(['1']);
  });

  it('should search, filter, sort and paginate', fakeAsync(() => {
    type('input[name="search"]', 'auxiliares');
    refresh();
    expect(texts('.acno-code')).toEqual(['3', '4']);

    type('input[name="search"]', '');
    component.toggleFilters();
    component.pendingDescription = 'without';
    component.applyFilters();
    refresh();
    expect(texts('.acno-code')).toEqual(['0']);

    component.clearFilters();
    component.sortBy('code');
    component.sortBy('code');
    refresh();
    expect(texts('.acno-code')).toEqual(['6', '4', '3', '2', '1', '0']);

    component.pageSize = 2;
    component.onPageSizeChange();
    refresh();
    button('2').click();
    refresh();
    expect(texts('.acno-code')).toEqual(['3', '2']);
    expect(text('.ui-pagination > span')).toBe('Mostrando 3 a 4 de 6 registros');
    // Números de página: los botones de la paginación sin nombre accesible propio (anterior y siguiente lo tienen).
    expect(texts('.ui-pagination .ui-page-btn:not([aria-label])')).toEqual(['1', '2', '3']);
  }));

  it('should mark rows with their checkboxes', () => {
    (compiled.querySelector('thead .acno-check') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('tbody tr.selected').length).toBe(6);

    (compiled.querySelector('tbody .acno-check') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('tbody tr.selected').length).toBe(5);
    expect((compiled.querySelector('thead .acno-check') as HTMLInputElement).checked).toBeFalse();
  });

  it('should load each catalog when its tab opens', fakeAsync(() => {
    button('Habilidades').click();
    refresh();
    expect(texts('.acno-name')).toEqual(['Análisis de necesidades', 'Análisis de control de calidad']);
    expect(texts('.acno-table th')[1]).toBe('Código');
    expect(button('Agregar Habilidad')).toBeTruthy();
  }));

  it('should list the occupations with their description, date and inactive ones', fakeAsync(() => {
    button('Ocupación').click();
    refresh();
    expect(texts('.acno-code')).toEqual(['0011', '1111', '3311']);
    expect(texts('.acno-date')).toEqual(['05/03/2024', '—', '—']);
    expect(texts('.acno-description')).toEqual(['Definen, formulan y orientan la política del poder público.', '—', 'Prestan cuidados básicos de salud.']);
    expect(text('.acno-count')).toBe('3 registros encontrados, 1 inactivo');
    expect(compiled.querySelectorAll('tbody tr.inactive').length).toBe(1);
    expect(button('Agregar Nivel de cualificación')).toBeUndefined();

    component.toggleFilters();
    component.pendingStatus = 'inactive';
    component.applyFilters();
    refresh();
    expect(texts('.acno-code')).toEqual(['3311']);
  }));

  it('should reopen the same tab after reloading the page', async () => {
    button('Conocimientos').click();
    fixture.detectChanges();
    expect(sessionStorage.getItem(CNO_TAB_STORAGE_KEY)).toBe('knowledge');

    // Recargar: el componente se vuelve a crear.
    fixture.destroy();
    fixture = TestBed.createComponent(ActualizacionCnoComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(component.tab).toBe('knowledge');
    expect(text('.ui-tab.active')).toBe('Conocimientos');
    expect(texts('.acno-name')).toEqual(['Administración y gerencia', 'Anatomía']);
    // Conocimientos lleva Estado después de Descripción (el backend no guarda estado: todos activos).
    expect(texts('.acno-table th')).toEqual(['', 'Código', 'Conocimiento', 'Descripción', 'Estado', 'Fecha de registro', 'Acciones']);
    expect(texts('tbody .ui-badge-ok')).toEqual(['Activo', 'Activo']);
  });

  it('should have edit and delete side by side in every tab, and delete occupations after warning', fakeAsync(() => {
    for (const label of ['Área de desempeño', 'Habilidades', 'Conocimientos', 'Ocupación']) {
      button(label).click();
      refresh();
      expect(texts('tbody tr:first-child .acno-actions button')).withContext(label).toEqual(['Editar', 'Eliminar']);
    }
    expect(texts('.acno-code')).toEqual(['0011', '1111', '3311']);

    component.requestDelete(component.pageItems[1]);
    refresh();
    expect(text('[role="dialog"] h2')).toBe('¿Eliminar ocupación?');
    expect(text('#confirm-dialog-message')).toContain('junto con sus funciones');
    button('Sí, eliminar').click();
    refresh(MOCK_LATENCY_MS);
    expect(texts('.acno-code')).toEqual(['0011', '3311']);
  }));

  it('should add a level after checking code and name', fakeAsync(() => {
    const success = spyOn(toastService, 'success');
    button('Agregar Nivel de cualificación').click();
    refresh();
    expect(text('#acno-editor-title')).toBe('Agregar nivel de cualificación CNO');

    type('#acno-code', '1');
    type('#acno-name', 'nivel 2 (b) - técnicos y supervisores');
    button('Guardar nivel').click();
    refresh();
    expect(texts('.ui-form-error')).toEqual(['Ya existe un registro con este código.', 'Ya existe un registro con este nombre.']);

    type('#acno-code', '7');
    type('#acno-name', 'Nivel 7 - Prueba');
    button('Guardar nivel').click();
    refresh(MOCK_LATENCY_MS);

    expect(compiled.querySelector('[role="dialog"]')).toBeNull();
    expect(component.lists.level?.map((item) => item.code)).toContain('7');
    expect(success).toHaveBeenCalledWith('Se agregó al catálogo: Nivel de cualificación 7.');
  }));

  it('should edit a record without changing its code', fakeAsync(() => {
    (compiled.querySelectorAll('tbody tr')[2].querySelector('.acno-edit') as HTMLButtonElement).click();
    refresh();
    expect(text('#acno-editor-title')).toBe('Editar nivel de cualificación 2');
    expect((compiled.querySelector('#acno-code') as HTMLInputElement).disabled).toBeTrue();
    expect(text('#acno-code-hint')).toBe('Identifica al nivel; no se puede cambiar.');

    type('#acno-name', 'Nivel 2 (B) - Técnicos');
    button('Guardar cambios').click();
    refresh(MOCK_LATENCY_MS);

    expect(texts('.acno-name')[2]).toBe('Nivel 2 (B) - Técnicos');
  }));

  it('should delete after confirming and show why the server refuses', fakeAsync(() => {
    const error = spyOn(toastService, 'error');
    component.requestDelete(component.pageItems[1]);
    refresh();
    expect(text('[role="dialog"] h2')).toBe('¿Eliminar nivel?');
    button('Sí, eliminar').click();
    refresh(MOCK_LATENCY_MS);
    expect(error).toHaveBeenCalledWith(jasmine.stringContaining('No se puede eliminar'));
    expect(texts('.acno-code')).toContain('1');

    component.requestDelete(component.pageItems[5]);
    refresh();
    button('Sí, eliminar').click();
    refresh(MOCK_LATENCY_MS);
    expect(texts('.acno-code')).not.toContain('6');
  }));
});
