/// <reference types="jasmine" />

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { comboChoices, comboPick } from '../../../shared/ui/filter-combobox.testing';
import { allCriteria } from '../reportes.model';
import { createTestReport } from '../reportes.testing';
import { ReporteEstadisticasComponent } from './reporte-estadisticas.component';

describe('ReporteEstadisticasComponent', () => {
  let fixture: ComponentFixture<ReporteEstadisticasComponent>;
  let comp: ReporteEstadisticasComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReporteEstadisticasComponent] }).compileComponents();
    fixture = TestBed.createComponent(ReporteEstadisticasComponent);
    comp = fixture.componentInstance;
    comp.records = createTestReport();
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('offers «Todos» first and starts there, adding up every component', () => {
    expect(comboChoices(fixture, 'rs-component')).toEqual([
      'Todos',
      'Descripción',
      'Funciones',
      'Denominaciones ocupacionales',
      'Ocupaciones relacionadas',
      'Habilidades',
      'Conocimientos'
    ]);
    expect(comp.component).toBe('all');
    expect(el.querySelector('.rs-legend h3')?.textContent?.trim()).toBe('Nivel en todos los componentes');

    // «Todos» cuenta los criterios de los seis componentes juntos.
    const families = ['description', 'functions', 'denominations', 'related', 'skills', 'knowledge'];
    const expected = comp.records.flatMap((record) => allCriteria(record)).filter((item) => families.includes(item.family));
    expect(comp.distribution('all').reduce((sum, item) => sum + item.count, 0)).toBe(expected.length);
    expect(Array.from(el.querySelectorAll('.rs-summary-card strong:first-child')).map((node) => node.textContent?.trim())[0]).toBe('Todos');

    comboPick(fixture, 'rs-component', 'functions');
    expect(comp.component).toBe('functions');
    expect(el.querySelector('.rs-legend h3')?.textContent?.trim()).toBe('Nivel en Funciones');
  });

  it('puts in the Excel the same percentages: one row per component and the total with «Todos», only one when chosen', () => {
    const rows = comp.statisticsRows();
    expect(rows[1]).toEqual(['Seleccionar componente', 'Todos']);
    const header = rows[6];
    expect(header).toEqual([
      'Componente',
      'Criterios',
      'Aplica',
      'Aplica (%)',
      'Con propuesta de mejora',
      'Con propuesta de mejora (%)',
      'No aplica',
      'No aplica (%)',
      'Cumplimiento base'
    ]);
    const table = rows.slice(7);
    expect(table.map((row) => row[0])).toEqual(['Descripción', 'Funciones', 'Denominaciones ocupacionales', 'Ocupaciones relacionadas', 'Habilidades', 'Conocimientos', 'Todos']);
    const total = table[table.length - 1];
    const all = comp.distribution('all');
    expect(total[1]).toBe(all.reduce((sum, item) => sum + item.count, 0));
    expect(total[3]).toBe(`${all.find((item) => item.state === 'aplica')?.percent} %`);
    expect(total[8]).toBe(`${comp.compliance('all')} %`);

    comp.component = 'knowledge';
    expect(comp.statisticsRows().slice(7).map((row) => row[0])).toEqual(['Conocimientos']);
  });
});
