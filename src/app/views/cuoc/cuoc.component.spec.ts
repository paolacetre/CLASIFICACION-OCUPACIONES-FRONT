/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CuocComponent } from './cuoc.component';
import { SEARCH_DEBOUNCE_MS } from '../../shared/ui/list';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';

describe('CuocComponent', () => {
  let fixture: ComponentFixture<CuocComponent>;
  let component: CuocComponent;
  let compiled: HTMLElement;

  /** Crea la vista con la sesión del administrador. */
  function create(): void {
    clearTestSession();
    TestBed.configureTestingModule({ imports: [CuocComponent] });
    startTestSession();
    fixture = TestBed.createComponent(CuocComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => clearTestSession());

  const button = (text: string) => Array.from(compiled.querySelectorAll('button')).find((item) => item.textContent?.includes(text)) as HTMLButtonElement;
  const rows = () => Array.from(compiled.querySelectorAll('.ui-table tbody tr')).map((row) => row.textContent ?? '');
  const codes = () => Array.from(compiled.querySelectorAll('.ui-table tbody tr td:first-child')).map((cell) => cell.textContent?.trim());

  /** Escribe en el buscador y espera la pausa. */
  function type(query: string): void {
    component.filters.query = query;
    component.onQueryChange();
    tick(SEARCH_DEBOUNCE_MS);
    fixture.detectChanges();
  }

  it('should show the filters card and invite to search, with Exportar and Limpiar filtros disabled', fakeAsync(() => {
    create();
    tick();
    fixture.detectChanges();
    expect(compiled.querySelector('#co-filters-title')?.textContent).toBe('Filtros de búsqueda');
    expect(Array.from(compiled.querySelectorAll('.co-filter-label')).map((item) => item.textContent?.trim())).toEqual([
      'Búsqueda', 'Nivel de competencia', 'Gran grupo', 'Grupo principal', 'Grupo primario', 'Función', 'Estado'
    ]);
    expect(compiled.querySelector('.co-prompt')?.textContent).toContain('Busca una ocupación');
    expect(compiled.querySelector('.ui-table')).toBeNull();
    expect(button('Exportar').disabled).toBeTrue();
    expect(button('Limpiar filtros').disabled).toBeTrue();
  }));

  it('should list the occupations that match the text, ignoring accents, once typing pauses', fakeAsync(() => {
    create();
    component.filters.query = 'tecnico';
    component.onQueryChange();
    tick(SEARCH_DEBOUNCE_MS - 1);
    expect(component.results).toBeNull();

    tick(1);
    fixture.detectChanges();
    expect(rows().length).toBe(2);
    expect(button('Exportar').disabled).toBeFalse();
  }));

  it('should apply the selectors only with «Aplicar filtros» and go back to the invitation when clearing', fakeAsync(() => {
    create();
    component.setDraft('area', 'Salud y bienestar');
    fixture.detectChanges();
    expect(component.results).toBeNull();
    expect(component.pendingChanges).toBeTrue();

    button('Aplicar filtros').click();
    tick();
    fixture.detectChanges();
    expect(codes()).toEqual(['22210', '32210', '53210']);

    button('Limpiar filtros').click();
    tick();
    fixture.detectChanges();
    expect(component.results).toBeNull();
    expect(compiled.querySelector('.co-prompt')).toBeTruthy();
  }));

  it('should open the profile of the clicked occupation and go back to the results', fakeAsync(() => {
    create();
    type('22210');
    (compiled.querySelector('.ui-table tbody tr') as HTMLElement).click();
    tick();
    fixture.detectChanges();
    expect(compiled.querySelector('.ui-table')).toBeNull();
    expect(compiled.querySelector('.co-detail-title')?.textContent).toContain('Profesionales de enfermería');

    button('Volver a resultados').click();
    fixture.detectChanges();
    expect(compiled.querySelector('.co-detail')).toBeNull();
    expect(rows().length).toBe(1);
  }));

  it('should open the usage guide and close it with "Entendido"', fakeAsync(() => {
    create();
    button('Guía de uso').click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')?.textContent).toContain('Guía de uso · CUOC');

    button('Entendido').click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();
  }));
});
