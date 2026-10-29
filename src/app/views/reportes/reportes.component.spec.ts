/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReporteDetalleComponent } from './reporte-detalle/reporte-detalle.component';
import { ReporteEstadisticasComponent } from './reporte-estadisticas/reporte-estadisticas.component';
import { ReportesComponent } from './reportes.component';

describe('ReportesComponent', () => {
  let fixture: ComponentFixture<ReportesComponent>;
  let comp: ReportesComponent;
  let el: HTMLElement;

  function render(): void {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  beforeEach(fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [ReportesComponent] });
    fixture = TestBed.createComponent(ReportesComponent);
    comp = fixture.componentInstance;
    el = fixture.nativeElement;
    render();
  }));

  const component = <T>(type: new (...args: never[]) => T): T | undefined =>
    fixture.debugElement.query((node) => node.componentInstance instanceof type)?.componentInstance as T | undefined;

  it('shows the indicators and the full report with its 17 columns', fakeAsync(() => {
    // Los indicadores van con las tres calificaciones reales (ya no Aprobados / Con mejoras / Parciales / No aprobados).
    expect(Array.from(el.querySelectorAll('.rp-kpi-label')).map((node) => node.textContent?.trim())).toEqual(['Aplica', 'Con propuesta de mejora', 'No aplica']);
    expect(Array.from(el.querySelectorAll('.rp-kpi-count')).map((node) => node.textContent?.trim())).toEqual(['1', '0', '1']);
    // «Estado de evaluación» muestra solo el resultado final; los conteos por calificación van en las fichas.
    const firstRow = el.querySelectorAll('.rp-table tbody tr')[0];
    expect(firstRow.querySelector('.rp-result')?.textContent?.trim()).toBe('No aplica');
    expect(firstRow.querySelector('.rp-grade-count')).toBeNull();
    expect(el.querySelector('.rp-count-pill')?.textContent).toContain('2 registros');
    expect(el.querySelectorAll('.rp-table thead th').length).toBe(17);
    // El contador de la pestaña es el de registros (antes mostraba las 17 columnas y se confundía).
    expect(el.querySelector('.rp-view-tab')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Reporte completo2');
    expect(el.querySelector('.rp-view-tab .rp-badge-count')?.textContent).toBe('2');
    expect(el.querySelector('.rp-table tbody tr .rp-chip')?.textContent).toContain('2126');

    comp.view = 'cards';
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('.rp-grade-count')).slice(0, 3).map((node) => node.textContent?.trim())).toEqual([
      '3 Aplica',
      '1 Con propuesta de mejora',
      '2 No aplica'
    ]);
  }));

  it('filters by department and by coincidence, and searches by occupation', fakeAsync(() => {
    comp.openFilters();
    comp.draftFilters.department = 'Cundinamarca';
    comp.applyFilters();
    fixture.detectChanges();
    expect(comp.filtered.map((record) => record.group)).toEqual([10]);

    comp.openFilters();
    comp.clearFilters();
    comp.draftFilters.coincidence = 'propuesta_mejora';
    comp.applyFilters();
    expect(comp.filtered.map((record) => record.group)).toEqual([6]);

    comp.resetAll();
    comp.search = 'contadores';
    expect(comp.filtered.map((record) => record.group)).toEqual([10]);
  }));

  it('opens the detail by occupation from a row', fakeAsync(() => {
    (el.querySelector('.rp-table tbody tr') as HTMLElement).click();
    render();
    const detail = component(ReporteDetalleComponent);
    expect(detail?.record.group).toBe(6);
    expect(el.querySelector('.rd-eyebrow')?.textContent).toContain('Agrupación 6');
    expect(el.querySelector('#rd-title')?.textContent).toContain('2 ocupaciones validadas juntas');
    expect(Array.from(el.querySelectorAll('.rd-table thead th')).some((node) => node.textContent?.includes('5. Funciones 2'))).toBeTrue();
  }));

  it('expands a card with its blocks and filters the criteria by verdict', fakeAsync(() => {
    comp.view = 'cards';
    render();
    expect(el.querySelector('.rp-cards .rp-meta')?.textContent).toBeTruthy();
    comp.toggleCard(comp.filtered[0]);
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('.rp-sheet-block h3')).map((node) => node.textContent?.trim().split(' ')[0])).toEqual(['Registro', 'Informante', 'Ocupación', 'Calificación']);
    expect(comp.cardGroups(comp.filtered[0]).map((group) => group.titleKey)).toEqual([
      'reportes.cards.mainFields',
      'reportes.family.functions',
      'reportes.family.knowledge',
      'reportes.family.related'
    ]);
    comp.setVerdict(comp.filtered[0], 'no_aplica');
    expect(comp.cardGroups(comp.filtered[0]).flatMap((group) => group.items).length).toBe(2);
  }));

  it('takes a map cell to its criterion in the detail by occupation', fakeAsync(() => {
    comp.view = 'cards';
    render();
    const cells = Array.from(el.querySelectorAll('.rp-map-cell')) as HTMLButtonElement[];
    // El último cuadro del envío 6 es la ocupación relacionada de la 21321 (la segunda ocupación).
    const last = cells[5];
    expect(last.title).toContain('[21321] 9. Ocupaciones relacionadas 1');
    expect(last.title).toContain('Aplica');
    last.click();
    render();
    const detail = component(ReporteDetalleComponent)!;
    expect(detail.occupationIndex).toBe(1);
    expect(el.querySelector('.rd-table th.rd-focus')?.textContent).toContain('9. Ocupaciones relacionadas 1');
    expect(comp.isExpanded(comp.filtered[0])).toBeFalse();
    tick(10);
  }));

  it('opens the statistics with the approval rate and the base threshold', fakeAsync(() => {
    comp.statsOpen = true;
    render();
    const stats = component(ReporteEstadisticasComponent)!;
    expect(stats.total).toBe(2);
    // El envío 6 es «Parcial», pero su coincidencia es exactamente 60: la regla de la desplegada lo cuenta aprobado.
    expect(stats.approved).toBe(2);
    expect(stats.inThreshold).toBe(2);
    stats.component = 'functions';
    expect(stats.legend.find((item) => item.state === 'aplica')?.count).toBe(1);
    expect(stats.compliance('functions')).toBe(50);
  }));
});
