/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { SESSION } from '../../shared/session';
import { ComparativaComponent, aspectMatches, createEmptyQuery } from './comparativa.component';
import { comboText } from '../../shared/ui/filter-combobox.testing';
import { SEARCH_DEBOUNCE_MS } from '../../shared/ui/list';
import { COMPARISON_LOCKED, COMPARISON_NOT_FOUND, ComparativaService } from './comparativa.service';
import { FakeComparativaService } from './comparativa.testing';

describe('ComparativaComponent', () => {
  let fixture: ComponentFixture<ComparativaComponent>;
  let component: ComparativaComponent;
  let compiled: HTMLElement;

  afterEach(() => clearTestSession());

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ComparativaComponent] });
    // Fuera de fakeAsync: allí el temporizador de vencimiento de la sesión se agotaría al terminar el bloque.
    startTestSession();
    fixture = TestBed.createComponent(ComparativaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  });

  /** Deja pasar la consulta o escritura pendiente y repinta. */
  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
  }

  const text = (selector: string, root: ParentNode = compiled) => root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from(compiled.querySelectorAll('button')).find((item) => item.textContent?.includes(label)) as HTMLButtonElement;
  const ids = () => Array.from(compiled.querySelectorAll('.comparativa-id')).map((cell) => cell.textContent?.trim());
  const counts = () => Array.from(compiled.querySelectorAll('.comparativa-stat strong')).map((count) => count.textContent);

  it('should list the comparisons, newest first, with the summary by status', () => {
    expect(counts()).toEqual(['0', '1', '0', '0', '3']);
    expect(text('.comparativa-stat span')).toBe('Recibido');
    expect(text('.comparativa-stat small')).toBe('Llegó de Análisis, sin tocar aquí');
    expect(ids()).toEqual(['4', '3', '2', '1']);
    const first = compiled.querySelector('.comparativa-table tbody tr') as HTMLElement;
    expect(Array.from(first.querySelectorAll('.comparativa-occupations li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim()).slice(0, 2)).toEqual([
      'CNO 7334Trabajadores del campo',
      'CUOC 61121Agricultores de plantaciones de árboles y arbustos / Agricultoras de plantaciones de árboles y arbustos'
    ]);
    expect(first.textContent).toContain('admin@sena.edu.co');
    expect(first.textContent).toContain('06/10/2026');
    expect(text('.ui-pagination > span')).toBe('Mostrando 1 a 4 de 4 comparativas');
    expect(button('Limpiar filtros').disabled).toBeTrue();
  });

  it('should search by ID, occupation or analyst and clear the search; the status indicators are not selectable', fakeAsync(() => {
    expect(compiled.querySelector('.comparativa-stat')?.tagName).toBe('LI');
    expect(compiled.querySelector('.comparativa-summary button')).toBeNull();
    (compiled.querySelectorAll('.comparativa-stat')[1] as HTMLElement).click();
    refresh();
    expect(ids().length).toBe(4);

    const search = (value: string) => {
      component.query.text = value;
      component.onTextChange();
      refresh(SEARCH_DEBOUNCE_MS);
    };
    search('analista@');
    expect(ids()).toEqual(['2', '1']);
    search('agrónomos');
    expect(ids()).toEqual(['3']);
    search('4');
    expect(ids()).toEqual(['4']);
    search('zzz');
    expect(compiled.querySelector('.ui-empty')?.textContent).toContain('Sin comparativas');

    button('Limpiar filtros').click();
    refresh();
    expect(ids().length).toBe(4);
    expect(button('Limpiar filtros').disabled).toBeTrue();
  }));

  it('should open a sent comparison side by side, read-only, with what matches and the tabs', fakeAsync(() => {
    button('Abrir comparativa').click();
    refresh();

    expect(text('.cpv-head h1')).toBe('Comparativa #4');
    expect(text('.cpv-head-meta')).toBe('3 ocupaciones Guardada en Análisis el 06/10/2026 por admin@sena.edu.co');
    expect(text('.cpv-status')).toBe('Enviado');
    expect(compiled.querySelectorAll('.cpv-card').length).toBe(3);
    expect(Array.from(compiled.querySelectorAll('.cpv-number')).map((item) => item.textContent)).toEqual(['01', '02', '03']);
    expect(text('.cpv-code')).toBe('CNO7334');
    expect(text('.cpv-level')).toBe('Nivel 3 (C) - Auxiliares y operativos');
    // La columna "Comparación" va después de la primera tarjeta.
    expect(compiled.querySelector('.cpv-card + .cpv-compare')).toBeTruthy();

    // Solo el área coincide entre las dos de CUOC, no entre las tres.
    expect(text('.cpv-compare-count')).toBe('0 de 8 coinciden');
    expect(Array.from(compiled.querySelectorAll('.cpv-aspect')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim())[0]).toBe('Catálogo (difiere)');

    // Enviada: sin "Editar", sin campos y sin acciones de guardar o enviar.
    expect(button('Editar')).toBeUndefined();
    expect(compiled.querySelector('textarea, select')).toBeNull();
    expect(text('.cpv-box.empty')).toBe('Sin observación');
    expect(text('.cpv-footer-note')).toBe('Enviada a validación experta. Ya no admite cambios.');
    expect(button('Guardar cambios')).toBeUndefined();
    expect(button('Enviar a Instrumento 2')).toBeUndefined();

    const tab = Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes('Funciones'))!;
    expect(tab.textContent?.replace(/\s+/g, ' ').trim()).toBe('Funciones 6');
    // La columna resalta los aspectos de la pestaña abierta: en Información, catálogo, nivel y área.
    const current = () => Array.from(compiled.querySelectorAll('.cpv-aspect.current')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim().split(' (')[0]);
    expect(current()).toEqual(['Catálogo', 'Nivel de cualificación', 'Área de desempeño']);
    tab.click();
    refresh();
    expect(current()).toEqual(['Funciones']);
    expect(text('.cpv-item')).toBe('F-7334.01Sembrar, cultivar y cosechar productos agrícolas.');

    // Los aspectos también abren su pestaña.
    const aspect = (label: string) => Array.from(compiled.querySelectorAll<HTMLButtonElement>('.cpv-aspect')).find((item) => item.textContent?.includes(label))!;
    const activeTab = () => compiled.querySelector('[role="tab"].active')?.textContent?.replace(/\s+/g, ' ').trim();
    aspect('Denominaciones').click();
    refresh();
    expect(activeTab()).toBe('Denominaciones 0');
    expect(current()).toEqual(['Denominaciones']);
    aspect('Área de desempeño').click();
    refresh();
    expect(activeTab()).toBe('Información 3');
    expect(compiled.querySelector('.cpv-fields')).toBeTruthy();

    button('Volver').click();
    refresh();
    expect(compiled.querySelector('.comparativa-table')).toBeTruthy();
  }));

  it('should edit the occupations and the single observation, save them and then send to Instrumento 2', fakeAsync(() => {
    component.open(3);
    refresh();
    expect(text('.cpv-footer-note')).toBe('Todos los cambios están guardados');
    // En vista no hay campos: se entra al modo edición con "Editar" (el general o el de una tarjeta).
    expect(compiled.querySelector('textarea')).toBeNull();
    expect(button('Guardar cambios').disabled).toBeTrue();

    (compiled.querySelectorAll<HTMLButtonElement>('.cpv-card .cpv-edit'))[1].click();
    refresh();
    expect(text('.cpv-editing-pill')).toBe('Modo edición');
    expect(compiled.querySelector('.cpv-card.focused .cpv-number')?.textContent).toBe('02');
    expect(button('Cancelar')).toBeTruthy();

    const type = (selector: string, value: string) => {
      const field = compiled.querySelector(selector) as HTMLTextAreaElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      refresh();
    };
    type('#cpv-name-1', 'Ingenieros agrónomos');
    // Una sola observación por comparativa: la misma en cada tarjeta.
    type('#cpv-observation-0', 'Revisar el nivel');
    expect((compiled.querySelector('#cpv-observation-1') as HTMLTextAreaElement).value).toBe('Revisar el nivel');
    expect(text('.cpv-footer-note')).toBe('Tienes cambios sin guardar');

    // Con cambios sin guardar no se puede enviar todavía.
    button('Enviar a Instrumento 2').click();
    refresh();
    expect(compiled.querySelector('app-confirm-dialog')).toBeNull();

    button('Guardar cambios').click();
    refresh(MOCK_LATENCY_MS);
    expect(component.selected?.observation).toBe('Revisar el nivel');
    expect(component.selected?.occupations[1].name).toBe('Ingenieros agrónomos');
    expect(component.selected?.status).toBe('Editado');
    expect(component.editing).toBeFalse();
    expect(text('.cpv-footer-note')).toBe('Todos los cambios están guardados');

    // Enviar pide confirmación; al confirmar queda "En Instrumento 2" y vuelve a la lista.
    button('Enviar a Instrumento 2').click();
    refresh();
    const confirm = Array.from(compiled.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find((item) => item.textContent?.includes('Enviar a Instrumento 2'))!;
    confirm.click();
    refresh(MOCK_LATENCY_MS);
    expect(component.selected).toBeNull();
    expect(counts()).toEqual(['0', '0', '1', '0', '3']);
  }));

  it('should edit the lists of each occupation: change, remove and add from the catalog or as a new row', fakeAsync(() => {
    component.open(3);
    refresh();
    button('Editar').click();
    refresh();
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes('Funciones'))!.click();
    refresh();
    const firstCard = () => compiled.querySelectorAll('.cpv-card')[0] as HTMLElement;
    const before = component.drafts[0].functions.length;
    expect(firstCard().querySelectorAll('.cpv-item textarea').length).toBe(before);

    // "+ Agregar" abre el buscador del catálogo; lo elegido entra al principio.
    (firstCard().querySelector('.cpv-add') as HTMLButtonElement).click();
    refresh(MOCK_LATENCY_MS);
    expect(firstCard().querySelector('app-option-picker')).toBeTruthy();
    component.addPicked(0, { code: 'F-9999.01', label: 'Función del catálogo' });
    component.addPicked(0, { code: 'F-9999.02', label: 'Otra función' });
    refresh();
    expect(component.drafts[0].functions.slice(0, 2).map((item) => item.code)).toEqual(['F-9999.02', 'F-9999.01']);
    expect(firstCard().querySelector('app-option-picker')).toBeNull();

    // La X quita un elemento.
    (firstCard().querySelector('.cpv-remove') as HTMLButtonElement).click();
    refresh();
    expect(component.drafts[0].functions.length).toBe(before + 1);
    expect(component.drafts[0].functions[0].code).toBe('F-9999.01');

    // Denominaciones: sin catálogo, "+ Agregar" suma una fila en blanco marcada "Nueva".
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes('Denominaciones'))!.click();
    refresh();
    (firstCard().querySelector('.cpv-add') as HTMLButtonElement).click();
    refresh();
    expect(firstCard().querySelector('.cpv-item-code.new')?.textContent?.trim()).toBe('Nueva');
    const field = firstCard().querySelector('.cpv-item textarea') as HTMLTextAreaElement;
    field.value = 'Agrónomo';
    field.dispatchEvent(new Event('input'));
    refresh();
    expect(text('.cpv-footer-note')).toBe('Tienes cambios sin guardar');

    button('Guardar cambios').click();
    refresh(MOCK_LATENCY_MS);
    const saved = component.selected!.occupations[0];
    expect(saved.functions.length).toBe(before + 1);
    expect(saved.functions[0].code).toBe('F-9999.01');
    expect(saved.denominations.map((item) => item.text)).toContain('Agrónomo');
  }));

  it('should call the CUOC skills "Destrezas", as the rest of the app does', fakeAsync(() => {
    component.open(3);
    refresh();
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes('Habilidades'))!.click();
    refresh();
    const titles = Array.from(compiled.querySelectorAll('.cpv-card .cpv-list-head .cpv-section-title')).map((title) => title.textContent?.replace(/\s+/g, ' ').trim());
    expect(titles).toEqual(['Habilidades 0', 'Destrezas 0']);
  }));

  it('should not let the text of skills and knowledge be rewritten (the server would add them to the catalog), only removed or added', fakeAsync(() => {
    component.open(3);
    refresh();
    button('Editar').click();
    refresh();
    component.drafts[0].skills = [{ code: '42', text: 'Liderazgo' }];
    component.drafts[0].knowledge = [{ code: '79', text: 'Administración' }];
    const firstCard = () => compiled.querySelectorAll('.cpv-card')[0] as HTMLElement;
    for (const tab of ['Habilidades', 'Conocimientos']) {
      Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes(tab))!.click();
      refresh();
      const items = firstCard().querySelectorAll('.cpv-item').length;
      expect(items).withContext(tab).toBeGreaterThan(0);
      expect(firstCard().querySelectorAll('.cpv-item textarea').length).withContext(tab).toBe(0);
      expect(firstCard().querySelectorAll('.cpv-remove').length).withContext(tab).toBe(items);
      expect(firstCard().querySelector('.cpv-add')).withContext(tab).toBeTruthy();
      expect(firstCard().querySelector('.cpv-catalog-hint')?.textContent).withContext(tab).toContain('no cambiar su texto');
    }

    // Las relacionadas sí se reescriben.
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((item) => item.textContent?.includes('Relacionadas'))!.click();
    refresh();
    expect(firstCard().querySelector('.cpv-catalog-hint')).toBeNull();
    expect(firstCard().querySelectorAll('.cpv-item textarea').length).toBe(component.drafts[0].related.length);
  }));

  it('should show the level and the area of each classification as Análisis does: CNO with the level code, CUOC with its own titles', fakeAsync(() => {
    component.open(3);
    refresh();
    const card = (index: number) => compiled.querySelectorAll('.cpv-card')[index] as HTMLElement;
    const labels = (index: number) => Array.from(card(index).querySelectorAll('.cpv-label')).map((label) => label.textContent?.trim());
    const box = (index: number, field: string) => card(index).querySelector(`#cpv-${field}-${index}`)?.textContent?.trim();

    expect(labels(0)).toEqual(['Nombre de la ocupación', 'Nivel de cualificación', 'Área de desempeño']);
    expect(box(0, 'level')).toBe('Nivel 1 (A) - Profesionales, Dirección y Gerencia');
    expect(card(0).querySelector('.cpv-level')?.textContent?.trim()).toBe('Nivel 1 (A) - Profesionales, Dirección y Gerencia');
    expect(labels(1)).toEqual(['Nombre de la ocupación', 'Nivel de competencia', 'Área de cualificación']);
    expect(box(1, 'level')).toBe('Nivel 4');
    expect(box(1, 'area')).toBe('Agropecuario, silvicultura, pesca, acuicultura y veterinaria');

    // Al editar, el desplegable muestra el código del nivel CNO, pero guarda su nombre (así lo busca el servidor).
    button('Editar').click();
    refresh(MOCK_LATENCY_MS);
    expect(comboText(fixture, 'cpv-level-0')).toBe('Nivel 1 (A) - Profesionales, Dirección y Gerencia');
    expect(component.drafts[0].level).toBe('Profesionales, Dirección y Gerencia');
  }));

  it('should show name, level and area one below the other, in view and edit mode, so the long names fit', fakeAsync(() => {
    document.body.appendChild(compiled);
    component.open(3);
    refresh();
    const columns = () => Array.from(compiled.querySelectorAll('.cpv-fields')).map((fields) => getComputedStyle(fields).gridTemplateColumns.split(' ').length);
    expect(columns()).toEqual([1, 1]);
    button('Editar').click();
    refresh();
    expect(columns()).toEqual([1, 1]);
    compiled.remove();
  }));

  it('should not give the cards a scroll of their own: they grow with their content and the page scrolls', fakeAsync(() => {
    document.body.appendChild(compiled);
    component.open(3);
    refresh();
    const bodies = Array.from(compiled.querySelectorAll<HTMLElement>('.cpv-card-body'));
    expect(bodies.length).toBe(2);
    expect(bodies.every((body) => getComputedStyle(body).overflowY === 'visible' && getComputedStyle(body).maxHeight === 'none')).toBeTrue();
    compiled.remove();
  }));

  it('should ask before discarding unsaved changes and go back to what was saved', fakeAsync(() => {
    component.open(3);
    refresh();
    button('Editar').click();
    refresh();
    const name = compiled.querySelector('#cpv-name-0') as HTMLTextAreaElement;
    name.value = 'Otro nombre';
    name.dispatchEvent(new Event('input'));
    refresh();

    button('Cancelar').click();
    refresh();
    expect(text('app-confirm-dialog h2')).toBe('¿Descartar los cambios?');
    Array.from(compiled.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find((item) => item.textContent?.includes('Descartar'))!.click();
    refresh();
    expect(component.editing).toBeFalse();
    expect(text('#cpv-name-0')).toBe('Expertos agrícolas y pecuarios');
  }));


  it('should open the usage guide and close it with "Entendido"', () => {
    button('Guía de uso').click();
    fixture.detectChanges();
    const guide = compiled.querySelector('[role="dialog"]') as HTMLElement;
    expect(guide.textContent).toContain('Guía de uso · Comparativa');
    // Pasos numerados en tarjetas (dos columnas) y la nota al final.
    expect(Array.from(guide.querySelectorAll('.guide-step h3')).map((item) => item.textContent)).toEqual(['Análisis', 'Comparativa', 'Instrumento 2', 'Con el experto']);
    expect(Array.from(guide.querySelectorAll('.guide-number')).map((item) => item.textContent)).toEqual(['1', '2', '3', '4']);
    expect(guide.querySelector('.guide-note b')?.textContent).toBe('Nota');
    button('Entendido').click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();
  });
});

/*
 * Contrato del servicio (hoy una API simulada). Cuando se conecte el backend,
 * estas pruebas describen lo que el servicio debe seguir cumpliendo.
 */
describe('FakeComparativaService (las reglas que comparte con el servidor)', () => {
  function setup(role = 'Administrador'): FakeComparativaService {
    TestBed.configureTestingModule({ providers: [{ provide: SESSION, useValue: { role, email: 'usuario@sena.edu.co' } }] });
    return TestBed.inject(ComparativaService) as unknown as FakeComparativaService;
  }

  const errorOf = (request: Promise<unknown>) => request.then(() => '', (error: Error) => error.message);


  it('should page the list and report the total', async () => {
    const service = setup();
    const page = await firstValueFrom(service.list({ ...createEmptyQuery(), page: 2, pageSize: 3 }));
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.id)).toEqual([1]);
  });

  it('should create a comparison when Análisis saves, as Recibido or already En Instrumento 2', async () => {
    const service = setup();
    const { occupations } = await firstValueFrom(service.get(3));
    const received = service.receive(occupations, false);
    expect(received.id).toBe(5);
    expect(received.status).toBe('Recibido');
    expect(received.analyst).toBe('usuario@sena.edu.co');
    expect(service.receive(occupations, true).status).toBe('En Instrumento 2');
    expect((await firstValueFrom(service.summary()))['Recibido']).toBe(1);
  });

  it('should refuse changes to a comparison that the expert already has, or that does not exist', async () => {
    const service = setup();
    expect(await errorOf(firstValueFrom(service.saveChanges(4, [], 'x')))).toBe(COMPARISON_LOCKED);
    expect(await errorOf(firstValueFrom(service.sendToInstrument2(4)))).toBe(COMPARISON_LOCKED);
    expect(await errorOf(firstValueFrom(service.get(99)))).toBe(COMPARISON_NOT_FOUND);

    // En Instrumento 2 todavía admite cambios: guardar la devuelve a Editado.
    await firstValueFrom(service.sendToInstrument2(3));
    expect((await firstValueFrom(service.saveChanges(3, [], ' x '))).status).toBe('Editado');
    expect((await firstValueFrom(service.get(3))).observation).toBe('x');
  });

  it('should tell in which aspects the occupations match', async () => {
    const { occupations } = await firstValueFrom(setup().get(4));
    const cuoc = occupations.slice(1);
    expect(aspectMatches(cuoc, 'catalog')).toBeTrue();
    expect(aspectMatches(cuoc, 'level')).toBeTrue();
    expect(aspectMatches(cuoc, 'area')).toBeTrue();
    expect(aspectMatches(cuoc, 'functions')).toBeFalse();
    // Listas vacías en todas no cuentan como coincidencia.
    expect(aspectMatches(cuoc, 'skills')).toBeFalse();
    expect(aspectMatches(occupations, 'area')).toBeFalse();
  });
});
