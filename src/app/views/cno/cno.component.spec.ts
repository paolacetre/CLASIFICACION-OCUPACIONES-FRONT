/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CnoComponent } from './cno.component';
import { SEARCH_DEBOUNCE_MS } from '../../shared/ui/list';
import { clearTestSession, endTestSession, startTestSession } from '../../shared/auth/session.testing';

describe('CnoComponent', () => {
  let fixture: ComponentFixture<CnoComponent>;
  let component: CnoComponent;
  let compiled: HTMLElement;

  /** Crea la vista; por defecto con la sesión del administrador (ve lo inactivo y la fecha de registro). */
  function create(asAdmin = true): void {
    clearTestSession();
    TestBed.configureTestingModule({ imports: [CnoComponent] });
    if (asAdmin) {
      startTestSession();
    }
    fixture = TestBed.createComponent(CnoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => clearTestSession());

  /** Escribe en el buscador y espera la pausa. */
  function type(query: string): void {
    component.filters.query = query;
    component.onQueryChange();
    tick(SEARCH_DEBOUNCE_MS);
    fixture.detectChanges();
  }

  /** Elige en los selectores y pulsa «Aplicar filtros». */
  function apply(changes: Partial<CnoComponent['draft']>): void {
    for (const [key, value] of Object.entries(changes)) {
      component.setDraft(key as never, value as string);
    }
    button('Aplicar filtros').click();
    tick();
    fixture.detectChanges();
  }

  const rows = () => Array.from(compiled.querySelectorAll('.ui-table tbody tr')).map((row) => row.textContent ?? '');
  const button = (text: string) => Array.from(compiled.querySelectorAll('button')).find((item) => item.textContent?.includes(text)) as HTMLButtonElement;
  /** Abre el selector del filtro, lee sus opciones y lo cierra (las listas son selectores propios, no `<select>`). */
  const options = (id: string) => {
    const trigger = compiled.querySelector(`#${id}`) as HTMLButtonElement;
    trigger.click();
    tick();
    fixture.detectChanges();
    const labels = Array.from(compiled.querySelectorAll('.fc-panel .fc-option')).map((item) => item.textContent?.trim());
    trigger.click();
    fixture.detectChanges();
    return labels;
  };
  const headers = () => Array.from(compiled.querySelectorAll('.ui-table thead th')).map((item) => item.textContent?.trim());

  it('should show the «Filtros de búsqueda» card and invite to search, with Exportar and Limpiar filtros disabled', fakeAsync(() => {
    create();
    tick();
    fixture.detectChanges();
    expect(compiled.querySelector('#co-filters-title')?.textContent).toBe('Filtros de búsqueda');
    expect(Array.from(compiled.querySelectorAll('.co-filter-label')).map((item) => item.textContent?.trim())).toEqual([
      'Búsqueda', 'Nivel de cualificación', 'Área de desempeño', 'Función', 'Estado'
    ]);
    // El nivel se muestra por su código, como el front original.
    expect(options('co-filter-level')).toEqual(['Todos', 'Nivel 1 (A)', 'Nivel 2 (B)', 'Nivel 3,4 (C)', 'Nivel 6 (D)']);
    expect(options('co-filter-status')).toEqual(['Todos', 'Activo', 'Inactivo']);
    expect((compiled.querySelector('#co-query') as HTMLInputElement).placeholder).toBe('Ej. 1311 o secretario');
    expect(compiled.querySelector('.co-prompt')?.textContent).toContain('Busca una ocupación');
    expect(compiled.querySelector('.ui-table')).toBeNull();
    expect(button('Exportar').disabled).toBeTrue();
    expect(button('Limpiar filtros').disabled).toBeTrue();
  }));

  it('should list the occupations that match the text, ignoring accents, once typing pauses', fakeAsync(() => {
    create();
    component.filters.query = 'mecanica';
    component.onQueryChange();
    tick(SEARCH_DEBOUNCE_MS - 1);
    expect(component.results).toBeNull();

    tick(1);
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    expect(rows()[0]).toContain('Técnicos en mecánica');
    expect(button('Exportar').disabled).toBeFalse();
  }));

  it('should apply the selectors only with «Aplicar filtros», combine them and go back to the invitation when clearing', fakeAsync(() => {
    create();
    component.setDraft('area', 'Finanzas y Administración');
    fixture.detectChanges();
    expect(component.results).toBeNull();
    expect(component.pendingChanges).toBeTrue();
    expect(button('Limpiar filtros').disabled).toBeFalse();

    apply({});
    expect(rows().length).toBe(3);
    expect(component.pendingChanges).toBeFalse();

    apply({ level: 'Técnicos y supervisores' });
    expect(rows().length).toBe(1);

    apply({ level: '', area: '', function: 'F-2111.02' });
    expect(rows().map((row) => row.includes('Físicos y astrónomos'))).toEqual([true]);

    apply({ function: '', status: 'Activo' });
    type('8611');
    expect(rows().length).toBe(0);
    expect(compiled.querySelector('.ui-empty')?.textContent).toContain('No encontramos ocupaciones para esta búsqueda');

    button('Limpiar filtros').click();
    tick();
    fixture.detectChanges();
    expect(component.results).toBeNull();
    expect(component.draft.status).toBe('');
    expect(compiled.querySelector('.co-prompt')).toBeTruthy();
  }));

  it('should show the level code, the registration date and the inactive occupations to an administrator', fakeAsync(() => {
    create();
    type('8611');
    expect(headers()).toEqual(['Código', 'Ocupación', 'Nivel de cualificación', 'Área de desempeño', 'Fecha de registro', 'Denominaciones', 'Funciones', 'Habilidades', 'Conocimientos']);
    expect(compiled.querySelector('.co-status-line')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 resultado, 1 inactivos visibles para “8611”');
    const row = compiled.querySelector('.ui-table tbody tr') as HTMLElement;
    expect(row.classList).toContain('co-row-inactive');
    expect(row.textContent).toContain('Nivel 6 (D)');
    expect(row.textContent).toContain('—');
  }));

  it('should not show the registration date to other roles', fakeAsync(() => {
    create(false);
    type('211');
    expect(headers()).not.toContain('Fecha de registro');
  }));

  it('should show the result count for the searched text and sort by the column headers', fakeAsync(() => {
    create();
    type('211');
    expect(compiled.querySelector('.co-status-line')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('4 resultados para “211”');
    const codes = () => Array.from(compiled.querySelectorAll('.ui-table tbody tr td:first-child')).map((cell) => cell.textContent?.trim());
    expect(codes()).toEqual(['2111', '2112', '2113', '2114']);

    const codeHeader = compiled.querySelector('.co-sort') as HTMLButtonElement;
    // El orden lo resuelve el servidor: cada clic vuelve a consultar.
    codeHeader.click();
    tick();
    fixture.detectChanges();
    expect(codes()).toEqual(['2114', '2113', '2112', '2111']);
    expect(codeHeader.closest('th')?.getAttribute('aria-sort')).toBe('descending');

    component.sortBy('name');
    tick();
    fixture.detectChanges();
    expect(rows()[0]).toContain('Físicos y astrónomos');
    expect(rows()[0]).toContain('Nivel 1 (A)');
  }));

  it('should page the results on the server: page size, page numbers and the range shown', fakeAsync(() => {
    create();
    apply({ status: 'Activo' });
    expect(component.total).toBe(11);
    expect(rows().length).toBe(8);
    expect(compiled.querySelector('.ui-pagination > span')?.textContent?.trim()).toBe('Mostrando 1 a 8 de 11 ocupaciones');

    (Array.from(compiled.querySelectorAll<HTMLButtonElement>('.ui-page-btn')).find((item) => item.textContent?.trim() === '2')!).click();
    tick();
    fixture.detectChanges();
    expect(rows().length).toBe(3);
    expect(compiled.querySelector('.ui-pagination > span')?.textContent?.trim()).toBe('Mostrando 9 a 11 de 11 ocupaciones');

    component.pageSize = 25;
    component.onPageSizeChange();
    tick();
    fixture.detectChanges();
    expect(component.page).toBe(1);
    expect(rows().length).toBe(11);
  }));

  const tab = (text: string) => Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes(text))!;

  it('should open the profile with the active elements, and the inactive ones apart for an administrator', fakeAsync(() => {
    create();
    type('211');
    (compiled.querySelector('.ui-table tbody tr') as HTMLElement).click();
    tick();
    fixture.detectChanges();

    expect(compiled.querySelector('.ui-table')).toBeNull();
    expect(compiled.querySelector('.co-detail-title')?.textContent).toContain('Físicos y astrónomos');
    expect(compiled.querySelector('.co-detail-heading .ui-hint')?.textContent).toContain('Nivel 1 (A)');
    expect(Array.from(compiled.querySelectorAll('.co-stat-value')).map((item) => item.textContent)).toEqual(['5', '5', '5', '5']);
    expect(Array.from(compiled.querySelectorAll('.co-stat .co-inactive-count')).map((item) => item.textContent?.trim())).toEqual(['+1 inact.', '+1 inact.']);
    expect((compiled.querySelector('#co-detail-description') as HTMLTextAreaElement).value).toContain('investigaciones teóricas');
    expect((compiled.querySelector('#co-detail-level') as HTMLInputElement).value).toBe('Nivel 1 (A)');
    expect((compiled.querySelector('#co-detail-area') as HTMLInputElement).value).toBe('2 · Ciencias Naturales, Aplicadas y Relacionadas');

    tab('Denominaciones').click();
    fixture.detectChanges();
    const panel = () => compiled.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(tab('Denominaciones').getAttribute('aria-selected')).toBe('true');
    expect(panel().textContent).toContain('(1 inactivas disponibles en el desplegable inferior)');
    expect(Array.from(panel().querySelectorAll('.co-list-head span')).map((item) => item.textContent)).toEqual(['Código', 'Denominación', 'Fecha de registro']);
    expect(panel().querySelector('.co-item-code')?.textContent).toBe('D-2111.001');
    expect(panel().textContent).not.toContain('Astrólogo');

    button('Denominaciones inactivas').click();
    fixture.detectChanges();
    expect(panel().querySelector('.co-inactive-list')?.textContent).toContain('Astrólogo');

    // Una ocupación relacionada abre su propio perfil.
    tab('Ocupaciones relacionadas').click();
    fixture.detectChanges();
    (panel().querySelector('.co-row-link') as HTMLButtonElement).click();
    tick();
    fixture.detectChanges();
    expect(compiled.querySelector('.co-detail-title')?.textContent).toContain('Químicos');
    expect(panel().querySelector('#co-detail-code')).toBeTruthy();

    button('Volver a resultados').click();
    fixture.detectChanges();
    expect(compiled.querySelector('.co-detail')).toBeNull();
    expect(rows().length).toBe(4);
  }));

  it('should show only the active elements to other roles', fakeAsync(() => {
    create(false);
    type('2111');
    (compiled.querySelector('.ui-table tbody tr') as HTMLElement).click();
    tick();
    fixture.detectChanges();
    expect(compiled.querySelector('.co-inactive-count')).toBeNull();
    tab('Funciones').click();
    fixture.detectChanges();
    const panel = compiled.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel.querySelectorAll('.co-item').length).toBe(5);
    expect(panel.querySelector('.co-inactive')).toBeNull();
    expect(panel.textContent).not.toContain('Calibrar telescopios');
  }));

  it('should ask which columns to export, with all of them marked', fakeAsync(() => {
    create();
    type('211');
    button('Exportar').click();
    fixture.detectChanges();
    const dialog = () => compiled.querySelector('.co-export') as HTMLElement;
    expect(dialog().querySelector('h2')?.textContent).toBe('Exportar a Excel');
    const boxes = Array.from(dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(Array.from(dialog().querySelectorAll('.co-export-column')).map((item) => item.textContent?.trim())).toEqual([
      'Código C.N.O', 'Nombre de la Ocupación', 'Área de Desempeño', 'Estado', 'Denominaciones', 'Funciones', 'Habilidades', 'Conocimientos'
    ]);
    expect(boxes.every((box) => box.checked)).toBeTrue();

    boxes.forEach((box) => box.click());
    fixture.detectChanges();
    expect(button('Descargar Excel').disabled).toBeTrue();

    button('Cancelar').click();
    fixture.detectChanges();
    expect(dialog()).toBeNull();
    endTestSession();
  }));

  it('should open the usage guide and close it with "Entendido"', fakeAsync(() => {
    create();
    button('Guía de uso').click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')?.textContent).toContain('Guía de uso · CNO');

    button('Entendido').click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();
  }));
});
