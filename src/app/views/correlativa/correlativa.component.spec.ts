/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CorrelativaComponent, createEmptyQuery } from './correlativa.component';
import { SEARCH_DEBOUNCE_MS } from '../../shared/ui/list';
import { CorrelativaService } from './correlativa.service';

describe('CorrelativaComponent', () => {
  let fixture: ComponentFixture<CorrelativaComponent>;
  let component: CorrelativaComponent;
  let compiled: HTMLElement;

  beforeEach(fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [CorrelativaComponent] });
    fixture = TestBed.createComponent(CorrelativaComponent);
    component = fixture.componentInstance;
    refresh();
    compiled = fixture.nativeElement as HTMLElement;
  }));

  /** Deja pasar la consulta pendiente y repinta. */
  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
  }

  const headers = () => Array.from(compiled.querySelectorAll('.ui-table th')).map((cell) => cell.textContent?.trim());
  const firstColumn = () => Array.from(compiled.querySelectorAll('.ui-table tbody tr td:first-child')).map((cell) => cell.textContent?.trim());
  const text = (selector: string) => compiled.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => item.textContent?.includes(label)) as HTMLButtonElement;

  it('should open on Denominación with its columns, the first page and the record count', () => {
    expect(headers()).toEqual([
      'ID', 'Código ocupación CNO', 'Código denominación CNO', 'Descripción denominación', 'Código ocupación CUOC', 'Descripción', 'Estado', 'Observación'
    ]);
    expect(firstColumn()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(compiled.querySelector('.ui-table tbody tr')?.textContent).toContain('D-0011.001');
    expect(text('.correlativa-toolbar .ui-badge')).toBe('12 registros encontrados');
    expect(text('.ui-pagination > span')).toBe('Mostrando 1 a 8 de 12 registros');
    expect(button('Descargar consultadas').textContent).toContain('(12)');
  });

  it('should move between pages and change the page size', fakeAsync(() => {
    const pageButton = Array.from(compiled.querySelectorAll<HTMLButtonElement>('.ui-page-btn')).find((item) => item.textContent?.trim() === '2')!;
    pageButton.click();
    refresh();
    expect(firstColumn()).toEqual(['9', '10', '11', '12']);
    expect(text('.ui-pagination > span')).toBe('Mostrando 9 a 12 de 12 registros');
    expect(compiled.querySelector('.ui-page-btn.active')?.textContent?.trim()).toBe('2');

    component.query.pageSize = 16;
    component.onFiltersChange();
    refresh();
    expect(firstColumn().length).toBe(12);
    expect(component.query.page).toBe(1);
    expect(component.pageCount).toBe(1);
  }));

  it('should search as the user types (after a pause) and filter Denominación by status', fakeAsync(() => {
    component.query.page = 2;
    component.query.text = 'gobernador';
    component.onTextChange();
    tick(SEARCH_DEBOUNCE_MS - 1);
    expect(component.result.total).toBe(12);
    refresh(1);
    expect(component.result.total).toBe(2);
    expect(component.query.page).toBe(1);

    component.query.text = '';
    component.onTextChange();
    refresh(SEARCH_DEBOUNCE_MS);
    button('Filtros').click();
    fixture.detectChanges();
    component.draft.status = 'Inactivo';
    component.applyFilters();
    refresh();
    expect(firstColumn()).toEqual(['12']);

    component.draft.cuocOccupationCode = '11130';
    component.draft.status = '';
    component.applyFilters();
    refresh();
    expect(component.result.total).toBe(1);

    button('Limpiar filtros').click();
    refresh();
    expect(component.result.total).toBe(12);
  }));

  it('should show the columns of Ocupación and Conocimiento when switching tabs, starting a new query', fakeAsync(() => {
    component.query.text = 'alcalde';
    component.onTextChange();
    refresh(SEARCH_DEBOUNCE_MS);

    const tab = (label: string) => Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes(label))!;
    tab('Ocupación').click();
    refresh();
    expect(component.query.text).toBe('');
    expect(headers()).toEqual(['ID', 'Código ocupación CNO', 'Nombre', 'Código ocupación CUOC', 'Nombre CUOC']);
    expect(text('.correlativa-toolbar .ui-badge')).toBe('10 registros encontrados');
    expect(button('Filtros')).toBeUndefined();

    tab('Conocimiento').click();
    refresh();
    expect(headers()).toEqual(['ID', 'Código conocimiento CNO', 'Nombre conocimiento CNO', 'Código conocimiento CUOC', 'Nombre conocimiento CUOC', 'Aplicado']);
    expect(compiled.querySelector('.ui-table tbody tr')?.textContent).toContain('Gerencia y administración');

    component.draft.applied = 'no';
    component.applyFilters();
    refresh();
    expect(firstColumn()).toEqual(['10']);
    expect(compiled.querySelector('.ui-table tbody tr')?.textContent).toContain('No aplicado');
  }));

  it('should say so when nothing matches', fakeAsync(() => {
    component.query.text = 'zzz';
    component.onTextChange();
    refresh(SEARCH_DEBOUNCE_MS);
    expect(compiled.querySelector('.ui-table')).toBeNull();
    expect(compiled.querySelector('.ui-empty')?.textContent).toContain('Sin resultados');
    expect(button('Descargar consultadas').disabled).toBeTrue();
    expect(button('Descargar todo').disabled).toBeFalse();
  }));

  it('should export every record of the query (not just the page) and the whole correlation', async () => {
    const service = TestBed.inject(CorrelativaService);
    const queried = await firstValueFrom(service.export('denominacion', { ...createEmptyQuery(), text: '0012' }));
    const queriedText = await queried.blob.text();
    expect(queried.fileName).toBe('correlativa-denominacion.csv');
    expect(queriedText).toContain('Secretario de despacho');
    expect(queriedText).not.toContain('Alcalde');

    const all = await firstValueFrom(service.exportAll());
    const allText = await all.blob.text();
    expect(allText).toContain('Alcalde');
    expect(allText).toContain('Jefes de comunidades étnicas');
    expect(allText).toContain('Procesamiento de alimentos');
  });
});
