/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { SESSION } from '../../shared/session';
import { Comparison, createEmptyQuery } from '../comparativa/comparativa.model';
import { createTestComparisons } from '../comparativa/comparativa.testing';
import { ComparativaService } from '../comparativa/comparativa.service';
import { AnalisisComponent, AnalysisCatalog, AnalysisOccupation } from './analisis.component';
import { SEARCH_DEBOUNCE_MS } from '../../shared/ui/list';
import { AnalisisService, INVALID_LEVEL, INVALID_OCCUPATION_COUNT, LEVEL_NAME_TAKEN, MISSING_REQUIRED_FIELDS } from './analisis.service';

describe('AnalisisComponent', () => {
  let fixture: ComponentFixture<AnalisisComponent>;
  let component: AnalisisComponent;
  let compiled: HTMLElement;

  afterEach(() => clearTestSession());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AnalisisComponent] }).compileComponents();
    startTestSession();
    fixture = TestBed.createComponent(AnalisisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  });

  /** Agrega una ocupación como lo hace el botón "Agregar" del buscador y espera a que los campos se llenen. */
  function add(catalog: AnalysisCatalog, code: string): void {
    component.add({ catalog, code, name: '', area: '' });
    refresh();
  }

  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
  }

  const button = (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => item.textContent?.includes(label)) as HTMLButtonElement;
  const text = (selector: string) => compiled.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const field = (id: string) => compiled.querySelector(`#${id}`) as HTMLInputElement;
  /** Comparativas creadas en la prueba (sin las de ejemplo), de la más reciente a la más antigua. */
  const saved = () => {
    let list: Comparison[] = [];
    TestBed.inject(ComparativaService).list({ ...createEmptyQuery(), pageSize: 100 }).subscribe((page) => (list = page.items));
    return list.filter((item) => item.id > createTestComparisons().length);
  };

  it('should start empty: two columns waiting for an occupation and nothing to save', () => {
    expect(text('.analisis-count span')).toBe('0 / 3');
    expect(compiled.querySelectorAll('.analisis-column').length).toBe(2);
    expect(compiled.querySelectorAll('app-analisis-editor').length).toBe(0);
    expect(compiled.querySelector('.analisis-column')?.textContent).toContain('Sin ocupación seleccionada');
    expect(compiled.querySelector('.analisis-column')?.textContent).toContain('Agrega una ocupación al espacio 1 desde el buscador.');
    expect(text('.analisis-footer .ui-hint')).toBe('Agrega ocupaciones desde el buscador.');
    expect(button('Descargar Excel').disabled).toBeTrue();
    expect(button('Enviar a Instrumento 2').disabled).toBeTrue();
    expect(button('Guardar').disabled).toBeTrue();
  });

  it('should search the chosen catalogue as the user types and add the occupation to the first free slot', fakeAsync(() => {
    component.searchText = '211';
    component.onSearchChange();
    tick(SEARCH_DEBOUNCE_MS - 1);
    expect(component.searchResults).toBeNull();
    refresh(1);
    expect(Array.from(compiled.querySelectorAll('.analisis-result .ui-badge')).map((item) => item.textContent)).toEqual(['2111', '2112', '2113', '2114']);

    // El mismo texto en la CUOC trae sus propias ocupaciones.
    component.catalog = 'CUOC';
    component.onSearchChange();
    refresh(SEARCH_DEBOUNCE_MS);
    expect(Array.from(compiled.querySelectorAll('.analisis-result .ui-badge')).map((item) => item.textContent)).toEqual(['12110', '21110', '21130']);

    component.searchText = 'astrónomos';
    component.onSearchChange();
    refresh(SEARCH_DEBOUNCE_MS);

    (compiled.querySelector('.analisis-result button') as HTMLButtonElement).click();
    refresh();
    expect(component.searchText).toBe('');
    expect(compiled.querySelector('.analisis-results')).toBeNull();
    expect(text('.analisis-count span')).toBe('1 / 3');
    expect(text('.analisis-chip strong')).toBe('21110');
    expect(text('.analisis-name')).toBe('Físicos y astrónomos');
    expect(compiled.querySelector('.analisis-facts')?.textContent).toContain('21110');
    expect(field('analisis-1-name').value).toBe('Físicos y astrónomos');
    expect(field('analisis-1-level').textContent).toContain('Nivel 4');
    expect(text('.analisis-footer .ui-hint')).toBe('Agrega al menos una ocupación más para guardar el análisis.');
    expect(button('Guardar').disabled).toBeTrue();
  }));

  it('should add an occupation by clicking anywhere on its row or pressing Enter in the search box', fakeAsync(() => {
    component.searchText = '211';
    component.onSearchChange();
    refresh(SEARCH_DEBOUNCE_MS);

    // Debajo del nombre, la clasificación y el área a la que pertenece.
    expect(compiled.querySelector('.analisis-result-meta')?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/^CNO · \S/);

    // Clic sobre el nombre (no sobre "Agregar"): la fila completa es el botón.
    (compiled.querySelectorAll('.analisis-result-name')[1] as HTMLElement).click();
    refresh();
    expect(component.slots.map((slot) => slot.original.code)).toEqual(['2112']);

    // Enter agrega la primera que aún no está en el análisis; la ya agregada queda deshabilitada.
    component.searchText = '211';
    component.onSearchChange();
    refresh(SEARCH_DEBOUNCE_MS);
    expect((compiled.querySelectorAll('.analisis-result-row')[1] as HTMLButtonElement).disabled).toBeTrue();
    expect(compiled.querySelectorAll('.analisis-result-row')[1].textContent).toContain('Ya está en el análisis');
    (compiled.querySelector('input[name="searchText"]') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    refresh();
    expect(component.slots.map((slot) => slot.original.code)).toEqual(['2112', '2111']);
  }));

  it('should open a third column for the third occupation, refuse a fourth or a repeated one, and free the slot when removing', fakeAsync(() => {
    add('CNO', '2111');
    add('CNO', '2111');
    expect(component.slots.length).toBe(1);

    add('CUOC', '21110');
    expect(compiled.querySelectorAll('.analisis-column').length).toBe(2);
    expect(button('Agregar ocupación 3')).toBeTruthy();

    add('CNO', '2112');
    expect(compiled.querySelectorAll('.analisis-column').length).toBe(3);
    expect(compiled.querySelector('.analisis-add-slot')).toBeNull();
    add('CNO', '2113');
    expect(component.slots.map((slot) => slot.original.code)).toEqual(['2111', '21110', '2112']);

    (compiled.querySelector('.analisis-chip button') as HTMLButtonElement).click();
    refresh();
    expect(component.slots.map((slot) => slot.original.code)).toEqual(['21110', '2112']);
    expect(compiled.querySelectorAll('.analisis-column').length).toBe(2);
  }));

  it('should edit a copy: the card keeps showing the original occupation', fakeAsync(() => {
    add('CNO', '2111');
    const name = field('analisis-1-name');
    name.value = 'Físicos';
    name.dispatchEvent(new Event('input'));
    refresh();
    expect(component.slots[0].draft.name).toBe('Físicos');
    expect(component.slots[0].original.name).toBe('Físicos y astrónomos');
    expect(text('.analisis-name')).toBe('Físicos y astrónomos');

    // Funciones: se despliega para editar el texto, se agrega y se elimina.
    const tab = (label: string) => Array.from(compiled.querySelectorAll<HTMLButtonElement>('app-analisis-editor [role="tab"]')).find((item) => item.textContent?.includes(label))!;
    tab('Funciones').click();
    refresh();
    expect(Array.from(compiled.querySelectorAll('.editor-item .ui-badge')).map((item) => item.textContent)).toEqual(['F-2111.01', 'F-2111.02', 'F-2111.03', 'F-2111.04', 'F-2111.05', 'F-2111.06']);

    (compiled.querySelector('.editor-item .ui-icon-btn') as HTMLButtonElement).click();
    refresh();
    const textarea = compiled.querySelector('.editor-item textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Diseñar y dirigir investigaciones');
    textarea.value = 'Función corregida';
    textarea.dispatchEvent(new Event('input'));
    refresh();
    expect(component.slots[0].draft.functions[0].text).toBe('Función corregida');
    expect(component.slots[0].original.functions[0].text).toContain('Diseñar y dirigir');

    expect(text('.editor-list-head .ui-overline')).toBe('Funciones');
    (compiled.querySelector('.editor-list-head button') as HTMLButtonElement).click();
    refresh();
    expect(component.slots[0].draft.functions[6].code).toBe('F-2111.07');
    (compiled.querySelectorAll('.editor-item')[1].querySelectorAll('.ui-icon-btn')[1] as HTMLButtonElement).click();
    refresh();
    expect(component.slots[0].draft.functions.map((item) => item.code)).toEqual(['F-2111.01', 'F-2111.03', 'F-2111.04', 'F-2111.05', 'F-2111.06', 'F-2111.07']);
    expect(component.slots[0].original.functions.length).toBe(6);
  }));

  it('should open "Ver más detalles" as a dialog with all the information of the original occupation', fakeAsync(() => {
    add('CNO', '2111');
    component.slots[0].draft.name = 'Nombre editado';
    button('Ver más detalles').click();
    refresh();

    const dialog = compiled.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('.analisis-detail-header')?.textContent?.replace(/\s+/g, ' ')).toContain('1. Ocupación · CNO');
    expect(dialog.querySelector('#analisis-detail-title')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2111 Físicos y astrónomos');
    expect(dialog.querySelector('.analisis-facts')?.textContent).toContain('Nivel 1 (A)');
    const sections = Array.from(dialog.querySelectorAll('.analisis-detail-section')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(sections).toEqual(['Descripción', 'Funciones 6', 'Habilidades 5', 'Conocimientos 5', 'Denominaciones 6']);
    expect(dialog.querySelector('.analisis-detail-list li')?.textContent).toContain('F-2111.01');
    expect(dialog.textContent).toContain('D-2111.001');

    Array.from(dialog.querySelectorAll('button')).find((item) => item.textContent?.includes('Cerrar'))!.click();
    refresh();
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();
  }));

  it('should create a level for Análisis from the "+ Nuevo nivel para Análisis" dialog and choose it in the copy', fakeAsync(() => {
    add('CNO', '2111');
    button('Nuevo nivel para Análisis').click();
    refresh();
    const dialog = () => compiled.querySelector('[role="dialog"]') as HTMLElement;
    const type = (value: string) => {
      const input = field('analisis-1-new-level-name');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      refresh();
    };
    expect(dialog().textContent).toContain('Nuevo nivel de cualificación para Análisis');
    expect(dialog().textContent).toContain('El catálogo oficial CNO no cambia.');
    expect(field('analisis-1-new-level-code').disabled).toBeTrue();
    expect(field('analisis-1-new-level-code').value).toBe('Se asigna al guardar');

    // Sin nombre no se guarda.
    button('Guardar nivel').click();
    refresh(MOCK_LATENCY_MS);
    expect(dialog().querySelector('.editor-error')?.textContent).toContain('Este campo es obligatorio.');

    // Tampoco con el nombre de un nivel que ya existe.
    type('profesionales, dirección y gerencia');
    button('Guardar nivel').click();
    refresh(MOCK_LATENCY_MS);
    expect(dialog().querySelector('.editor-error')?.textContent).toContain('Ya existe un nivel con ese nombre.');

    type('Nivel especial');
    button('Guardar nivel').click();
    refresh(MOCK_LATENCY_MS);
    refresh();
    expect(dialog()).toBeNull();
    expect(component.slots[0].draft.level).toBe('Nivel especial');
    expect(component.slots[0].original.level).toBe('Profesionales, Dirección y Gerencia');
    expect(field('analisis-1-level').textContent).toContain('Nivel especial');
    // Queda disponible para las demás ocupaciones del mismo catálogo, no para el otro.
    expect(component.options.CNO.levels).toContain('Nivel especial');
    expect(component.options.CUOC.levels).not.toContain('Nivel especial');
  }));

  it('should add, edit and remove related occupations from the Relac. tab like in the other tabs', fakeAsync(() => {
    add('CNO', '2111');
    const tab = Array.from(compiled.querySelectorAll<HTMLButtonElement>('app-analisis-editor [role="tab"]')).find((item) => item.textContent?.includes('Relac.'))!;
    tab.click();
    refresh();
    expect(text('.editor-list-head .ui-overline')).toBe('Ocupaciones relacionadas');
    expect(Array.from(compiled.querySelectorAll('.editor-item')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['2112Químicos', '2114Meteorólogos']);

    // "+ Agregar" crea una fila nueva lista para escribir la información.
    (compiled.querySelector('.editor-list-head button') as HTMLButtonElement).click();
    refresh();
    const textarea = compiled.querySelector('.editor-item textarea') as HTMLTextAreaElement;
    textarea.value = 'Astrónomos de observatorio';
    textarea.dispatchEvent(new Event('input'));
    refresh();
    expect(component.slots[0].draft.related).toEqual([
      { code: '2112', text: 'Químicos' },
      { code: '2114', text: 'Meteorólogos' },
      { code: 'R-2111.01', text: 'Astrónomos de observatorio' }
    ]);
    expect(component.slots[0].original.related.length).toBe(2);

    (compiled.querySelector('.editor-list-head button') as HTMLButtonElement).click();
    refresh();
    expect(component.slots[0].draft.related[3].code).toBe('R-2111.02');

    (compiled.querySelectorAll('.editor-item')[0].querySelectorAll('.ui-icon-btn')[1] as HTMLButtonElement).click();
    refresh();
    expect(component.slots[0].draft.related.map((item) => item.code)).toEqual(['2114', 'R-2111.01', 'R-2111.02']);
  }));

  it('should edit the traceability under "Información adicional" and open it enlarged with "Ampliar"', fakeAsync(() => {
    add('CNO', '2111');
    const traceability = field('analisis-1-traceability') as unknown as HTMLTextAreaElement;
    traceability.value = 'Revisada por el equipo';
    traceability.dispatchEvent(new Event('input'));
    refresh();
    expect(component.slots[0].draft.traceability).toBe('Revisada por el equipo');
    expect(component.slots[0].original.traceability).toBe('');

    (compiled.querySelector('.editor-details .ui-btn') as HTMLButtonElement).click();
    refresh();
    const dialog = compiled.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toContain('Trazabilidad · 2111');
    expect((dialog.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Revisada por el equipo');
  }));

  it('should not save while a required field is empty, and then save the copies and clear the analysis', fakeAsync(() => {
    add('CNO', '2111');
    add('CUOC', '22210');
    expect(text('.analisis-footer .ui-hint')).toBe('Se guardarán o enviarán las 2 ocupaciones del análisis.');

    component.slots[0].draft.name = ' ';
    button('Guardar').click();
    refresh(MOCK_LATENCY_MS);
    expect(saved().length).toBe(0);
    expect(compiled.querySelector('.editor-error')?.textContent).toContain('Este campo es obligatorio.');
    expect(field('analisis-1-name').getAttribute('aria-invalid')).toBe('true');

    component.slots[0].draft.name = 'Físicos (revisado)';
    button('Guardar').click();
    refresh(MOCK_LATENCY_MS);
    expect(component.slots.length).toBe(0);
    expect(text('.analisis-count span')).toBe('0 / 3');
    expect(saved().length).toBe(1);
    expect(saved()[0].status).toBe('Recibido');
    expect(saved()[0].analyst).toBe('admin@sena.edu.co');
    expect(saved()[0].occupations.map((item) => item.name)).toEqual(['Físicos (revisado)', 'Profesionales de enfermería']);
  }));

  it('should leave the analysis ready for Instrumento 2 when sending it', fakeAsync(() => {
    add('CNO', '2111');
    add('CNO', '2112');
    component.slots[1].draft.description = 'Descripción de prueba';
    button('Enviar a Instrumento 2').click();
    refresh(MOCK_LATENCY_MS);
    expect(component.slots.length).toBe(0);
    expect(saved()[0].status).toBe('En Instrumento 2');
  }));

  it('should open the usage guide and close it with "Entendido"', () => {
    button('Guía de uso').click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')?.textContent).toContain('Guía de uso · Análisis');
    button('Entendido').click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();
  });
});

/*
 * Contrato del servicio (hoy una API simulada). Cuando se conecte el backend,
 * estas pruebas describen lo que el servicio debe seguir cumpliendo.
 */
describe('AnalisisService', () => {
  function setup(role = 'Administrador'): AnalisisService {
    TestBed.configureTestingModule({ providers: [{ provide: SESSION, useValue: { role, email: 'usuario@sena.edu.co' } }] });
    return TestBed.inject(AnalisisService);
  }

  async function occupations(service: AnalisisService, codes: string[]): Promise<AnalysisOccupation[]> {
    return Promise.all(codes.map((code) => firstValueFrom(service.occupation('CNO', code))));
  }

  const errorOf = (request: Promise<unknown>) => request.then(() => '', (error: Error) => error.message);


  it('should deliver the occupation with its level and area names and numbered components', async () => {
    const [occupation] = await occupations(setup(), ['2111']);
    expect(occupation.level).toBe('Profesionales, Dirección y Gerencia');
    expect(occupation.area).toBe('Ciencias Naturales, Aplicadas y Relacionadas');
    expect(occupation.functions[0].code).toBe('F-2111.01');
    expect(occupation.skills[0]).toEqual(jasmine.objectContaining({ code: '1', text: 'Pensamiento crítico' }));
    expect(occupation.denominations[1].code).toBe('D-2111.002');
  });

  it('should only accept 2 or 3 occupations with their required fields', async () => {
    const service = setup();
    const three = await occupations(service, ['2111', '2112', '2113']);
    three[1].description = 'Con descripción';
    three[2].description = 'Con descripción';
    expect(await errorOf(firstValueFrom(service.save(three.slice(0, 1))))).toBe(INVALID_OCCUPATION_COUNT);
    expect(await errorOf(firstValueFrom(service.save([...three, three[0]])))).toBe(INVALID_OCCUPATION_COUNT);
    expect(await errorOf(firstValueFrom(service.save([three[0], { ...three[1], area: '' }])))).toBe(MISSING_REQUIRED_FIELDS);

    const analysis = await firstValueFrom(service.save(three));
    expect(analysis.occupations.length).toBe(3);
    expect((await firstValueFrom(TestBed.inject(ComparativaService).get(analysis.id))).occupations.map((item) => item.code)).toEqual(['2111', '2112', '2113']);
  });

  it('should number the levels created for Análisis (C1, C2…) and require a name different from the existing ones', async () => {
    const service = setup();
    const first = await firstValueFrom(service.createLevel('CNO', { name: ' Nivel especial ', description: 'Para pruebas' }));
    expect(first).toEqual({ code: 'C1', catalog: 'CNO', name: 'Nivel especial', description: 'Para pruebas' });
    expect((await firstValueFrom(service.createLevel('CUOC', { name: 'Nivel especial', description: '' }))).code).toBe('C2');

    expect(await errorOf(firstValueFrom(service.createLevel('CNO', { name: 'NIVEL ESPECIAL', description: '' })))).toBe(LEVEL_NAME_TAKEN);
    expect(await errorOf(firstValueFrom(service.createLevel('CNO', { name: 'Profesionales, Dirección y Gerencia', description: '' })))).toBe(LEVEL_NAME_TAKEN);
    expect(await errorOf(firstValueFrom(service.createLevel('CNO', { name: '  ', description: '' })))).toBe(INVALID_LEVEL);
    expect(await errorOf(firstValueFrom(service.createLevel('CNO', { name: 'Otro', description: 'x'.repeat(1001) })))).toBe(INVALID_LEVEL);

    const levels = (await firstValueFrom(service.options('CNO'))).levels;
    expect(levels.slice(-1)).toEqual(['Nivel especial']);
    expect(levels).toContain('Profesionales, Dirección y Gerencia');
  });

  it('should export the occupations as they are on screen', async () => {
    const service = setup();
    const [occupation] = await occupations(service, ['2111']);
    occupation.name = 'Nombre corregido';
    const { blob, fileName } = await firstValueFrom(service.export([occupation]));
    expect(fileName).toBe('analisis-ocupaciones.csv');
    expect(await blob.text()).toContain('Nombre corregido');
  });
});
