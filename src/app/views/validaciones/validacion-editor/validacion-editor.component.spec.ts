/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PROJECT_STORAGE_PREFIX } from '../../../proyecto/config';
import { comboChoices, comboPick } from '../../../shared/ui/filter-combobox.testing';
import { AUTO_SAVE_DELAY_MS, ValidacionEditorComponent } from './validacion-editor.component';
import { ValidacionesService } from '../validaciones.service';
import { FakeValidacionesService, createTestRecords } from '../validaciones.testing';

describe('ValidacionEditorComponent', () => {
  let fixture: ComponentFixture<ValidacionEditorComponent>;
  let comp: ValidacionEditorComponent;
  let el: HTMLElement;
  let fake: FakeValidacionesService;

  // El catálogo de departamentos se carga aparte: se trae antes, fuera del reloj simulado.
  beforeAll(async () => {
    await import('../../instrumento-3/geografia');
  });

  /** Borra los comentarios que el editor respalda en el navegador, para que no pasen de una prueba a otra. */
  function clearNotes(): void {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(`${PROJECT_STORAGE_PREFIX}_validacion_notas_`))
      .forEach((key) => localStorage.removeItem(key));
  }

  beforeEach(clearNotes);
  afterEach(clearNotes);

  function render(): void {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  function open(index: number): void {
    TestBed.configureTestingModule({ imports: [ValidacionEditorComponent] });
    fake = TestBed.inject(ValidacionesService) as unknown as FakeValidacionesService;
    fixture = TestBed.createComponent(ValidacionEditorComponent);
    comp = fixture.componentInstance;
    comp.record = createTestRecords()[index];
    el = fixture.nativeElement;
    render();
    tick(10);
  }

  const gradeAll = (grade: 'aplica' | 'no_aplica') => {
    for (const item of comp.allItems) {
      comp.setGrade(item, grade);
    }
  };

  /** Datos generales completos: el servidor los exige para cerrar un Instrumento 2. */
  const fillInformant = () => {
    comp.informant = {
      fullName: 'SENA Admin',
      email: 'admin@sena.edu.co',
      phone: '3000000001',
      department: 'Antioquia',
      municipality: 'Medellín',
      company: 'SENA',
      position: 'Instructor',
      profession: 'Ingeniero'
    };
  };

  it('lists the occupations with their progress and opens on Datos generales', fakeAsync(() => {
    open(1);
    expect(el.querySelector('#vx-title')?.textContent).toContain('Validación de 2 ocupaciones');
    expect(Array.from(el.querySelectorAll('.vx-occupation .vx-progress')).map((node) => node.textContent?.trim())).toEqual(['0/5', '0/2']);
    expect((el.querySelector('#vx-fullName') as HTMLInputElement).value).toBe('SENA Admin');
    expect(el.querySelector('.vx-pending')?.textContent).toContain('7 sin calificar');
  }));

  it('shows each item as one row (title | Opción | Comentario) and asks for the comment of «Con propuesta de mejora»', fakeAsync(() => {
    open(1);
    comp.selectSection('functions');
    render();
    // Como la referencia de Paola: un recuadro «5. Funciones» y en él cada elemento numerado, con su código y su texto.
    const texts = (selector: string) => Array.from(el.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
    expect(texts('.vx-group-title')).toEqual(['5. Funciones']);
    expect(texts('.vx-group .vx-item-number')).toEqual(['1', '2']);
    expect(texts('.vx-group .vx-item-code')).toEqual(['F-2126.01', 'F-2126.02']);
    expect(texts('.vx-group .vx-item-text')).toEqual(['Diseñar sistemas de producción sostenibles.', 'Asesorar a productores.']);
    expect(texts('.vx-item-comment .vx-item-head')[0]).toBe('Comentario (opcional)');
    expect(el.querySelector('.vx-item-title')).toBeNull();
    expect(el.querySelector('.vx-section-panel .vx-tag')?.textContent).toContain('0 de 2 calificados');
    const [first] = comp.sectionItems;
    const gradeId = `vx-grade-${first.id}`;
    // Solo tres calificaciones: «Requiere ajuste» ya no se ofrece.
    expect(comboChoices(fixture, gradeId)).toEqual(['-- Seleccione', 'Aplica', 'No aplica', 'Con propuesta de mejora']);
    expect((el.querySelector('.vx-item-comment textarea') as HTMLTextAreaElement).placeholder).toBe('Comentario (opcional)');

    // Cada calificación con su color; el campo toma el de la elegida.
    el.querySelector<HTMLButtonElement>(`#${CSS.escape(gradeId)}`)!.click();
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll(`#${CSS.escape(gradeId)}-list .fc-option`)).map((node) => node.className.match(/fc-tone-\w+/)?.[0] ?? '')).toEqual([
      '',
      'fc-tone-ok',
      'fc-tone-error',
      'fc-tone-info'
    ]);
    el.querySelector<HTMLButtonElement>(`#${CSS.escape(gradeId)}`)!.click();
    comboPick(fixture, gradeId, 'propuesta_mejora');
    expect(comp.gradeOf(first).grade).toBe('propuesta_mejora');
    expect(el.querySelector(`#${CSS.escape(gradeId)}`)?.classList).toContain('fc-tone-info');
    expect((el.querySelector('.vx-item-comment textarea') as HTMLTextAreaElement).placeholder).toContain('Detalle la propuesta de mejora');
    expect(el.querySelector('.vx-item-comment .vx-required')).toBeTruthy();
    expect(comp.doneOf(comp.review!.occupations[0])).toBe(0);
    comp.setDetail(first, 'Precisar el alcance');
    expect(comp.doneOf(comp.review!.occupations[0])).toBe(1);
  }));

  it('limits the free texts to 1000 characters and shows how many are written', fakeAsync(() => {
    open(1);
    const observations = el.querySelector('#vx-observations') as HTMLTextAreaElement;
    expect(observations.maxLength).toBe(1000);
    // Como el ejemplo de Paola: «Máximo 1000 caracteres» a la izquierda y «0/1000» a la derecha.
    const limit = (id: string) => Array.from(el.querySelectorAll(`#${CSS.escape(id)} span`)).map((node) => node.textContent?.trim());
    expect(limit('vx-observations-count')).toEqual(['Máximo 1000 caracteres', '0/1000']);
    comp.observations = 'Revisar la redacción';
    render();
    expect(limit('vx-observations-count')[1]).toBe('20/1000');

    comp.selectSection('functions');
    render();
    const [first] = comp.sectionItems;
    const comment = el.querySelector(`#${CSS.escape(`vx-detail-${first.id}`)}`) as HTMLTextAreaElement;
    expect(comment.maxLength).toBe(1000);
    expect(comment.getAttribute('aria-describedby')).toBe(`vx-detail-count-${first.id}`);
    comp.setDetail(first, 'Precisar el alcance');
    render();
    expect(limit(`vx-detail-count-${first.id}`)).toEqual(['Máximo 1000 caracteres', '19/1000']);
    expect(limit('vx-observations-section-count')[1]).toBe('20/1000');
  }));

  it('keeps «Requiere ajuste» visible only on an item that was already saved with it', fakeAsync(() => {
    open(1);
    comp.selectSection('functions');
    render();
    const [first, second] = comp.sectionItems;
    comp.setGrade(first, 'requiere_ajuste');
    fixture.detectChanges();
    expect(comboChoices(fixture, `vx-grade-${first.id}`)).toEqual(['-- Seleccione', 'Aplica', 'No aplica', 'Con propuesta de mejora', 'Requiere ajuste']);
    expect(el.querySelector(`#${CSS.escape(`vx-grade-${first.id}`)}`)?.textContent?.trim()).toBe('Requiere ajuste');
    expect(comboChoices(fixture, `vx-grade-${second.id}`)).not.toContain('Requiere ajuste');
  }));

  it('saves progress with only what is graded, as «en_revision»', fakeAsync(() => {
    open(1);
    comp.setGrade(comp.review!.occupations[0].items[0], 'aplica');
    comp.saveProgress();
    tick();
    expect(fake.lastSave?.verdict).toBe('en_revision');
    expect(fake.lastSave?.items.map((item) => item.id)).toEqual(['2126::name']);
    expect(fake.lastSave?.items[0].field).toBe('name');
    expect(fake.lastSave?.proposals).toEqual([]);
  }));

  it('saves on its own after a pause and when changing section, keeping on screen what was written', fakeAsync(() => {
    open(1);
    const saved = spyOn(comp.saved, 'emit');
    const saveButton = () => Array.from(el.querySelectorAll('.vx-footer-actions button')).find((button) => /Guardar cambios|Cambios guardados|Guardando/.test(button.textContent ?? '')) as HTMLButtonElement;
    expect(saveButton().textContent?.trim()).toBe('Guardar cambios');

    const [first, second] = comp.review!.occupations[0].items;
    comp.setGrade(first, 'aplica');
    comp.setDetail(first, 'Bien redactado');
    tick(AUTO_SAVE_DELAY_MS - 1);
    expect(fake.lastSave).toBeNull();
    tick(1);
    render();
    expect(fake.lastSave?.verdict).toBe('en_revision');
    expect(fake.lastSave?.items.map((item) => [item.id, item.grade, item.detail])).toEqual([['2126::name', 'aplica', 'Bien redactado']]);
    // Lo escrito sigue en pantalla, el botón dice que todo está guardado y la bandeja no se vuelve a pedir.
    expect(comp.gradeOf(first)).toEqual({ grade: 'aplica', detail: 'Bien redactado' });
    expect(saveButton().textContent?.trim()).toBe('Cambios guardados');
    expect(el.querySelector('.vx-feedback')?.textContent).toContain('guardados automáticamente');
    expect(saved).not.toHaveBeenCalled();

    // Cambiar de sección guarda enseguida lo pendiente.
    comp.setGrade(second, 'no_aplica');
    expect(saveButton().textContent?.trim()).toBe('Cambios guardados');
    render();
    expect(saveButton().textContent?.trim()).toBe('Guardar cambios');
    comp.selectSection('functions');
    tick();
    expect(fake.lastSave?.items.map((item) => item.id)).toEqual(['2126::name', '2126::description']);
  }));

  it('saves what is pending when closing, and keeps the comments of items not graded yet for the next time', fakeAsync(() => {
    open(1);
    const closed = spyOn(comp.closed, 'emit');
    const [first, second] = comp.review!.occupations[0].items;
    comp.setGrade(first, 'aplica');
    // Comentario sin «Opción»: el servidor no lo recibe, pero no se pierde.
    comp.setDetail(second, 'Revisar la redacción');
    comp.requestClose();
    tick();
    expect(comp.confirmCloseOpen).toBeFalse();
    expect(closed).toHaveBeenCalled();
    expect(fake.lastSave?.items.map((item) => item.id)).toEqual(['2126::name']);

    // Al volver a abrir (el servidor solo trae lo calificado) el comentario reaparece en su ítem.
    fixture.destroy();
    const again = TestBed.createComponent(ValidacionEditorComponent);
    again.componentInstance.record = createTestRecords()[1];
    again.detectChanges();
    tick(10);
    const reopened = again.componentInstance;
    expect(reopened.gradeOf(reopened.review!.occupations[0].items[1])).toEqual({ grade: '', detail: 'Revisar la redacción' });
    expect(reopened.gradeOf(reopened.review!.occupations[0].items[0]).grade).toBe('');
    again.destroy();
  }));

  it('sends the area and description the expert proposes for an occupation, only what changed', fakeAsync(() => {
    open(1);
    comp.selectSection('info');
    render();
    expect(el.querySelector('.vx-editable')).toBeTruthy();
    comp.adjustment.description = 'Estudian y diseñan agroecosistemas.';
    comp.saveProgress();
    tick();
    expect(fake.lastSave?.proposals).toEqual([{ occupationCode: '2126', description: 'Estudian y diseñan agroecosistemas.' }]);
  }));

  it('asks for every informant field before sending an Instrument 2', fakeAsync(() => {
    open(1);
    gradeAll('aplica');
    comp.requestSend();
    tick(10);
    expect(comp.confirmSendOpen).toBeFalse();
    expect(comp.section).toBe('general');
    expect(comp.feedback).toBe('Completa todos los datos generales del informante antes de enviar.');
  }));

  it('does not send while something is pending and takes you to it', fakeAsync(() => {
    open(1);
    fillInformant();
    comp.setGrade(comp.review!.occupations[0].items[0], 'aplica');
    comp.requestSend();
    tick(10);
    expect(comp.confirmSendOpen).toBeFalse();
    expect(comp.section).toBe('info');
    expect(comp.feedback).toContain('Quedan 6 elementos sin calificar');
    expect(fake.lastSave).toBeNull();
  }));

  it('derives «ajustes_solicitados» when an item does not apply, and «aprobada» otherwise', fakeAsync(() => {
    open(1);
    fillInformant();
    gradeAll('aplica');
    comp.setGrade(comp.allItems[2], 'no_aplica');
    comp.requestSend();
    expect(comp.confirmSendOpen).toBeTrue();
    expect(comp.verdict).toBe('ajustes_solicitados');
    comp.confirmSend();
    tick();
    expect(fake.lastSave?.verdict).toBe('ajustes_solicitados');
    expect(fake.lastSave?.items.length).toBe(7);
    expect(fake.records.find((record) => record.id === 4)?.state).toBe('edited');
  }));

  it('is read-only when the analyst got the adjustments back (the server no longer takes validations)', fakeAsync(() => {
    open(0);
    expect(comp.editable).toBeFalse();
  }));

  it('is read-only once the validation was sent approved', fakeAsync(() => {
    open(3);
    expect(comp.editable).toBeFalse();
    expect(el.querySelector('.vx-footer-actions')).toBeNull();
    expect(el.querySelector('.vx-readonly')).toBeTruthy();
  }));
});
