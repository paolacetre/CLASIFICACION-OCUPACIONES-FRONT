/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { ToastService } from '../../shared/toast/toast.service';
import { Instrumento3Component, createEmptyDraft, missingFields, todayAsInputDate } from './instrumento-3.component';
import { Instrumento3Service } from './instrumento-3.service';
import { FakeInstrumento3Service } from './instrumento-3.testing';

describe('Instrumento3Component', () => {
  let fixture: ComponentFixture<Instrumento3Component>;
  let component: Instrumento3Component;
  let compiled: HTMLElement;
  let toastService: ToastService;
  let service: FakeInstrumento3Service;

  afterEach(() => {
    clearTestSession();
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Instrumento3Component] });
    // Fuera de fakeAsync: allí el temporizador de vencimiento de la sesión se agotaría al terminar el bloque.
    startTestSession();
    fixture = TestBed.createComponent(Instrumento3Component);
    component = fixture.componentInstance;
    toastService = TestBed.inject(ToastService);
    service = TestBed.inject(Instrumento3Service) as unknown as FakeInstrumento3Service;
    fixture.detectChanges();
    // Deja llegar el catálogo de departamentos (se carga aparte).
    await import('./geografia');
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    compiled = fixture.nativeElement as HTMLElement;
  });

  /** Deja pasar la escritura pendiente y repinta. */
  function refresh(wait = 0): void {
    fixture.detectChanges();
    tick(wait);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim();
  const text = (selector: string, root: ParentNode = compiled) => clean(root.querySelector(selector)?.textContent);
  const texts = (selector: string, root: ParentNode = compiled) => Array.from(root.querySelectorAll(selector)).map((item) => clean(item.textContent));
  const button = (label: string, root: ParentNode = compiled) => Array.from(root.querySelectorAll('button')).find((item) => item.textContent?.includes(label)) as HTMLButtonElement;

  /** Llena lo obligatorio para enviar. */
  function fillRequired(): void {
    component.draft.fullName = 'Ana Ríos';
    component.draft.email = 'ana@sena.edu.co';
    component.draft.occupationName = 'Operadores de telemedicina';
    component.draft.area = '3';
    component.draft.level = 'nivel2';
    component.draft.description = 'Coordinan la atención remota de pacientes.';
  }

  it('should show the form of the original format, with only the date of today filled in "Datos generales"', async () => {
    expect(text('h1')).toBe('Instrumento 3: Propuesta de nuevos perfiles ocupacionales');
    expect(text('.i3-strip')).toBe('Favor diligenciar las celdas sombreadas en gris');
    expect(text('.i3-general-head h2')).toBe('Datos generales');
    expect(text('.i3-general-head .ui-badge')).toBe('Editable');

    // Solo la fecha viene puesta (la de hoy): nombre, correo y lo demás empiezan vacíos.
    await fixture.whenStable();
    const general = Array.from(compiled.querySelectorAll('.i3-grid input, .i3-grid select')) as (HTMLInputElement | HTMLSelectElement)[];
    expect(general.length).toBe(10);
    expect(general.map((field) => field.value)).toEqual([todayAsInputDate(), '', '', '', '', '', '', '', '', '']);
    expect((compiled.querySelector('#i3-name') as HTMLInputElement).placeholder).toBe('Ingrese nombre completo');
    expect((compiled.querySelector('#i3-email') as HTMLInputElement).placeholder).toBe('correo@ejemplo.com');

    // Las nueve secciones del formato, con sus casillas iniciales.
    expect(texts('.i3-srow-label').map((title) => title?.replace(/\s*\*$/, ''))).toEqual([
      '1. Nombre de la ocupación nueva',
      '2. Área de desempeño',
      '3. Nivel de cualificación',
      '4. Descripción',
      '5. Funciones',
      '6. Denominaciones ocupacionales',
      '7. Ocupaciones relacionadas',
      '8. Habilidades',
      '9. Conocimientos'
    ]);
    expect([component.draft.functions.length, component.draft.denominations.length, component.draft.relatedOccupations.length]).toEqual([3, 3, 2]);
    expect(compiled.querySelectorAll('#i3-area option').length).toBe(10);
    expect(compiled.querySelectorAll('#i3-level option').length).toBe(6);
    expect(compiled.querySelectorAll('#i3-sector option').length).toBe(32);
    expect(compiled.querySelectorAll('.i3-chips')[0].querySelectorAll('.i3-chip').length).toBe(15);
    expect(compiled.querySelectorAll('.i3-chips')[1].querySelectorAll('.i3-chip').length).toBe(20);
    // Solo las tres primeras secciones llevan la casilla a la derecha; en las demás va debajo.
    expect(compiled.querySelectorAll('.i3-srow-ctrl').length).toBe(3);
    expect(compiled.querySelectorAll('.i3-scontent').length).toBe(6);
    expect(texts('.i3-note').map((note) => note?.split('.')[0])).toEqual(['Otras denominaciones', 'Otras ocupaciones', 'Otras habilidades', 'Otros conocimientos']);
    expect(texts('.i3-add')).toEqual(['+ Agregar función', '+ Agregar denominación', '+ Agregar ocupación relacionada']);
    const links = Array.from(compiled.querySelectorAll('.i3-references a')) as HTMLAnchorElement[];
    expect(links.map((link) => clean(link.textContent))).toEqual(['1. Glosario y estructura gramatical', '2. Nivel de cualificación', '3. Listado de habilidades', '4. Listado de conocimientos']);
    expect(links.every((link) => link.target === '_blank' && link.rel === 'noopener noreferrer')).toBeTrue();

    // Como el original: solo Guardar y Enviar al experto, sin pestañas ni lista de propuestas.
    expect(texts('.i3-actions-buttons button')).toEqual(['Guardar', 'Enviar al experto']);
    expect(compiled.querySelector('.i3-tabs, .i3-saved')).toBeNull();
  });

  it('should fill the general data with what the server remembers of who is signed in, keeping the date of today', async () => {
    service.remembered = { fullName: 'Ana Ríos', email: 'ana@sena.edu.co', phone: '3001234567', department: 'antioquia', municipality: '05001', organization: 'SENA', position: 'Analista', profession: '', sector: 'salud' };
    component.ngOnInit();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.draft.date).toBe(todayAsInputDate());
    expect((compiled.querySelector('#i3-name') as HTMLInputElement).value).toBe('Ana Ríos');
    expect((compiled.querySelector('#i3-email') as HTMLInputElement).value).toBe('ana@sena.edu.co');
    expect(component.draft).toEqual(jasmine.objectContaining({ phone: '3001234567', department: 'antioquia', municipality: '05001', organization: 'SENA', position: 'Analista', profession: '', sector: 'salud' }));
    // La propuesta en sí sigue en blanco.
    expect(component.draft.occupationName).toBe('');
  });

  it('should offer the municipalities of the chosen department only', async () => {
    expect(component.departments.length).toBe(33);
    const municipality = compiled.querySelector('#i3-municipality') as HTMLSelectElement;
    await fixture.whenStable();
    expect(municipality.disabled).toBeTrue();
    expect(municipality.options[0].textContent).toBe('Seleccione primero un departamento');

    component.draft.department = 'amazonas';
    component.draft.municipality = '91001';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(municipality.disabled).toBeFalse();
    expect(Array.from(municipality.options).map((option) => option.textContent)).toContain('Leticia');
    expect(municipality.options[0].textContent).toBe('Seleccione municipio');

    // Otro departamento: el municipio elegido deja de valer.
    component.draft.department = 'antioquia';
    component.onDepartmentChange();
    expect(component.draft.municipality).toBe('');
    expect(component.municipalities.some((option) => option.label === 'Medellín')).toBeTrue();
  });

  it('should add and remove boxes, keeping at least one, and mark skills and knowledge', () => {
    button('Agregar función').click();
    fixture.detectChanges();
    expect(component.draft.functions.length).toBe(4);
    expect(compiled.querySelectorAll('.i3-item textarea').length).toBe(4);

    // Sección 7 (ocupaciones relacionadas): con una sola casilla no se puede quitar.
    component.draft.relatedOccupations = ['3311 - Auxiliares'];
    fixture.detectChanges();
    const related = compiled.querySelectorAll('.i3-section')[6];
    expect(related.querySelectorAll('.i3-item').length).toBe(1);
    expect((related.querySelector('.i3-remove') as HTMLButtonElement).disabled).toBeTrue();
    component.removeItem('relatedOccupations', 0);
    expect(component.draft.relatedOccupations).toEqual(['3311 - Auxiliares']);

    component.draft.denominations = ['a', 'b', 'c'];
    component.removeItem('denominations', 1);
    expect(component.draft.denominations).toEqual(['a', 'c']);

    const chip = compiled.querySelector('.i3-chip input') as HTMLInputElement;
    chip.click();
    fixture.detectChanges();
    expect(component.draft.skills).toEqual(['Comunicación asertiva']);
    expect(compiled.querySelector('.i3-chip')?.classList.contains('on')).toBeTrue();
    chip.click();
    expect(component.draft.skills).toEqual([]);
    component.toggleChoice('knowledge', 'Idiomas');
    expect(component.draft.knowledge).toEqual(['Idiomas']);
  });

  it('should save a draft with just the occupation name, and keep updating that same proposal', fakeAsync(() => {
    const save = spyOn(service, 'save').and.callThrough();
    spyOn(toastService, 'warning');
    spyOn(toastService, 'success');
    const before = service.stored().length;
    button('Guardar').click();
    expect(toastService.warning).toHaveBeenCalledWith('Escribe al menos el nombre de la ocupación nueva para guardar el borrador.');
    expect(save).not.toHaveBeenCalled();

    component.draft.occupationName = 'Operadores de telemedicina';
    button('Guardar').click();
    refresh(MOCK_LATENCY_MS);
    expect(save).toHaveBeenCalledWith(component.draft, null);
    expect(toastService.success).toHaveBeenCalledWith('Borrador guardado correctamente.');
    // El formulario conserva lo escrito.
    expect(component.draft.occupationName).toBe('Operadores de telemedicina');

    component.draft.description = 'Con descripción';
    component.save();
    refresh(MOCK_LATENCY_MS);
    // El segundo "Guardar" actualiza la misma propuesta en vez de crear otra.
    expect(save.calls.mostRecent().args[1]).toBe(component.savedId);
    expect(service.stored().length).toBe(before + 1);
    expect(service.stored().at(-1)).toEqual(jasmine.objectContaining({ state: 'BORRADOR', occupationName: 'Operadores de telemedicina', description: 'Con descripción' }));
  }));

  it('should require the mandatory fields before sending, then ask, send to the expert and clear the form', fakeAsync(() => {
    const send = spyOn(service, 'saveAndSend').and.callThrough();
    spyOn(toastService, 'warning');
    spyOn(toastService, 'success');
    component.draft.fullName = 'Ana Ríos';
    component.draft.email = 'no-es-correo';
    button('Enviar al experto').click();
    fixture.detectChanges();

    expect(toastService.warning).toHaveBeenCalledWith('Completa los campos obligatorios antes de enviar al experto.');
    expect(component.missing).toEqual(['email', 'occupationName', 'area', 'level', 'description']);
    expect(Array.from(compiled.querySelectorAll('.invalid')).map((field) => field.id)).toEqual(['i3-email', 'i3-occupation', 'i3-area', 'i3-level', 'i3-description']);
    expect(text('.i3-actions-note')).toContain('Faltan campos obligatorios');
    expect(component.confirmSend).toBeFalse();

    fillRequired();
    button('Enviar al experto').click();
    fixture.detectChanges();
    expect(text('app-confirm-dialog')).toContain('"Operadores de telemedicina" quedará en manos del experto');
    expect(send).not.toHaveBeenCalled();

    component.send();
    refresh(MOCK_LATENCY_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(toastService.success).toHaveBeenCalledWith('Propuesta enviada al experto correctamente.');
    expect(service.stored().at(-1)).toEqual(jasmine.objectContaining({ state: 'ENVIADO_EXPERTO', occupationName: 'Operadores de telemedicina', fullName: 'Ana Ríos' }));
    // El formulario queda listo para la siguiente propuesta: en blanco, con los datos generales de quien la diligenció.
    expect(component.savedId).toBeNull();
    expect(component.draft).toEqual({ ...createEmptyDraft(), fullName: 'Ana Ríos', email: 'ana@sena.edu.co' });
    expect(compiled.querySelector('app-confirm-dialog')).toBeNull();
    expect(compiled.querySelector('.invalid')).toBeNull();
  }));

  it('should send the draft already saved instead of creating a second proposal', fakeAsync(() => {
    const send = spyOn(service, 'saveAndSend').and.callThrough();
    const before = service.stored().length;
    fillRequired();
    component.save();
    refresh(MOCK_LATENCY_MS);
    const savedId = component.savedId;
    expect(savedId).not.toBeNull();

    component.requestSend();
    component.send();
    refresh(MOCK_LATENCY_MS);
    expect(send).toHaveBeenCalledWith(jasmine.objectContaining({ occupationName: 'Operadores de telemedicina' }), savedId);
    expect(service.stored().length).toBe(before + 1);
  }));

  it('should explain when the server refuses the data, keeping what was written', fakeAsync(() => {
    spyOn(toastService, 'error');
    component.draft.occupationName = 'Operadores de telemedicina';
    component.draft.email = 'no-es-correo';
    component.save();
    refresh(MOCK_LATENCY_MS);
    expect(toastService.error).toHaveBeenCalledWith('El servidor no aceptó los datos. Revisa el correo y los demás campos.');
    expect(component.saving).toBeFalse();
    expect(component.draft.occupationName).toBe('Operadores de telemedicina');
    expect(component.savedId).toBeNull();

    // Reglas del modelo que usa la vista.
    expect(missingFields(createEmptyDraft())).toEqual(['fullName', 'email', 'occupationName', 'area', 'level', 'description']);
    expect(createEmptyDraft().date).toBe(todayAsInputDate());
  }));
});
