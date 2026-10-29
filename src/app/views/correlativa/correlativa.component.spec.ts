/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CORRELATIVA_COLUMNS, CORRELATIVA_HEADERS, CorrelativaComponent, CorrelativaKind, createEmptyQuery } from './correlativa.component';
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
  /** Textos de la columna `n` (desde 1) de la página. */
  const column = (n: number) => Array.from(compiled.querySelectorAll(`.ui-table tbody tr td:nth-child(${n})`)).map((cell) => cell.textContent?.trim());
  const text = (selector: string) => compiled.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => item.textContent?.includes(label)) as HTMLButtonElement;

  it('should open on Denominación with its columns, the first page and the record count', () => {
    // Encabezado en dos filas, como el original: CNO y CUOC (cada uno con su color) sobre los títulos de sus columnas.
    expect(headers()).toEqual([
      'CNO', 'CUOC', 'Estado', 'Observación',
      'Código ocupación', 'Código denominación', 'Denominación', 'Código ocupación', 'Código denominación', 'Denominación'
    ]);
    expect(compiled.querySelector('th.correlativa-group-cno')?.getAttribute('colspan')).toBe('3');
    expect(compiled.querySelector('th.correlativa-group-cuoc')?.getAttribute('colspan')).toBe('3');
    // En fichas (pantallas angostas) cada dato lleva su nombre completo.
    expect(Array.from(compiled.querySelectorAll('.ui-table tbody tr:first-child td')).map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Código ocupación CNO', 'Código denominación CNO', 'Denominación CNO',
      'Código ocupación CUOC', 'Código denominación CUOC', 'Denominación CUOC', 'Estado', 'Observación'
    ]);
    expect(column(2)).toEqual(['D-0011.001', 'D-0011.002', 'D-0011.003', 'D-0011.004', 'D-0011.005', 'D-0011.006', 'D-0011.007', 'D-0011.008']);
    expect(column(5)[0]).toBe('11110.001');
    expect(text('.correlativa-toolbar .ui-badge')).toBe('12 registros encontrados');
    expect(text('.ui-pagination > span')).toBe('Mostrando 1 a 8 de 12 registros');
    expect(button('Descargar consultadas').textContent).toContain('(12)');
  });

  it('should have headers that cover exactly the columns of each tab', () => {
    for (const kind of Object.keys(CORRELATIVA_COLUMNS) as CorrelativaKind[]) {
      const rows = CORRELATIVA_HEADERS[kind];
      const area = rows.flat().reduce((total, cell) => total + (cell.colspan ?? 1) * (cell.rowspan ?? 1), 0);
      expect(area).withContext(kind).toBe(CORRELATIVA_COLUMNS[kind].length * rows.length);
    }
  });

  it('should move between pages and change the page size', fakeAsync(() => {
    const pageButton = Array.from(compiled.querySelectorAll<HTMLButtonElement>('.ui-page-btn')).find((item) => item.textContent?.trim() === '2')!;
    pageButton.click();
    refresh();
    expect(column(2)).toEqual(['D-0012.001', 'D-0012.002', 'D-0012.003', 'D-0013.001']);
    expect(text('.ui-pagination > span')).toBe('Mostrando 9 a 12 de 12 registros');
    expect(compiled.querySelector('.ui-page-btn.active')?.textContent?.trim()).toBe('2');

    component.query.pageSize = 16;
    component.onFiltersChange();
    refresh();
    expect(column(2).length).toBe(12);
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
    expect(column(2)).toEqual(['D-0013.001']);

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
    expect(headers()).toEqual(['CNO', 'CUOC', 'Observación', 'Código ocupación', 'Ocupación', 'Código ocupación', 'Ocupación']);
    expect(text('.correlativa-toolbar .ui-badge')).toBe('10 registros encontrados');
    expect(button('Filtros')).toBeUndefined();

    tab('Conocimiento').click();
    refresh();
    expect(headers()).toEqual(['CNO', 'CUOC', 'Aplicado', 'Código conocimiento', 'Conocimiento', 'Código conocimiento', 'Conocimiento']);
    expect(compiled.querySelector('.ui-table tbody tr')?.textContent).toContain('Gerencia y administración');

    component.draft.applied = 'no';
    component.applyFilters();
    refresh();
    expect(column(1)).toEqual(['10']);
    expect(compiled.querySelector('.ui-table tbody tr')?.textContent).toContain('No aplicado');
  }));

  it('should show each occupation description under its name, opening both with «Ver más», and the observation', fakeAsync(() => {
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes('Ocupación'))!.click();
    refresh();
    const firstRow = () => compiled.querySelector('.ui-table tbody tr')!;
    const descriptions = () => Array.from(firstRow().querySelectorAll('.correlativa-desc'));
    expect(descriptions().map((item) => item.textContent?.trim().slice(0, 20))).toEqual(['Formulan, aprueban, ', 'Formulan y asesoran ']);
    expect(descriptions().some((item) => item.classList.contains('open'))).toBeFalse();
    // Sin descripción no hay «Ver más».
    expect(compiled.querySelectorAll('.ui-table tbody tr')[1].querySelector('.correlativa-desc-toggle')).toBeNull();

    (firstRow().querySelector('.correlativa-desc-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(descriptions().every((item) => item.classList.contains('open'))).toBeTrue();
    expect(firstRow().querySelector('.correlativa-desc-toggle')?.textContent?.trim()).toBe('Ver menos');

    component.query.text = 'mesa sectorial';
    component.onTextChange();
    refresh(SEARCH_DEBOUNCE_MS);
    expect(component.result.total).toBe(1);
    expect(firstRow().textContent).toContain('Revisar con la mesa sectorial');
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

    const occupations = await (await firstValueFrom(service.export('ocupacion', createEmptyQuery()))).blob.text();
    expect(occupations).toContain('"Código ocupación CNO";"Ocupación CNO";"Descripción CNO";"Código ocupación CUOC";"Ocupación CUOC";"Descripción CUOC";"Observación"');
    expect(occupations).toContain('Formulan y asesoran sobre las políticas');

    const all = await firstValueFrom(service.exportAll());
    const allText = await all.blob.text();
    expect(allText).toContain('Alcalde');
    expect(allText).toContain('Jefes de comunidades étnicas');
    expect(allText).toContain('Procesamiento de alimentos');
  });
});
